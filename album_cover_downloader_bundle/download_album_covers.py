#!/usr/bin/env python3
import csv
import difflib
import hashlib
import json
import os
import re
import shutil
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

INPUT_DEFAULT = 'sscdbg(2).json'
OUT_DIR = Path('album_covers_result')
COVERS_DIR = OUT_DIR / 'covers'
MATCHES_CSV = OUT_DIR / 'matches.csv'
UNMATCHED_CSV = OUT_DIR / 'unmatched.csv'
OUTPUT_JSON = OUT_DIR / 'sscdbg_with_covers.json'
OUTPUT_ZIP = Path('album_covers_result.zip')

SEARCH_ENDPOINT = 'https://itunes.apple.com/search'
USER_AGENT = 'Mozilla/5.0 (album-cover-archiver/1.0)'

BAD_COLLECTION_WORDS = [
    'greatest hits', 'best of', 'karaoke', 'tribute', 'cover version',
    'live at', 'live from', 'remix collection', 'compilation'
]


def norm(s):
    s = str(s or '')
    s = unicodedata.normalize('NFKD', s)
    s = ''.join(ch for ch in s if not unicodedata.combining(ch))
    s = s.casefold().replace('&', ' and ')
    s = re.sub(r'\([^)]*[가-힣][^)]*\)', ' ', s)
    s = re.sub(r'[^\w]+', ' ', s, flags=re.UNICODE)
    return ' '.join(s.split())


def ascii_slug(s, maxlen=70):
    raw = unicodedata.normalize('NFKD', str(s or ''))
    raw = ''.join(ch for ch in raw if not unicodedata.combining(ch))
    raw = raw.encode('ascii', 'ignore').decode('ascii').lower()
    raw = re.sub(r'[^a-z0-9]+', '-', raw).strip('-')
    return (raw[:maxlen].strip('-') or 'release')


def similarity(a, b):
    a, b = norm(a), norm(b)
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return difflib.SequenceMatcher(None, a, b).ratio()


def title_variants(title):
    vals = [str(title).strip()]
    # Remove Korean explanatory parenthetical while preserving official Latin subtitles.
    no_ko = re.sub(r'\s*\([^)]*[가-힣][^)]*\)\s*', ' ', str(title)).strip()
    if no_ko and no_ko not in vals:
        vals.append(no_ko)
    # If title begins with native script and has a romanized title in parentheses, try both.
    m = re.search(r'\(([^()]*)\)', str(title))
    if m and m.group(1).strip() and m.group(1).strip() not in vals:
        vals.append(m.group(1).strip())
    return vals


def artist_variants(artists):
    vals = []
    for a in artists:
        a = str(a).strip()
        if not a:
            continue
        vals.append(a)
        # Prefer romanized text before or inside parentheses where available.
        latin = re.sub(r'[^A-Za-z0-9 .&!\'_-]+', ' ', a)
        latin = ' '.join(latin.split()).strip(' -')
        if len(latin) >= 2 and latin not in vals:
            vals.append(latin)
    return vals


def fetch_json(url, timeout=20):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return json.loads(r.read().decode('utf-8'))


def search_itunes(title, artists, country):
    # A few query shapes improve recall on multilingual titles.
    primary_artist = next((str(a).strip() for a in artists if str(a).strip()), '')
    queries = []
    for tv in title_variants(title)[:3]:
        queries.append(f'{primary_artist} {tv}'.strip())
    for av in artist_variants(artists)[:2]:
        queries.append(f'{av} {title_variants(title)[0]}'.strip())

    seen = set()
    results = []
    for q in queries:
        if q in seen:
            continue
        seen.add(q)
        params = urllib.parse.urlencode({
            'term': q,
            'entity': 'song',
            'limit': 30,
            'country': country,
        })
        url = SEARCH_ENDPOINT + '?' + params
        try:
            data = fetch_json(url)
            results.extend(data.get('results', []))
        except Exception:
            continue
        if results:
            break
        time.sleep(0.15)
    # de-duplicate track IDs
    unique = {}
    for r in results:
        unique[r.get('trackId') or (r.get('artistName'), r.get('trackName'), r.get('collectionName'))] = r
    return list(unique.values())


def score_candidate(song, cand):
    title = song.get('title', '')
    artists = [a for a in song.get('artist', []) if str(a).strip()]
    tscore = max(similarity(tv, cand.get('trackName', '')) for tv in title_variants(title))

    cand_artist = cand.get('artistName', '')
    ascores = [similarity(av, cand_artist) for av in artist_variants(artists)]
    ascore = max(ascores) if ascores else 0.0

    # Token containment bonus helps collaborations where Apple lists a shortened artist string.
    artist_norm = norm(cand_artist)
    contain = 0.0
    for a in artists:
        an = norm(a)
        if an and (an in artist_norm or artist_norm in an):
            contain = max(contain, 1.0)
    ascore = max(ascore, contain)

    score = 0.68 * tscore + 0.32 * ascore

    collection = norm(cand.get('collectionName', ''))
    if any(w in collection for w in BAD_COLLECTION_WORDS):
        score -= 0.08
    if cand.get('kind') != 'song':
        score -= 0.2
    return score, tscore, ascore


def choose_match(song):
    countries = []
    for c in song.get('countries', []):
        c = str(c).upper().strip()
        if len(c) == 2 and c not in countries:
            countries.append(c)
    for c in ['US', 'GB', 'DE', 'JP']:
        if c not in countries:
            countries.append(c)

    all_candidates = []
    for country in countries[:5]:
        cands = search_itunes(song.get('title', ''), song.get('artist', []), country)
        all_candidates.extend(cands)
        if cands:
            ranked = sorted((score_candidate(song, c) + (c,) for c in cands), key=lambda x: x[0], reverse=True)
            if ranked and ranked[0][0] >= 0.82 and ranked[0][1] >= 0.82 and ranked[0][2] >= 0.55:
                break
        time.sleep(0.12)

    if not all_candidates:
        return None, None
    ranked = sorted((score_candidate(song, c) + (c,) for c in all_candidates), key=lambda x: x[0], reverse=True)
    best = ranked[0]
    score, tscore, ascore, cand = best
    # Conservative threshold: ambiguous matches go to unmatched.csv instead of saving wrong art.
    if score < 0.74 or tscore < 0.76 or ascore < 0.42:
        return None, {'score': score, 'title_score': tscore, 'artist_score': ascore, 'candidate': cand}
    return cand, {'score': score, 'title_score': tscore, 'artist_score': ascore}


def art_1000(url):
    if not url:
        return None
    return re.sub(r'/\d+x\d+bb\.', '/1000x1000bb.', url)


def download(url, dest):
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    with urllib.request.urlopen(req, timeout=30) as r, open(dest, 'wb') as f:
        shutil.copyfileobj(r, f)


def release_filename(cand):
    artist = cand.get('artistName') or cand.get('collectionArtistName') or 'artist'
    album = cand.get('collectionName') or cand.get('trackName') or 'release'
    cid = cand.get('collectionId') or cand.get('trackId') or 0
    return f'{ascii_slug(artist, 55)}__{ascii_slug(album, 70)}__{cid}.jpg'


def main():
    input_path = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(INPUT_DEFAULT)
    if not input_path.exists():
        print(f'Input JSON not found: {input_path}')
        print('Usage: python download_album_covers.py "your_file.json"')
        sys.exit(2)

    with open(input_path, 'r', encoding='utf-8') as f:
        songs = json.load(f)

    OUT_DIR.mkdir(exist_ok=True)
    COVERS_DIR.mkdir(exist_ok=True)

    matches = []
    unmatched = []
    cache = {}  # collectionId/art URL -> relative cover path
    duplicate_song_cache = {}  # title+artists -> result

    eligible = [s for s in songs if any(str(a).strip() for a in s.get('artist', []))]
    print(f'Total entries: {len(songs)}')
    print(f'Eligible (artist present): {len(eligible)}')
    print('Blank-artist folk/classical entries will be skipped.\n')

    for idx, song in enumerate(eligible, 1):
        title = song.get('title', '')
        artists = [str(a).strip() for a in song.get('artist', []) if str(a).strip()]
        key = (norm(title), tuple(norm(a) for a in artists))
        print(f'[{idx}/{len(eligible)}] {title} - {", ".join(artists)}')

        if key in duplicate_song_cache:
            cached = duplicate_song_cache[key]
            if cached:
                song['cover'] = cached['cover']
                song['coverAlbum'] = cached['album']
                song['coverArtist'] = cached['artist']
                matches.append({**cached['row'], 'note': 'duplicate song entry; reused'})
            continue

        try:
            cand, meta = choose_match(song)
        except Exception as e:
            unmatched.append({'title': title, 'artist': ', '.join(artists), 'reason': f'search error: {e}'})
            print('  -> search error')
            continue

        if not cand:
            reason = 'no confident match'
            if meta and meta.get('candidate'):
                c = meta['candidate']
                reason += f"; best={c.get('artistName','')} - {c.get('trackName','')} [{meta.get('score',0):.2f}]"
            unmatched.append({'title': title, 'artist': ', '.join(artists), 'reason': reason})
            print('  -> unmatched')
            continue

        art = art_1000(cand.get('artworkUrl100'))
        if not art:
            unmatched.append({'title': title, 'artist': ', '.join(artists), 'reason': 'matched track has no artwork URL'})
            print('  -> no artwork')
            continue

        cache_key = str(cand.get('collectionId') or art)
        if cache_key in cache:
            rel = cache[cache_key]
        else:
            fn = release_filename(cand)
            dest = COVERS_DIR / fn
            try:
                download(art, dest)
            except Exception:
                # Fallback to Apple-provided smaller art if 1000 URL is unavailable.
                try:
                    download(cand.get('artworkUrl100'), dest)
                except Exception as e:
                    unmatched.append({'title': title, 'artist': ', '.join(artists), 'reason': f'art download failed: {e}'})
                    print('  -> artwork download failed')
                    continue
            rel = 'covers/' + fn
            cache[cache_key] = rel

        song['cover'] = rel
        song['coverAlbum'] = cand.get('collectionName', '')
        song['coverArtist'] = cand.get('artistName', '')
        row = {
            'title': title,
            'artist': ', '.join(artists),
            'matched_track': cand.get('trackName', ''),
            'matched_artist': cand.get('artistName', ''),
            'album': cand.get('collectionName', ''),
            'release_date': cand.get('releaseDate', ''),
            'score': f"{meta['score']:.3f}",
            'cover': rel,
            'apple_url': cand.get('trackViewUrl', ''),
            'note': ''
        }
        matches.append(row)
        duplicate_song_cache[key] = {
            'cover': rel,
            'album': cand.get('collectionName', ''),
            'artist': cand.get('artistName', ''),
            'row': row,
        }
        print(f"  -> {cand.get('collectionName','')} | {rel}")
        time.sleep(0.10)

    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(songs, f, ensure_ascii=False, indent=2)

    match_fields = ['title', 'artist', 'matched_track', 'matched_artist', 'album', 'release_date', 'score', 'cover', 'apple_url', 'note']
    with open(MATCHES_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=match_fields)
        w.writeheader()
        w.writerows(matches)

    with open(UNMATCHED_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=['title', 'artist', 'reason'])
        w.writeheader()
        w.writerows(unmatched)

    if OUTPUT_ZIP.exists():
        OUTPUT_ZIP.unlink()
    with zipfile.ZipFile(OUTPUT_ZIP, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for p in OUT_DIR.rglob('*'):
            if p.is_file():
                z.write(p, p.as_posix())

    print('\nDone.')
    print(f'Matched rows: {len(matches)}')
    print(f'Unmatched rows: {len(unmatched)}')
    print(f'Unique cover files: {len(list(COVERS_DIR.glob("*.jpg")))}')
    print(f'ZIP: {OUTPUT_ZIP.resolve()}')
    print('Review unmatched.csv and low-score matches.csv rows before publishing.')


if __name__ == '__main__':
    main()
