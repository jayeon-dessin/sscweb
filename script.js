let songs = [];
let selectedCountry = null;
let isRestoringState = false;

// "countries"(목록) 또는 "map"(지도)
let viewMode = "countries";

const artistFilter = document.getElementById("artist-filter");
const languageFilter = document.getElementById("language-filter");
const songList = document.getElementById("song-list");
const tagSearch = document.getElementById("tag-search");


const countryView = document.getElementById("country-view");
const countryList = document.getElementById("country-list");
const mapView = document.getElementById("map-view");
const songsView = document.getElementById("songs-view");
const countryTitle = document.getElementById("country-title");
const countrySort =  document.getElementById("country-sort");
const backButton = document.getElementById("back-to-countries");
const viewTabs = document.querySelectorAll(".view-tab");

// -------------------------------------
// 국가/지도 뷰 <-> 곡 목록 뷰 전환
// -------------------------------------

// 국가를 고르는 화면(목록 또는 지도)을 보여줌
function showBrowseUI() {
  songsView.style.display = "none";

  if (viewMode === "map") {
    mapView.style.display = "block";
    countryView.style.display = "none";
  } else {
    countryView.style.display = "block";
    mapView.style.display = "none";
  }
}

// 곡 목록 화면을 보여줌
function showSongsUI() {
  countryView.style.display = "none";
  mapView.style.display = "none";
  songsView.style.display = "block";
}

// 현재 viewMode에 맞게 탭 버튼 active 상태 갱신
function setActiveViewTab() {
  viewTabs.forEach(tab => {
    const active = tab.dataset.mode === viewMode;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", active ? "true" : "false");
  });
}

// 국가/지역 선택 화면으로 돌아가기 (지정한 모드로)
function goToBrowseView(mode) {

  viewMode = mode;
  setActiveViewTab();

  selectedCountry = null;

  artistFilter.value = "all";
  languageFilter.value = "all";
  tagSearch.value = "";

  makeArtistFilter(songs);
  makeLanguageFilter(songs);

  renderCountries();

  const randomSong = getRandomSong(songs);
  renderRandomSong(randomSong);
  showRandomSong();

  updateURLState(true);
}

viewTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    goToBrowseView(tab.dataset.mode);
  });
});

const decorativeFlags = [
  "KR", 
  "AF", "DZ", "AR", "AU", "AT",
  "BD", "BY", "BE", "BJ", "BO", "BA", "BR", "BG",
  "CV", "CM", "CA", "CL", "CN", "CO", "HR", "CU", "CD", 
  "DK", "EG", "EE", "FJ", "FI", "FR", "GE", "DE", "GH", "GR", 
  "HK", "IS", "IN", "ID", "IR", "IE", "IL", "IT", 
  "JM", "JP", "KZ", "KE", "LB", "ML", "MX", "MD", "MN",
  "NL", "NZ", "NE", "NG", "KP", "NO", 
  "PK", "PS", "PH", "PL", "PT", "PR", "RU", 
  "SA", "RS", "SO", "ZA", "ES", "SE", "SY", 
  "TW", "TH", "TT", "TN", "TR", "UA", "GB", "US", "VN"
];

// -------------------------------------
// 국가 코드 → 한국어 국가명
// -------------------------------------

const regionNames = new Intl.DisplayNames(
  ["ko"],
  { type: "region" }
);

function getCountryName(code) {
  if (code === "XX") {
    return "미분류";
  }
  return regionNames.of(code);
}

// 국가 코드에 맞는 국기 아이콘 마크업.
// "XX"(미분류)는 실제 국기가 없으므로 대체 뱃지를 사용
function countryFlagHTML(code, extraClass = "") {

  const classAttr = extraClass ? `${extraClass} ` : "";

  if (code === "XX") {
    return `<span class="${classAttr}flag-unclassified" aria-hidden="true"></span>`;
  }

  return `<span class="${classAttr}fi fi-${code.toLowerCase()}"></span>`;
}

// -------------------------------------
// 현재 상태를 URL에 저장
// -------------------------------------

function updateURLState(addHistoryEntry = false) {

  // URL을 복원하는 중에는 다시 URL을 수정하지 않음
  if (isRestoringState) {
    return;
  }

  const params = new URLSearchParams();

  // 뷰 모드 (기본값인 목록 뷰일 때는 생략)
  if (viewMode !== "countries") {
    params.set("view", viewMode);
  }

  // 국가
  if (selectedCountry) {
    params.set("country", selectedCountry);
  }

  // Artist
  if (artistFilter.value !== "all") {
    params.set("artist", artistFilter.value);
  }

  // Language
  if (languageFilter.value !== "all") {
    params.set("language", languageFilter.value);
  }

  // 검색어
  const keyword = tagSearch.value.trim();

  if (keyword) {
    params.set("q", keyword);
  }

  const queryString = params.toString();

  const newURL = queryString
    ? `${location.pathname}?${queryString}`
    : location.pathname;

  if (addHistoryEntry) {
    history.pushState(null, "", newURL);
  } else {
    history.replaceState(null, "", newURL);
  }
}

// -------------------------------------
// URL에서 상태 불러오기
// -------------------------------------

function restoreStateFromURL() {

  isRestoringState = true;

  const params = new URLSearchParams(location.search);
  const view = params.get("view");
  const country = params.get("country");
  const artist = params.get("artist");
  const language = params.get("language");
  const keyword = params.get("q");

  // 뷰 모드 복원
  viewMode = view === "map" ? "map" : "countries";
  setActiveViewTab();

  // 우선 전체 상태로 초기화
  selectedCountry = null;

  makeArtistFilter(songs);
  makeLanguageFilter(songs);

  artistFilter.value = "all";
  languageFilter.value = "all";
  tagSearch.value = "";

  // URL의 국가가 실제 데이터에 존재하는지 확인
  const validCountry =
    country &&
    songs.some(song =>
      song.countries.includes(country)
    );

  // 국가가 있으면 해당 국가 선택
  if (validCountry) {
    selectCountry(country);
  } else {
    renderCountries();
  }

  // Artist 복원
  if (
    artist &&
    [...artistFilter.options].some(
      option => option.value === artist
    )
  ) {
    artistFilter.value = artist;
  }

  // Language 복원
  if (
    language &&
    [...languageFilter.options].some(
      option => option.value === language
    )
  ) {
    languageFilter.value = language;
  }

  // 검색어 복원
  if (keyword) {
    tagSearch.value = keyword;
  }

  const hasFilter =
    artistFilter.value !== "all" ||
    languageFilter.value !== "all" ||
    tagSearch.value.trim() !== "";

  // 국가나 필터가 있으면 곡 목록 표시
  if (validCountry || hasFilter) {
    applyFilters();
  } else {
    showRandomSong();
  }
  isRestoringState = false;
}

// -------------------------------------
// JSON 불러오기
// -------------------------------------

fetch(`sscdbg.json?v=${Date.now()}`)
  .then(response => response.json())
  .then(data => {

    songs = data.map(song => ({
      ...song,

      artist: Array.isArray(song.artist)
        ? song.artist
        : [song.artist],

      songwriters: Array.isArray(song.songwriters)
        ? song.songwriters
        : song.songwriters
          ? [song.songwriters]
          : [],

      language: Array.isArray(song.language)
        ? song.language
        : [song.language],

      countries: Array.isArray(song.countries)
        ? song.countries
        : song.countries
          ? [song.countries]
          : [],

      tags: Array.isArray(song.tags)
        ? song.tags
        : [],

      links: Array.isArray(song.links)
        ? song.links
        : [],

      youtube: Array.isArray(song.youtube)
        ? song.youtube
        : []
    }));


    // 첫 화면에서도 전체 Artist / Language 표시
    makeArtistFilter(songs);
    makeLanguageFilter(songs);

    renderArchiveStats();
    renderDecorativeFlags();
    renderCountries();

    // 지도 뷰 초기화 (map.js). 데이터 로드 직후 한 번만 실행되며,
    // 실제 지도는 사용자가 "지도" 탭으로 전환할 때 이미 준비되어 있도록 미리 그려둠
    if (typeof initMap === "function") {
      initMap();
    }

    const firstRandomSong = getRandomSong(songs);
    renderRandomSong(firstRandomSong);
    restoreStateFromURL();
  })

  .catch(error => {
    console.error(
      "JSON을 불러오는 중 오류:",
      error
    );
  });

function renderArchiveStats() {
  const stats = document.getElementById("archive-stats");

  const countries = [
    ...new Set(
      songs.flatMap(song => song.countries)
    )
  ].filter(Boolean);

  stats.textContent =
    `총 ${songs.length}곡 · ${countries.length}개 국가·지역`;
}

function renderDecorativeFlags() {

  const flagStrip =
    document.getElementById("flag-strip");


  if (!flagStrip) {
    return;
  }


  flagStrip.innerHTML = decorativeFlags
    .map(code =>
      `<span class="fi fi-${code.toLowerCase()}"></span>`
    )
    .join("");
}



// -------------------------------------
// 국가 목록 출력
// -------------------------------------

// 국가별 곡 수 계산 (목록 뷰와 지도 뷰가 공유)
function getCountryCounts() {

  const countryCounts = new Map();

  songs.forEach(song => {
    song.countries.forEach(code => {

      if (!code) return;

      countryCounts.set(
        code,
        (countryCounts.get(code) || 0) + 1
      );

    });
  });

  return countryCounts;
}

function renderCountries() {

  selectedCountry = null;

  showBrowseUI();
  countryList.innerHTML = "";

  const countryCounts = getCountryCounts();

  const countries = [
    ...countryCounts.keys()
  ];

  // 정렬
  const sortMode =
    countrySort?.value || "name";

  if (sortMode === "count-desc") {

    countries.sort((a, b) =>
      countryCounts.get(b) - countryCounts.get(a) ||
      getCountryName(a).localeCompare(
        getCountryName(b),
        "ko"
      )
    );

  } else if (sortMode === "count-asc") {

    countries.sort((a, b) =>
      countryCounts.get(a) - countryCounts.get(b) ||
      getCountryName(a).localeCompare(
        getCountryName(b),
        "ko"
      )
    );

  } else {

    countries.sort((a, b) =>
      getCountryName(a).localeCompare(
        getCountryName(b),
        "ko"
      )
    );

  }


  countries.forEach(code => {

    const count = countryCounts.get(code);

    const button =
      document.createElement("button");

    button.className = "country-card";

    button.innerHTML = `
      ${countryFlagHTML(code, "country-flag")}

      <span class="country-name">
        ${getCountryName(code)}
      </span>

      <span class="country-count">
        ${count}곡
      </span>
    `;

    button.addEventListener("click", () => {
      selectCountry(code);
    });

    countryList.appendChild(button);
  });
}

// -------------------------------------
// 국가 선택
// -------------------------------------

function selectCountry(code) {

  selectedCountry = code;

  showSongsUI();

  countryTitle.innerHTML = `
    ${countryFlagHTML(code)}
    ${getCountryName(code)}
  `;

  const countrySongs = songs.filter(song =>
    song.countries.includes(code)
  );

  // 선택한 국가에 존재하는 Artist / Language만 표시
  makeArtistFilter(countrySongs);
  makeLanguageFilter(countrySongs);

  artistFilter.value = "all";
  languageFilter.value = "all";
  tagSearch.value = "";

  renderSongs(countrySongs);
  updateURLState(true);
}

// -------------------------------------
// Artist 필터 만들기
// -------------------------------------

function makeArtistFilter(songArray) {

  artistFilter.innerHTML =
    `<option value="all">전체</option>`;

  const artists = [
    ...new Set(
      songArray.flatMap(song => song.artist)
    )
  ]

    .filter(Boolean)

    .sort((a, b) =>
      a.localeCompare(b, "ko")
    );

  artists.forEach(artist => {

    const option =
      document.createElement("option");

    option.value = artist;
    option.textContent = artist;

    artistFilter.appendChild(option);
  });
}

// -------------------------------------
// Language 필터 만들기
// -------------------------------------

function makeLanguageFilter(songArray) {

  languageFilter.innerHTML =
    `<option value="all">전체</option>`;

  const languages = [
    ...new Set(
      songArray.flatMap(song => song.language)
    )
  ]

    .filter(Boolean)

    .sort((a, b) =>
      a.localeCompare(b, "ko")
    );

  languages.forEach(language => {

    const option =
      document.createElement("option");

    option.value = language;
    option.textContent = language;

    languageFilter.appendChild(option);
  });
}

// -------------------------------------
// 필터 이벤트
// -------------------------------------

artistFilter.addEventListener(
  "change",
  applyFilters
);

languageFilter.addEventListener(
  "change",
  applyFilters
);

tagSearch.addEventListener(
  "input",
  applyFilters
);

countrySort.addEventListener(
  "change",
  renderCountries
);

// -------------------------------------
// 국가 목록으로 돌아가기
// -------------------------------------

backButton.addEventListener("click", () => {
  goToBrowseView(viewMode);
});

// 뒤로가기 버튼

window.addEventListener(
  "popstate",
  restoreStateFromURL
);

// -------------------------------------
// 필터 적용
// -------------------------------------

function normalizeSearchText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase();
}

function applyFilters() {

  const selectedArtist = artistFilter.value;
  const selectedLanguage = languageFilter.value;
  const keyword = normalizeSearchText(
    tagSearch.value.trim()
  );

  const hasFilter =
    selectedArtist !== "all" ||
    selectedLanguage !== "all" ||
    keyword !== "";

  // 국가 선택도 없고 필터도 없으면 국가 목록/지도
  if (!selectedCountry && !hasFilter) {
    showBrowseUI();
    showRandomSong();
    updateURLState();
    return;
  }

  hideRandomSong();

  const filteredSongs = songs.filter(song => {

    // 국가를 골랐으면 그 국가 안에서만
    if (
      selectedCountry &&
      !song.countries.includes(selectedCountry)
    ) {
      return false;
    }

    // Artist
    if (
      selectedArtist !== "all" &&
      !song.artist.includes(selectedArtist)
    ) {
      return false;
    }

    // Language
    if (
      selectedLanguage !== "all" &&
      !song.language.includes(selectedLanguage)
    ) {
      return false;
    }

    // 텍스트 검색
    if (keyword) {

      const searchableText = [
        song.title,
        ...song.artist,
        ...song.songwriters,
        ...song.tags,
        song.memo,
      ]
        .map(normalizeSearchText)
        .join(" ");

      if (!searchableText.includes(keyword)) {
        return false;
      }
    }

    return true;
  });

  // 국가 목록/지도 대신 곡 목록 표시
  showSongsUI();

  // 제목
  if (selectedCountry) {
    countryTitle.innerHTML = `
      ${countryFlagHTML(selectedCountry)}
      ${getCountryName(selectedCountry)}
    `;
  } else {
    countryTitle.textContent =
      `검색 결과 (${filteredSongs.length}곡)`;
  }

  renderSongs(filteredSongs);
  updateURLState();
}

// -------------------------------------
// 랜덤 곡
// -------------------------------------

function getRandomSong(songArray) {
  if (!songArray || songArray.length === 0) return null;

  const previousTitle = sessionStorage.getItem("previousRandomSong");

  let candidates = songArray.filter(
    song => song.title !== previousTitle
  );

  if (candidates.length === 0) {
    candidates = songArray;
  }

  const randomIndex = Math.floor(Math.random() * candidates.length);
  const song = candidates[randomIndex];

  sessionStorage.setItem(
    "previousRandomSong",
    song.title
  );

  return song;
}

// 곡 카드 안쪽 마크업 (랜덤 곡 카드 / 목록 카드가 공유)
function songCardMarkup(song) {
  return `
    <div class="song-content">

      <!-- 왼쪽: 앨범 아트 + 기본 정보 -->
      <div class="song-info">

        <div class="song-header">
          <div class="song-artwork placeholder" aria-hidden="true"></div>

          <div class="song-header-text">
            <h2>${song.title}</h2>

            <div class="song-meta">
              <div class="song-meta-line">

                <span>${song.artist.join(", ")}</span>
                <span class="meta-divider">·</span>

                <span>${song.year}</span>
                <span class="meta-divider">·</span>

                <span>${song.language.join(", ")}</span>
                <span class="meta-divider">·</span>

                <span class="song-countries">
                  ${song.countries
                    .map(code => `
                      <span class="song-country">
                        ${countryFlagHTML(code)}
                        ${getCountryName(code)}
                      </span>
                    `)
                    .join("")}
                </span>

              </div>

              ${
                song.songwriters?.length
                  ? `
                    <div class="song-songwriters">
                      ${song.songwriters.join(", ")}
                    </div>
                  `
                  : ""
              }

            </div>
          </div>
        </div>

        <div class="song-tags">
          ${song.tags
            .map(tag =>
              `<span class="tag">${tag}</span>`
            )
            .join("")}
        </div>

      </div>


      <!-- 오른쪽: 설명 + 링크 -->
      <div class="song-details">

        ${
          song.memo
            ? `
              <p class="song-memo">
                ${song.memo}
              </p>
            `
            : ""
        }

        <div class="song-links">

          ${
            song.links?.length
              ? song.links
                  .map(link => `
                    <a
                      class="blog-link"
                      href="${link.url}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ${link.title}
                    </a>
                  `)
                  .join("")
              : ""
          }

          ${
            song.youtube?.length
              ? song.youtube
                  .map(video => `
                    <a
                      class="youtube-link"
                      href="${video.url}"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      ${video.title}
                    </a>
                  `)
                  .join("")
              : ""
          }
        </div>
      </div>
    </div>
  `;
}

function renderRandomSong(song) {
  const randomSong = document.getElementById("random-song");

  if (!randomSong || !song) return;

  randomSong.innerHTML = `
    <div class="random-song-card">

      <div class="random-song-header">
        <span class="random-song-label">
          랜덤 곡
        </span>

        <button
          type="button"
          id="random-song-button"
        >
          다른 곡 보기
        </button>
      </div>

      ${songCardMarkup(song)}
    </div>
  `;

  const button =
    document.getElementById("random-song-button");

  button?.addEventListener("click", () => {
    const newSong = getRandomSong(songs);
    renderRandomSong(newSong);
  });

  if (typeof loadArtworkInto === "function") {
    loadArtworkInto(randomSong.querySelector(".song-artwork"), song);
  }
}

// 랜덤 곡 숨기기
function hideRandomSong() {
  document
    .getElementById("random-song")
    ?.classList.add("hidden");
}

// 랜덤 곡 다시 보여주기
function showRandomSong() {
  document
    .getElementById("random-song")
    ?.classList.remove("hidden");
}

// -------------------------------------
// 곡 목록 출력
// -------------------------------------
function renderSongs(songArray) {
  songList.innerHTML = "";
  hideRandomSong();

  if (songArray.length === 0) {
    songList.innerHTML = `
      <div class="no-results">
        검색 결과가 없습니다.
      </div>
    `;
    return;
  }

  songArray.forEach(song => {
    const item = document.createElement("div");
    if (song.links?.length > 0) {
      item.classList.add("has-links");
    }

    item.innerHTML = songCardMarkup(song);

    songList.appendChild(item);

    if (typeof loadArtworkInto === "function") {
      loadArtworkInto(item.querySelector(".song-artwork"), song);
    }
  });
}