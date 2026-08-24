// -------------------------------------
// 앨범 아트 (iTunes Search API 자동 매칭 + 수동 등록 우선)
// -------------------------------------
//
// 우선순위:
//   1. song.image (sscdbg.json에 수동으로 등록된 이미지 URL)
//   2. localStorage 캐시 (이전에 iTunes에서 찾은 결과, 못 찾은 기록도 캐시됨)
//   3. iTunes Search API 자동 조회
//
// iTunes Search API는 공개 API이며 대략 분당 20회 정도로 제한되어 있어서,
// 짧은 시간에 너무 많은 곡을 한꺼번에 열람하더라도 문제가 없도록
// 요청을 순차 큐로 처리하고 결과를 캐싱합니다.

const ITUNES_CACHE_PREFIX = "sscweb:albumArt:v1:";
let ITUNES_MIN_INTERVAL_MS = 3200; // 분당 약 20회 제한에 여유를 둔 간격

let itunesQueue = [];
let itunesQueueRunning = false;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// iTunes 요청을 순서대로, 간격을 두고 하나씩 처리
function enqueueItunesRequest(task) {
  return new Promise(resolve => {
    itunesQueue.push({ task, resolve });
    runItunesQueue();
  });
}

async function runItunesQueue() {
  if (itunesQueueRunning) return;
  itunesQueueRunning = true;

  while (itunesQueue.length > 0) {
    const { task, resolve } = itunesQueue.shift();

    let result = null;
    try {
      result = await task();
    } catch (error) {
      console.warn("iTunes 요청 처리 중 오류:", error);
    }

    resolve(result);

    if (itunesQueue.length > 0) {
      await sleep(ITUNES_MIN_INTERVAL_MS);
    }
  }

  itunesQueueRunning = false;
}

// -------------------------------------
// 캐시
// -------------------------------------

function albumArtCacheKey(song) {
  const artistKey = (song.artist || []).join(",");
  return `${ITUNES_CACHE_PREFIX}${song.title}::${artistKey}`;
}

function readAlbumArtCache(song) {
  try {
    const raw = localStorage.getItem(albumArtCacheKey(song));
    if (raw === null) return undefined; // 캐시된 적 없음

    const parsed = JSON.parse(raw);
    return parsed; // { url: string|null, cachedAt: number }
  } catch (error) {
    return undefined;
  }
}

function writeAlbumArtCache(song, url) {
  try {
    localStorage.setItem(
      albumArtCacheKey(song),
      JSON.stringify({ url, cachedAt: Date.now() })
    );
  } catch (error) {
    // localStorage를 못 쓰는 환경(용량 초과, 시크릿 모드 등)이어도
    // 앨범 아트는 부가 기능이므로 조용히 무시
  }
}

// -------------------------------------
// iTunes Search API
// -------------------------------------

// iTunes 아트워크는 기본 100x100으로 오는데, URL 패턴을 바꿔서
// 더 큰 해상도(600x600)를 요청할 수 있음
function upscaleArtworkUrl(url) {
  if (!url) return url;
  return url.replace(
    /\/\d+x\d+(bb)?(-\d+)?\.(jpg|jpeg|png)/i,
    "/600x600bb.$3"
  );
}

async function requestItunesArtwork(song) {
  const query = [song.title, song.artist?.[0]]
    .filter(Boolean)
    .join(" ");

  const url =
    "https://itunes.apple.com/search?" +
    new URLSearchParams({
      term: query,
      entity: "song",
      limit: "1",
    }).toString();

  const response = await fetch(url);

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const result = data.results && data.results[0];

  if (!result || !result.artworkUrl100) {
    return null;
  }

  return upscaleArtworkUrl(result.artworkUrl100);
}

// -------------------------------------
// 공개 함수: 곡의 앨범 아트 URL을 가져옴
// -------------------------------------

// 같은 곡에 대해 아직 진행 중인 iTunes 요청이 있다면 중복으로 큐에 넣지 않고
// 그 요청 결과를 함께 기다림 (예: 같은 국가를 여러 경로로 빠르게 재방문하는 경우)
const pendingArtworkRequests = new Map();

async function getAlbumArtURL(song) {

  // 1. 수동 등록된 이미지가 항상 최우선
  if (song.image) {
    return song.image;
  }

  // 2. 캐시 확인 (null도 유효한 캐시 값 - "이전에 못 찾음")
  const cached = readAlbumArtCache(song);
  if (cached !== undefined) {
    return cached.url;
  }

  // 3. 이미 같은 곡을 조회 중이라면 그 요청에 합류
  const key = albumArtCacheKey(song);

  if (pendingArtworkRequests.has(key)) {
    return pendingArtworkRequests.get(key);
  }

  // 4. iTunes 자동 조회 (큐를 통해 순차적으로)
  const requestPromise = enqueueItunesRequest(() =>
    requestItunesArtwork(song)
  ).then(url => {
    writeAlbumArtCache(song, url);
    pendingArtworkRequests.delete(key);
    return url;
  });

  pendingArtworkRequests.set(key, requestPromise);

  return requestPromise;
}

// -------------------------------------
// DOM에 앨범 아트 채우기
// -------------------------------------

async function loadArtworkInto(el, song) {
  if (!el) return;

  const url = await getAlbumArtURL(song);

  // 비동기로 처리되는 동안 el이 DOM에서 사라졌을 수도 있으므로 안전하게 처리
  el.classList.remove("placeholder");

  if (!url) {
    el.classList.add("no-artwork");
    return;
  }

  const img = document.createElement("img");
  img.src = url;
  img.alt = "";
  img.loading = "lazy";
  img.decoding = "async";

  img.addEventListener("error", () => {
    el.classList.add("no-artwork");
    img.remove();
  });

  el.appendChild(img);
}
