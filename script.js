let songs = [];
let selectedCountry = null;
let isRestoringState = false;

// "map"(지도) / "countries"(목록) / "about"(소개)
let viewMode = "map";
const songList = document.getElementById("song-list");
const tagSearch = document.getElementById("tag-search");


const countryView = document.getElementById("country-view");
const countryList = document.getElementById("country-list");
const mapView = document.getElementById("map-view");
const aboutView = document.getElementById("about-view");
const songsView = document.getElementById("songs-view");
const countryTitle = document.getElementById("country-title");
const countrySort =  document.getElementById("country-sort");
const backButton = document.getElementById("back-to-countries");
const viewTabs = document.querySelectorAll(".view-tab");
const randomDiceButton = document.getElementById("random-dice-button");

// -------------------------------------
// 목록/지도/소개 뷰 <-> 곡 목록 뷰 전환
// -------------------------------------

// 국가를 고르는 화면(목록, 지도, 소개 중 현재 viewMode에 맞는 것)을 보여줌
function showBrowseUI() {
  songsView.style.display = "none";

  countryView.style.display = viewMode === "countries" ? "block" : "none";
  mapView.style.display = viewMode === "map" ? "block" : "none";
  aboutView.style.display = viewMode === "about" ? "block" : "none";
}

// 곡 목록 화면을 보여줌
function showSongsUI() {
  countryView.style.display = "none";
  mapView.style.display = "none";
  aboutView.style.display = "none";
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

  tagSearch.value = "";

  // renderCountries()가 국가 목록도 새로 그리고, showBrowseUI()를 통해
  // 현재 viewMode에 맞는 화면(목록/지도)도 함께 보여줌
  renderCountries();

  updateURLState(true);
}

viewTabs.forEach(tab => {
  tab.addEventListener("click", () => {
    goToBrowseView(tab.dataset.mode);
  });
});

// -------------------------------------
// 랜덤 곡 (헤더의 주사위 버튼)
// -------------------------------------

function showRandomSongDetail() {
  const song = getRandomSong(songs);
  if (!song) return;

  selectedCountry = null;

  showSongsUI();

  countryTitle.textContent = "🎲 랜덤 곡";

  renderSongs([song]);
}

randomDiceButton?.addEventListener("click", showRandomSongDetail);

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

  // 뷰 모드 (기본값인 지도 뷰일 때는 생략)
  if (viewMode !== "map") {
    params.set("view", viewMode);
  }

  // 국가
  if (selectedCountry) {
    params.set("country", selectedCountry);
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
  const keyword = params.get("q");

  // 뷰 모드 복원 (기본값: 지도)
  const validModes = ["map", "countries", "about"];
  viewMode = validModes.includes(view) ? view : "map";
  setActiveViewTab();

  // 우선 전체 상태로 초기화
  selectedCountry = null;
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

  // 검색어 복원
  if (keyword) {
    tagSearch.value = keyword;
  }

  const hasFilter = tagSearch.value.trim() !== "";

  // 국가나 필터가 있으면 곡 목록 표시
  if (validCountry || hasFilter) {
    applyFilters();
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


    renderArchiveStats();
    renderDecorativeFlags();
    renderCountries();

    // 지도 뷰 초기화 (map.js). 데이터 로드 직후 한 번만 실행되며,
    // 실제 지도는 사용자가 "지도" 탭으로 전환할 때 이미 준비되어 있도록 미리 그려둠
    if (typeof initMap === "function") {
      initMap();
    }

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


  flagStrip.innerHTML = "";

  // 실제 곡이 있는 국가를 기준으로 국기 목록을 자동 생성
  // (새 국가가 sscdbg.json에 추가되면 코드 수정 없이 자동으로 여기 반영됨)
  const flagCodes = [...getCountryCounts().keys()].sort((a, b) => {
    if (a === "XX") return 1;
    if (b === "XX") return -1;
    return getCountryName(a).localeCompare(getCountryName(b), "ko");
  });

  flagCodes.forEach(code => {

    const button = document.createElement("button");
    button.type = "button";
    button.className = "flag-strip-item";
    button.setAttribute("aria-label", getCountryName(code));
    button.title = getCountryName(code);
    button.innerHTML = countryFlagHTML(code);

    button.addEventListener("click", () => {
      selectCountry(code);
    });

    flagStrip.appendChild(button);
  });
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

// 대륙 표시 순서 (지리적으로 자연스러운 순서)
const CONTINENT_ORDER = [
  "아시아", "유럽", "아프리카", "북아메리카", "남아메리카", "오세아니아"
];

function buildCountryListItem(code, count) {

  const button = document.createElement("button");

  button.className = "country-card";

  button.innerHTML = `
    ${countryFlagHTML(code, "country-list-flag")}

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

  return button;
}

function renderCountriesByContinent(countries, countryCounts) {

  countryList.classList.add("grouped");

  const groups = new Map();

  countries.forEach(code => {
    const continent = code === "XX" ? "미분류" : (COUNTRY_CONTINENTS[code] || "기타");
    if (!groups.has(continent)) {
      groups.set(continent, []);
    }
    groups.get(continent).push(code);
  });

  groups.forEach(list => {
    list.sort((a, b) =>
      getCountryName(a).localeCompare(getCountryName(b), "ko")
    );
  });

  const orderedContinents = [
    ...CONTINENT_ORDER.filter(continent => groups.has(continent)),
    ...[...groups.keys()].filter(
      continent => !CONTINENT_ORDER.includes(continent)
    ),
  ];

  orderedContinents.forEach(continent => {

    const section = document.createElement("div");
    section.className = "continent-group";

    const heading = document.createElement("h3");
    heading.className = "continent-heading";
    heading.textContent = continent;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "continent-country-list";

    groups.get(continent).forEach(code => {
      grid.appendChild(
        buildCountryListItem(code, countryCounts.get(code))
      );
    });

    section.appendChild(grid);
    countryList.appendChild(section);
  });
}

function renderCountries() {

  selectedCountry = null;

  showBrowseUI();
  countryList.innerHTML = "";
  countryList.classList.remove("grouped");

  const countryCounts = getCountryCounts();

  const countries = [
    ...countryCounts.keys()
  ];

  // 정렬
  const sortMode =
    countrySort?.value || "name";

  if (sortMode === "continent") {
    renderCountriesByContinent(countries, countryCounts);
    return;
  }

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
    countryList.appendChild(
      buildCountryListItem(code, countryCounts.get(code))
    );
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

  tagSearch.value = "";

  renderSongs(countrySongs);
  updateURLState(true);
}

// -------------------------------------
// 필터 이벤트
// -------------------------------------

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

  const keyword = normalizeSearchText(
    tagSearch.value.trim()
  );

  const hasFilter = keyword !== "";

  // 국가 선택도 없고 필터도 없으면 국가 목록/지도/랜덤
  if (!selectedCountry && !hasFilter) {
    showBrowseUI();
    updateURLState();
    return;
  }

  const filteredSongs = songs.filter(song => {

    // 국가를 골랐으면 그 국가 안에서만
    if (
      selectedCountry &&
      !song.countries.includes(selectedCountry)
    ) {
      return false;
    }

    // 텍스트 검색 (제목, 아티스트, 작곡·작사자, 언어, 태그, 설명)
    if (keyword) {

      const searchableText = [
        song.title,
        ...song.artist,
        ...song.songwriters,
        ...song.language,
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

// -------------------------------------
// 곡 목록 출력
// -------------------------------------
function renderSongs(songArray) {
  songList.innerHTML = "";

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