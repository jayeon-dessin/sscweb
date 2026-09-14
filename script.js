let songs = [];
let selectedCountry = null;
let selectedTag = null;
let isRestoringState = false;

// 국가/태그/연표 목록의 간략 카드에서 곡 하나를 클릭해 상세 화면으로 들어간 경우,
// 뒤로가기를 누르면 (전체 브라우즈 화면이 아니라) 그 간략 목록으로
// 돌아가야 하므로 어디서 왔는지 기억해둠
// { type: "country" | "tag" | "timeline", value?: string } | null
let compactListReturnTo = null;

// "map"(지도) / "countries"(목록) / "timeline"(연표) / "tags"(태그) / "bubble"(버블) / "about"(소개)
let viewMode = "map";
const songList = document.getElementById("song-list");
const tagSearch = document.getElementById("tag-search");


const countryView = document.getElementById("country-view");
const countryList = document.getElementById("country-list");
const mapView = document.getElementById("map-view");
const timelineView = document.getElementById("timeline-view");
const timelineList = document.getElementById("timeline-list");
const timelineSort = document.getElementById("timeline-sort");
const tagsView = document.getElementById("tags-view");
const tagsList = document.getElementById("tags-list");
const bubbleView = document.getElementById("bubble-view");
const aboutView = document.getElementById("about-view");
const songsView = document.getElementById("songs-view");
const countryTitle = document.getElementById("country-title");
const countrySort =  document.getElementById("country-sort");
const tagSort = document.getElementById("tag-sort");
const backButton = document.getElementById("back-to-countries");
const viewTabs = document.querySelectorAll(".view-tab");
const randomDiceButton = document.getElementById("random-dice-button");

// -------------------------------------
// 목록/지도/연표/태그/버블/소개 뷰 <-> 곡 목록 뷰 전환
// -------------------------------------

// 국가를 고르는 화면(목록, 지도, 연표, 태그, 버블, 소개 중 현재 viewMode에 맞는 것)을 보여줌
function showBrowseUI() {
  songsView.style.display = "none";
  songsView.classList.remove("songs-view-no-header");

  countryView.style.display = viewMode === "countries" ? "block" : "none";
  mapView.style.display = viewMode === "map" ? "block" : "none";
  timelineView.style.display = viewMode === "timeline" ? "block" : "none";
  tagsView.style.display = viewMode === "tags" ? "block" : "none";
  bubbleView.style.display = viewMode === "bubble" ? "block" : "none";
  aboutView.style.display = viewMode === "about" ? "block" : "none";
}

// 곡 목록 화면을 보여줌
function showSongsUI() {
  countryView.style.display = "none";
  mapView.style.display = "none";
  timelineView.style.display = "none";
  tagsView.style.display = "none";
  bubbleView.style.display = "none";
  aboutView.style.display = "none";
  songsView.style.display = "block";
  songsView.classList.remove("songs-view-no-header");
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
  selectedTag = null;
  compactListReturnTo = null;

  tagSearch.value = "";

  // renderCountries()가 국가 목록도 새로 그리고, showBrowseUI()를 통해
  // 현재 viewMode에 맞는 화면(목록/지도/연표/태그/버블/소개)도 함께 보여줌
  renderCountries();

  if (mode === "timeline") {
    renderTimeline();
  }

  if (mode === "tags") {
    renderTagsList();
  }

  if (mode === "bubble" && typeof initBubbleView === "function") {
    initBubbleView();
  }

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

// 곡 하나만 곡 목록 화면에 표시 (랜덤 곡, 연표에서 곡 클릭, 관련곡 클릭,
// 국가/태그 간략 목록에서 곡 클릭 등에서 공용으로 사용)
function showSingleSongDetail(song, titleText, options = {}) {
  if (!song) return;

  const { preserveContext = false } = options;

  if (!preserveContext) {
    selectedCountry = null;
    selectedTag = null;
    compactListReturnTo = null;
  }

  showSongsUI();

  countryTitle.textContent = titleText;

  renderSongs([song]);
}

// 랜덤 곡은 뒤로가기 버튼/제목 없이 곡 카드가 바로 나옴
function showRandomSongDetail() {
  const song = getRandomSong(songs);
  if (!song) return;

  selectedCountry = null;
  selectedTag = null;
  compactListReturnTo = null;

  showSongsUI();
  songsView.classList.add("songs-view-no-header");

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
  const validModes = ["map", "countries", "timeline", "tags", "bubble", "about"];
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
  } else if (viewMode === "timeline") {
    // renderCountries()가 이미 showBrowseUI()로 화면은 띄웠으니 내용만 채움
    renderTimeline();
  } else if (viewMode === "tags") {
    renderTagsList();
  } else if (viewMode === "bubble" && typeof initBubbleView === "function") {
    initBubbleView();
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

// 국기 띠 위에 표시하던 "총 N곡 · M개 국가·지역" 텍스트는 제거했지만,
// 소개 탭 통계 뱃지는 계속 써야 하므로 국가 수 계산은 유지함
function renderArchiveStats() {
  const countries = [
    ...new Set(
      songs.flatMap(song => song.countries)
    )
  ].filter(Boolean);

  renderAboutStats(countries.length);
}

// 소개 탭의 통계 뱃지 (실제 곡 수를 자동으로 반영)
function renderAboutStats(countryCount) {
  const badge = document.getElementById("about-stat-badge");
  if (!badge) return;

  badge.textContent =
    `현재 ${songs.length}곡 · ${countryCount}개 국가·지역 수집 중`;
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
// 전체 곡 목록 (등록순/창작년도순 정렬, 페이지 넘김)
// -------------------------------------

// sscdbg.json의 year 필드는 형식이 다양함:
// 정확한 연도(1975, "1975"), 대략적 연도("1580?", "2008?"),
// 연대("1950s", "1940s?"), 세기("19c?"), 완전 미상("?") 등.
// 전부 안전하게 파싱해서 정렬 기준값과 그룹(연대/연도) 라벨을 뽑아냄
// (미상은 가장 오래된 곡으로 취급. 1960년 이후는 연도 하나하나가 그룹,
// 그 이전은 기존처럼 연대/세기 단위로 묶음)
function parseSongYear(raw) {

  if (raw === undefined || raw === null || raw === "") {
    return { sortValue: -Infinity, groupLabel: "연도 미상", groupSortValue: -Infinity };
  }

  const str = String(raw).trim();

  if (str === "?") {
    return { sortValue: -Infinity, groupLabel: "연도 미상", groupSortValue: -Infinity };
  }

  // 세기 표기: "19c?", "18c?", "20c?"
  let match = str.match(/^(\d{1,2})c\??$/i);
  if (match) {
    const century = parseInt(match[1], 10);
    const startYear = (century - 1) * 100;
    return {
      sortValue: startYear + 50,
      groupLabel: `${century}세기`,
      groupSortValue: startYear,
    };
  }

  // 연대 표기: "1950s", "1970s", "1940s?"
  match = str.match(/^(\d{4})s\??$/);
  if (match) {
    const decadeStart = parseInt(match[1], 10);
    return {
      sortValue: decadeStart,
      groupLabel: `${decadeStart}년대`,
      groupSortValue: decadeStart,
    };
  }

  // 정확하거나 대략적인 연도: "1926", "1580?", "2008?"
  match = str.match(/^(\d{3,4})\??$/);
  if (match) {
    const year = parseInt(match[1], 10);

    // 1960년 이후는 연도 하나하나를 그룹으로 세분화
    if (year >= 1960) {
      return {
        sortValue: year,
        groupLabel: `${year}년`,
        groupSortValue: year,
      };
    }

    const decadeStart = Math.floor(year / 10) * 10;
    return {
      sortValue: year,
      groupLabel: `${decadeStart}년대`,
      groupSortValue: decadeStart,
    };
  }

  // 파싱할 수 없는 형식은 안전하게 미상으로 처리
  return { sortValue: -Infinity, groupLabel: "연도 미상", groupSortValue: -Infinity };
}

function groupSongsByTimelinePeriod() {

  const groups = new Map();

  songs.forEach(song => {
    const parsed = parseSongYear(song.year);

    if (!groups.has(parsed.groupLabel)) {
      groups.set(parsed.groupLabel, {
        groupSortValue: parsed.groupSortValue,
        entries: [],
      });
    }

    groups.get(parsed.groupLabel).entries.push({
      song,
      sortValue: parsed.sortValue,
    });
  });

  return [...groups.entries()].sort(
    (a, b) => a[1].groupSortValue - b[1].groupSortValue
  );
}

function renderTimeline() {

  timelineList.innerHTML = "";

  let orderedGroups = groupSongsByTimelinePeriod();

  const direction = timelineSort?.value || "asc";
  if (direction === "desc") {
    orderedGroups = [...orderedGroups].reverse();
  }

  orderedGroups.forEach(([label, group], index) => {

    let entries = [...group.entries].sort((a, b) => a.sortValue - b.sortValue);
    if (direction === "desc") {
      entries = entries.reverse();
    }

    const section = document.createElement("div");
    section.className = "timeline-group";
    section.id = `timeline-group-${index}`;

    if (label === "연도 미상") {
      section.classList.add("timeline-group-unknown");
    }

    const heading = document.createElement("h3");
    heading.className = "timeline-heading";
    heading.textContent = `${label} · ${entries.length}곡`;
    section.appendChild(heading);

    const grid = document.createElement("div");
    grid.className = "song-list-compact";
    section.appendChild(grid);

    timelineList.appendChild(section);

    renderCompactSongGrid(grid, entries.map(entry => entry.song), {
      returnTo: { type: "timeline" },
    });
  });
}

// 연표 화면으로 가볍게 복귀 (정렬 방향은 그대로 유지) -
// 연표의 간략 카드에서 곡을 보고 뒤로가기 할 때 사용
function showTimelineList() {
  viewMode = "timeline";
  setActiveViewTab();
  showBrowseUI();
  renderTimeline();
}

timelineSort?.addEventListener("change", renderTimeline);

// -------------------------------------
// 태그 / 언어 공용: 워드클라우드 (많이 쓰인 순으로 정렬, 클릭하면 해당 값의 곡)
// -------------------------------------

// 값 하나의 사용 빈도에 따라 워드클라우드 글자 크기/굵기를 계산
// (제곱근 스케일 - 최댓값과 최솟값 차이가 커도 너무 극단적으로 벌어지지 않게)
function tagCloudStyle(count, minCount, maxCount) {
  const MIN_REM = 0.85;
  const MAX_REM = 2.6;

  const t = maxCount === minCount
    ? 0.5
    : (Math.sqrt(count) - Math.sqrt(minCount)) /
      (Math.sqrt(maxCount) - Math.sqrt(minCount));

  return {
    fontSize: `${MIN_REM + t * (MAX_REM - MIN_REM)}rem`,
    fontWeight: 400 + Math.round(t * 400), // 400(가장 작음) ~ 800(가장 큼)
  };
}

// 곡의 특정 배열 필드(tags/language)에서 값별 사용 횟수를 셈
function computeFieldCounts(fieldName) {
  const counts = new Map();
  songs.forEach(song => {
    (song[fieldName] || []).forEach(value => {
      counts.set(value, (counts.get(value) || 0) + 1);
    });
  });
  return counts;
}

// 워드클라우드를 임의의 컨테이너에 렌더링 (태그 화면, 언어 화면에서 공용으로 사용)
function renderWordCloud(container, counts, sortMode, onSelect) {

  container.innerHTML = "";

  if (counts.size === 0) return;

  const countValues = [...counts.values()];
  const minCount = Math.min(...countValues);
  const maxCount = Math.max(...countValues);

  const ordered = [...counts.entries()].sort((a, b) => {
    if (sortMode === "name") {
      return a[0].localeCompare(b[0], "ko");
    }
    if (b[1] !== a[1]) return b[1] - a[1];
    return a[0].localeCompare(b[0], "ko");
  });

  ordered.forEach(([label, count]) => {

    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "tag-chip";

    const style = tagCloudStyle(count, minCount, maxCount);
    chip.style.fontSize = style.fontSize;
    chip.style.fontWeight = style.fontWeight;

    chip.title = `${label} · ${count}곡`;
    chip.textContent = label;

    chip.addEventListener("click", () => {
      onSelect(label);
    });

    container.appendChild(chip);
  });
}

function renderTagsList() {
  renderWordCloud(
    tagsList,
    computeFieldCounts("tags"),
    tagSort?.value || "count-desc",
    selectTag
  );
}

// -------------------------------------
// 국가 선택
// -------------------------------------

// 배열을 무작위로 섞음 (Fisher-Yates)
function shuffleArray(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function selectCountry(code) {

  selectedCountry = code;
  selectedTag = null;
  compactListReturnTo = null;

  showSongsUI();

  const countrySongs = shuffleArray(
    songs.filter(song => song.countries.includes(code))
  );

  countryTitle.innerHTML = `
    ${countryFlagHTML(code)}
    ${getCountryName(code)}
    <span class="country-title-count">${countrySongs.length}곡</span>
  `;

  tagSearch.value = "";

  renderSongs(countrySongs, { compact: true });
  updateURLState(true);
}

// -------------------------------------
// 태그 선택
// -------------------------------------

function selectTag(tag) {

  selectedTag = tag;
  selectedCountry = null;
  compactListReturnTo = null;

  showSongsUI();

  const tagSongs = songs.filter(song =>
    (song.tags || []).includes(tag)
  );

  countryTitle.innerHTML = `
    ${tag}
    <span class="country-title-count">${tagSongs.length}곡</span>
  `;

  tagSearch.value = "";

  renderSongs(tagSongs, { compact: true });
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

tagSort?.addEventListener(
  "change",
  renderTagsList
);

// -------------------------------------
// 국가 목록으로 돌아가기
// -------------------------------------

backButton.addEventListener("click", () => {
  if (compactListReturnTo) {
    const returnTo = compactListReturnTo;
    compactListReturnTo = null;
    if (returnTo.type === "tag") {
      selectTag(returnTo.value);
    } else if (returnTo.type === "timeline") {
      showTimelineList();
    } else if (returnTo.type === "bubbleGroup" && typeof selectBubbleGroupByKey === "function") {
      selectBubbleGroupByKey(returnTo.value);
    } else {
      selectCountry(returnTo.value);
    }
  } else {
    goToBrowseView(viewMode);
  }
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

  // 검색어를 입력하면 (곡 상세 화면에서 검색했더라도) 항상 새로운 목록
  // 화면으로 이동하는 것이므로, 상세 화면 전용 뒤로가기 상태는 초기화
  compactListReturnTo = null;

  const keyword = normalizeSearchText(
    tagSearch.value.trim()
  );

  const hasFilter = keyword !== "";

  // 국가/태그 선택도 없고 필터도 없으면 국가 목록/지도/랜덤
  if (!selectedCountry && !selectedTag && !hasFilter) {
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

    // 태그를 골랐으면 그 태그 안에서만
    if (
      selectedTag &&
      !(song.tags || []).includes(selectedTag)
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
      <span class="country-title-count">${filteredSongs.length}곡</span>
    `;
  } else if (selectedTag) {
    countryTitle.innerHTML = `
      ${selectedTag}
      <span class="country-title-count">${filteredSongs.length}곡</span>
    `;
  } else {
    countryTitle.textContent =
      `검색 결과 (${filteredSongs.length}곡)`;
  }

  renderSongs(filteredSongs, { compact: !!(selectedCountry || selectedTag) });
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
// 곡 목록 출력 (간략 카드 / 일반 카드)
// -------------------------------------

// 국가를 골랐을 때 1차로 보여주는 간략 카드: 이미지 + 제목 + 가수만
function compactSongCardMarkup(song) {
  const performerText = song.artist?.length
    ? song.artist.join(", ")
    : (song.songwriters || []).join(", ");

  return `
    <div class="song-artwork song-artwork-compact placeholder"></div>
    <div class="compact-song-info">
      <div class="compact-song-title">${song.title}</div>
      <div class="compact-song-artist">${performerText}</div>
    </div>
  `;
}

function renderSongs(songArray, options = {}) {

  const { compact = false } = options;

  songList.innerHTML = "";
  songList.classList.toggle("song-list-compact", compact);

  if (songArray.length === 0) {
    songList.innerHTML = `
      <div class="no-results">
        검색 결과가 없습니다.
      </div>
    `;
    return;
  }

  if (compact) {
    const returnTo = selectedTag
      ? { type: "tag", value: selectedTag }
      : { type: "country", value: selectedCountry };
    renderCompactSongGrid(songList, songArray, { returnTo });
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

// 간략 카드(이미지+제목+가수) 그리드를 임의의 컨테이너에 렌더링.
// 국가/태그 화면(#song-list)과 연표(#timeline-list 안의 각 그룹)에서 공용으로 사용
function renderCompactSongGrid(container, songArray, { returnTo } = {}) {

  container.innerHTML = "";

  if (songArray.length === 0) {
    container.innerHTML = `
      <div class="no-results">
        검색 결과가 없습니다.
      </div>
    `;
    return;
  }

  songArray.forEach(song => {
    const item = document.createElement("div");
    item.className = "song-card-compact";
    item.innerHTML = compactSongCardMarkup(song);

    item.addEventListener("click", () => {
      compactListReturnTo = returnTo || null;
      showSingleSongDetail(song, song.title, { preserveContext: true });
    });

    container.appendChild(item);

    if (typeof loadArtworkInto === "function") {
      loadArtworkInto(item.querySelector(".song-artwork"), song);
    }
  });
}