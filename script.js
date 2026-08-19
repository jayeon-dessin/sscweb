let songs = [];
let selectedCountry = null;
let isRestoringState = false;

const artistFilter = document.getElementById("artist-filter");
const languageFilter = document.getElementById("language-filter");
const songList = document.getElementById("song-list");
const tagSearch = document.getElementById("tag-search");
const countryView = document.getElementById("country-view");
const countryList = document.getElementById("country-list");
const songsView = document.getElementById("songs-view");
const countryTitle = document.getElementById("country-title");
const countrySort = document.getElementById("country-sort");
const backButton = document.getElementById("back-to-countries");
const resultContext = document.getElementById("result-context");
const randomSongSection = document.getElementById("random-song");

const decorativeFlags = [
  "KR", "AF", "DZ", "AR", "AU", "AT", "BD", "BY", "BE", "BJ", "BO",
  "BA", "BR", "BG", "CV", "CM", "CA", "CL", "CN", "CO", "HR", "CU",
  "CD", "DK", "EG", "EE", "FJ", "FI", "FR", "GE", "DE", "GH", "GR",
  "HK", "IS", "IN", "ID", "IR", "IE", "IL", "IT", "JM", "JP", "KZ",
  "KE", "LB", "ML", "MX", "MD", "MN", "NL", "NZ", "NE", "NG", "KP",
  "NO", "PK", "PS", "PH", "PL", "PT", "PR", "RU", "SA", "RS", "SO",
  "ZA", "ES", "SE", "SY", "TW", "TH", "TT", "TN", "TR", "UA", "GB",
  "US", "VN"
];

const regionNames = new Intl.DisplayNames(["ko"], { type: "region" });

function getCountryName(code) {
  return regionNames.of(code) || code;
}

function escapeHTML(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function safeURL(value = "") {
  try {
    const url = new URL(value, location.href);
    return ["http:", "https:", "mailto:"].includes(url.protocol) ? url.href : "#";
  } catch {
    return "#";
  }
}

function normalizeSearchText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

function normalizeSong(song) {
  return {
    ...song,
    artist: Array.isArray(song.artist) ? song.artist : [song.artist].filter(Boolean),
    songwriters: Array.isArray(song.songwriters)
      ? song.songwriters
      : [song.songwriters].filter(Boolean),
    language: Array.isArray(song.language) ? song.language : [song.language].filter(Boolean),
    countries: Array.isArray(song.countries)
      ? song.countries
      : [song.countries].filter(Boolean),
    tags: Array.isArray(song.tags) ? song.tags : [],
    links: Array.isArray(song.links) ? song.links : [],
    youtube: Array.isArray(song.youtube) ? song.youtube : []
  };
}

fetch(`sscdbg.json?v=${Date.now()}`)
  .then(response => {
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
  })
  .then(data => {
    songs = data.map(normalizeSong);

    makeArtistFilter(songs);
    makeLanguageFilter(songs);
    renderArchiveStats();
    renderDecorativeFlags();
    renderCountries();
    renderRandomSong(getRandomSong(songs));
    restoreStateFromURL();
  })
  .catch(error => {
    console.error("JSON을 불러오는 중 오류:", error);
    document.getElementById("archive-stats").textContent = "아카이브를 불러오지 못했습니다.";
  });

function renderArchiveStats() {
  const countries = new Set(songs.flatMap(song => song.countries).filter(Boolean));
  document.getElementById("archive-stats").textContent =
    `${songs.length} TRACKS  ·  ${countries.size} PLACES`;
}

function renderDecorativeFlags() {
  const flagStrip = document.getElementById("flag-strip");
  flagStrip.innerHTML = decorativeFlags
    .map(code => `<span class="fi fi-${code.toLowerCase()}"></span>`)
    .join("");
}

function makeArtistFilter(songArray) {
  const current = artistFilter.value;
  const artists = [...new Set(songArray.flatMap(song => song.artist))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));

  artistFilter.innerHTML = [
    `<option value="all">전체</option>`,
    ...artists.map(artist =>
      `<option value="${escapeHTML(artist)}">${escapeHTML(artist)}</option>`
    )
  ].join("");

  if (artists.includes(current)) artistFilter.value = current;
}

function makeLanguageFilter(songArray) {
  const current = languageFilter.value;
  const languages = [...new Set(songArray.flatMap(song => song.language))]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, "ko"));

  languageFilter.innerHTML = [
    `<option value="all">전체</option>`,
    ...languages.map(language =>
      `<option value="${escapeHTML(language)}">${escapeHTML(language)}</option>`
    )
  ].join("");

  if (languages.includes(current)) languageFilter.value = current;
}

function getCountryCounts() {
  const counts = new Map();

  songs.forEach(song => {
    song.countries.forEach(code => {
      if (!code) return;
      counts.set(code, (counts.get(code) || 0) + 1);
    });
  });

  return counts;
}

function renderCountries() {
  selectedCountry = null;
  countryView.hidden = false;
  songsView.hidden = true;
  showRandomSong();

  const countryCounts = getCountryCounts();
  const countries = [...countryCounts.keys()];
  const sortMode = countrySort.value;

  countries.sort((a, b) => {
    if (sortMode === "count-desc") {
      return countryCounts.get(b) - countryCounts.get(a) ||
        getCountryName(a).localeCompare(getCountryName(b), "ko");
    }

    if (sortMode === "count-asc") {
      return countryCounts.get(a) - countryCounts.get(b) ||
        getCountryName(a).localeCompare(getCountryName(b), "ko");
    }

    return getCountryName(a).localeCompare(getCountryName(b), "ko");
  });

  countryList.innerHTML = countries.map(code => `
    <button class="country-card" type="button" data-country="${escapeHTML(code)}">
      <span class="country-flag fi fi-${code.toLowerCase()}"></span>
      <span class="country-card-bottom">
        <span class="country-name">${escapeHTML(getCountryName(code))}</span>
        <span class="country-count">${countryCounts.get(code)}곡</span>
      </span>
    </button>
  `).join("");
}

function selectCountry(code, { pushHistory = true, resetFilters = true } = {}) {
  selectedCountry = code;
  countryView.hidden = true;
  songsView.hidden = false;
  hideRandomSong();

  const countrySongs = songs.filter(song => song.countries.includes(code));

  makeArtistFilter(countrySongs);
  makeLanguageFilter(countrySongs);

  if (resetFilters) {
    artistFilter.value = "all";
    languageFilter.value = "all";
    tagSearch.value = "";
  }

  countryTitle.innerHTML = `
    <span class="country-inline">
      <span class="fi fi-${code.toLowerCase()}"></span>
      ${escapeHTML(getCountryName(code))}
    </span>
  `;
  resultContext.textContent = `${countrySongs.length}곡`;
  renderSongs(countrySongs);

  if (pushHistory) updateURLState(true);
}

function getFilteredSongs() {
  const selectedArtist = artistFilter.value;
  const selectedLanguage = languageFilter.value;
  const keyword = normalizeSearchText(tagSearch.value.trim());

  return songs.filter(song => {
    if (selectedCountry && !song.countries.includes(selectedCountry)) return false;
    if (selectedArtist !== "all" && !song.artist.includes(selectedArtist)) return false;
    if (selectedLanguage !== "all" && !song.language.includes(selectedLanguage)) return false;

    if (keyword) {
      const searchableText = [
        song.title,
        ...song.artist,
        ...song.songwriters,
        ...song.tags,
        song.memo
      ].map(normalizeSearchText).join(" ");

      if (!searchableText.includes(keyword)) return false;
    }

    return true;
  });
}

function applyFilters() {
  const hasFilter =
    artistFilter.value !== "all" ||
    languageFilter.value !== "all" ||
    tagSearch.value.trim() !== "";

  if (!selectedCountry && !hasFilter) {
    makeArtistFilter(songs);
    makeLanguageFilter(songs);
    renderCountries();
    updateURLState();
    return;
  }

  const filteredSongs = getFilteredSongs();
  countryView.hidden = true;
  songsView.hidden = false;
  hideRandomSong();

  if (selectedCountry) {
    countryTitle.innerHTML = `
      <span class="country-inline">
        <span class="fi fi-${selectedCountry.toLowerCase()}"></span>
        ${escapeHTML(getCountryName(selectedCountry))}
      </span>
    `;
  } else {
    countryTitle.textContent = "검색 결과";
  }

  resultContext.textContent = `${filteredSongs.length}곡`;
  renderSongs(filteredSongs);
  updateURLState();
}

function getRandomSong(songArray) {
  if (!songArray?.length) return null;

  const previousTitle = sessionStorage.getItem("previousRandomSong");
  let candidates = songArray.filter(song => song.title !== previousTitle);
  if (!candidates.length) candidates = songArray;

  const song = candidates[Math.floor(Math.random() * candidates.length)];
  sessionStorage.setItem("previousRandomSong", song.title);
  return song;
}

function countryMarkup(countries) {
  return countries.map(code => `
    <span class="country-inline">
      <span class="fi fi-${code.toLowerCase()}"></span>
      ${escapeHTML(getCountryName(code))}
    </span>
  `).join("");
}

function linksMarkup(song) {
  const links = [
    ...song.links.map(link => ({ ...link, type: "읽기" })),
    ...song.youtube.map(video => ({ ...video, type: "YouTube" }))
  ];

  return links.map(link => `
    <a class="link-chip" href="${safeURL(link.url)}" target="_blank" rel="noopener noreferrer">
      ${escapeHTML(link.title || link.type)} ↗
    </a>
  `).join("");
}

function tagsMarkup(tags) {
  return tags.map(tag => `
    <button type="button" class="tag-button" data-tag="${escapeHTML(tag)}">#${escapeHTML(tag)}</button>
  `).join("");
}

function renderRandomSong(song) {
  if (!song) return;

  randomSongSection.innerHTML = `
    <article class="spotlight-card">
      <div class="spotlight-top">
        <span class="spotlight-label">RANDOM PICK</span>
        <button type="button" id="random-song-button">다른 곡 보기 ↻</button>
      </div>

      <div class="spotlight-grid">
        <div>
          <h2 class="spotlight-title">${escapeHTML(song.title)}</h2>
          <div class="song-byline">
            <span>${escapeHTML(song.artist.join(", "))}</span>
            <span class="separator">·</span>
            <span>${escapeHTML(song.year ?? "")}</span>
            <span class="separator">·</span>
            <span>${escapeHTML(song.language.join(", "))}</span>
            <span class="separator">·</span>
            ${countryMarkup(song.countries)}
          </div>
          ${song.songwriters.length
            ? `<p class="songwriters">작곡·작사 · ${escapeHTML(song.songwriters.join(", "))}</p>`
            : ""}
          ${song.tags.length ? `<div class="song-tags">${tagsMarkup(song.tags)}</div>` : ""}
        </div>

        <div class="spotlight-notes">
          ${song.memo ? `<p>${escapeHTML(song.memo)}</p>` : ""}
          ${song.links.length || song.youtube.length
            ? `<div class="link-row">${linksMarkup(song)}</div>`
            : ""}
        </div>
      </div>
    </article>
  `;
}

function renderSongs(songArray) {
  if (!songArray.length) {
    songList.innerHTML = `<div class="no-results">검색 결과가 없습니다.</div>`;
    return;
  }

  songList.innerHTML = songArray.map(song => `
    <article class="song-row">
      <div class="song-main">
        <h3 class="song-title">${escapeHTML(song.title)}</h3>

        <div class="song-meta-line">
          <span>${escapeHTML(song.artist.join(", "))}</span>
          <span class="separator">·</span>
          <span>${escapeHTML(song.year ?? "")}</span>
          <span class="separator">·</span>
          <span>${escapeHTML(song.language.join(", "))}</span>
          <span class="separator">·</span>
          ${countryMarkup(song.countries)}
        </div>

        ${song.songwriters.length
          ? `<p class="songwriters">작곡·작사 · ${escapeHTML(song.songwriters.join(", "))}</p>`
          : ""}

        ${song.tags.length ? `<div class="song-tags">${tagsMarkup(song.tags)}</div>` : ""}
      </div>

      <div class="song-details">
        ${song.memo ? `<p class="song-memo">${escapeHTML(song.memo)}</p>` : ""}
        ${song.links.length || song.youtube.length
          ? `<div class="link-row">${linksMarkup(song)}</div>`
          : ""}
      </div>
    </article>
  `).join("");
}

function hideRandomSong() {
  randomSongSection.classList.add("hidden");
}

function showRandomSong() {
  randomSongSection.classList.remove("hidden");
}

function updateURLState(addHistoryEntry = false) {
  if (isRestoringState) return;

  const params = new URLSearchParams();
  if (selectedCountry) params.set("country", selectedCountry);
  if (artistFilter.value !== "all") params.set("artist", artistFilter.value);
  if (languageFilter.value !== "all") params.set("language", languageFilter.value);

  const keyword = tagSearch.value.trim();
  if (keyword) params.set("q", keyword);

  const query = params.toString();
  const newURL = query ? `${location.pathname}?${query}` : location.pathname;
  history[addHistoryEntry ? "pushState" : "replaceState"](null, "", newURL);
}

function restoreStateFromURL() {
  isRestoringState = true;

  const params = new URLSearchParams(location.search);
  const country = params.get("country");
  const artist = params.get("artist");
  const language = params.get("language");
  const keyword = params.get("q") || "";

  selectedCountry = null;
  makeArtistFilter(songs);
  makeLanguageFilter(songs);
  artistFilter.value = "all";
  languageFilter.value = "all";
  tagSearch.value = keyword;

  const validCountry = country && songs.some(song => song.countries.includes(country));

  if (validCountry) {
    selectedCountry = country;
    const countrySongs = songs.filter(song => song.countries.includes(country));
    makeArtistFilter(countrySongs);
    makeLanguageFilter(countrySongs);
  }

  if (artist && [...artistFilter.options].some(option => option.value === artist)) {
    artistFilter.value = artist;
  }

  if (language && [...languageFilter.options].some(option => option.value === language)) {
    languageFilter.value = language;
  }

  const hasFilter =
    artistFilter.value !== "all" ||
    languageFilter.value !== "all" ||
    keyword !== "";

  if (validCountry || hasFilter) {
    const filteredSongs = getFilteredSongs();
    countryView.hidden = true;
    songsView.hidden = false;
    hideRandomSong();

    if (validCountry) {
      countryTitle.innerHTML = `
        <span class="country-inline">
          <span class="fi fi-${country.toLowerCase()}"></span>
          ${escapeHTML(getCountryName(country))}
        </span>
      `;
    } else {
      countryTitle.textContent = "검색 결과";
    }

    resultContext.textContent = `${filteredSongs.length}곡`;
    renderSongs(filteredSongs);
  } else {
    renderCountries();
  }

  isRestoringState = false;
}

artistFilter.addEventListener("change", applyFilters);
languageFilter.addEventListener("change", applyFilters);
tagSearch.addEventListener("input", applyFilters);
countrySort.addEventListener("change", renderCountries);

countryList.addEventListener("click", event => {
  const card = event.target.closest("[data-country]");
  if (!card) return;
  selectCountry(card.dataset.country);
});

backButton.addEventListener("click", () => {
  selectedCountry = null;
  tagSearch.value = "";
  makeArtistFilter(songs);
  makeLanguageFilter(songs);
  artistFilter.value = "all";
  languageFilter.value = "all";
  renderCountries();
  renderRandomSong(getRandomSong(songs));
  updateURLState(true);
});

document.addEventListener("click", event => {
  if (event.target.id === "random-song-button") {
    renderRandomSong(getRandomSong(songs));
    return;
  }

  const tag = event.target.closest("[data-tag]");
  if (!tag) return;

  tagSearch.value = tag.dataset.tag;
  applyFilters();
  tagSearch.focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
});

window.addEventListener("popstate", restoreStateFromURL);
