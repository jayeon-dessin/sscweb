let songs = [];
let selectedCountry = null;

const artistFilter = document.getElementById("artist-filter");
const languageFilter = document.getElementById("language-filter");
const songList = document.getElementById("song-list");
const tagSearch = document.getElementById("tag-search");


const countryView = document.getElementById("country-view");
const countryList = document.getElementById("country-list");
const songsView = document.getElementById("songs-view");
const countryTitle = document.getElementById("country-title");
const backButton = document.getElementById("back-to-countries");

const decorativeFlags = [
  "KR", "DZ", "AR", "AU", "AT", "BA", "BY", "BE", "BJ",
  "BR", "CV", "CA", "CN", "CO", "CU", "DK",
  "EG", "FI", "FR", "GE", "DE", "GR",
  "IS", "IN", "ID", "IR", "IE", "IT", "JM", "JP",
  "KZ", "KE", "ML", "MX", "MD", "MN", "NL",
  "NZ", "NG", "KP", "NO", "PK", "PH", "PL", "PR",
  "RU", "ZA", "ES", "SE", "SY", "TW", "TH",
  "TT", "TR", "UA", "GB", "US", "VN"
];

// -------------------------------------
// 국가 코드 → 한국어 국가명
// -------------------------------------

const regionNames = new Intl.DisplayNames(
  ["ko"],
  { type: "region" }
);

function getCountryName(code) {
  return regionNames.of(code);
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

    // 곡 순서 랜덤
    for (let i = songs.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [songs[i], songs[j]] = [songs[j], songs[i]];
    }

    // 첫 화면에서도 전체 Artist / Language 표시
    makeArtistFilter(songs);
    makeLanguageFilter(songs);

    renderArchiveStats();
    renderDecorativeFlags();
    renderCountries();
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

function renderCountries() {

  selectedCountry = null;

  countryView.style.display = "block";
  songsView.style.display = "none";
  countryList.innerHTML = "";

  const countries = [
    ...new Set(
      songs.flatMap(song => song.countries)
    )
  ]

    .filter(Boolean)

    .sort((a, b) =>
      getCountryName(a).localeCompare(
        getCountryName(b),
        "ko"
      )
    );

  countries.forEach(code => {

    const count = songs.filter(song =>
      song.countries.includes(code)
    ).length;

    const button =
      document.createElement("button");

    button.className = "country-card";

    button.innerHTML = `
      <span class="country-flag fi fi-${code.toLowerCase()}"></span>

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

  countryView.style.display = "none";
  songsView.style.display = "block";

  countryTitle.innerHTML = `
    <span class="fi fi-${code.toLowerCase()}"></span>
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

// -------------------------------------
// 국가 목록으로 돌아가기
// -------------------------------------

backButton.addEventListener("click", () => {

  selectedCountry = null;

  artistFilter.value = "all";
  languageFilter.value = "all";
  tagSearch.value = "";

  // 다시 전체 Artist / Language 목록으로 복구
  makeArtistFilter(songs);
  makeLanguageFilter(songs);

  renderCountries();
});

// -------------------------------------
// 필터 적용
// -------------------------------------

function applyFilters() {

  const selectedArtist = artistFilter.value;
  const selectedLanguage = languageFilter.value;
  const keyword = tagSearch.value.trim().toLowerCase();

  const hasFilter =
    selectedArtist !== "all" ||
    selectedLanguage !== "all" ||
    keyword !== "";

  // 국가 선택도 없고 필터도 없으면 국가 목록
  if (!selectedCountry && !hasFilter) {

    countryView.style.display = "block";
    songsView.style.display = "none";

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

      const titleMatch =
        String(song.title)
          .toLowerCase()
          .includes(keyword);

      const artistMatch =
        song.artist.some(artist =>
          String(artist)
            .toLowerCase()
            .includes(keyword)
        );

      const songwriterMatch =
        song.songwriters.some(writer =>
          String(writer)
            .toLowerCase()
            .includes(keyword)
        );

      const tagMatch =
        song.tags.some(tag =>
          String(tag)
            .toLowerCase()
            .includes(keyword)
        );

      if (
        !titleMatch &&
        !artistMatch &&
        !songwriterMatch &&
        !tagMatch
      ) {
        return false;
      }
    }

    return true;
  });


  // 국가 목록 대신 곡 목록 표시
  countryView.style.display = "none";
  songsView.style.display = "block";


  // 제목
  if (selectedCountry) {

    countryTitle.innerHTML = `
      <span class="fi fi-${selectedCountry.toLowerCase()}"></span>
      ${getCountryName(selectedCountry)}
    `;

  } else {

    countryTitle.textContent =
      `검색 결과 (${filteredSongs.length}곡)`;

  }

  renderSongs(filteredSongs);
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

    item.innerHTML = `
      <h2>${song.title}</h2>

      <div class="song-content">

        <!-- 왼쪽: 기본 정보 -->
        <div class="song-info">

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
                      <span class="fi fi-${code.toLowerCase()}"></span>
                      ${getCountryName(code)}
                    </span>
                  `)
                  .join("")}
              </span>

            </div>

            ${
              song.songwriters.length > 0
                ? `
                  <div class="song-songwriters">
                    ${song.songwriters.join(", ")}
                  </div>
                `
                : ""
            }

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
              song.links.length > 0
                ? song.links
                    .map(link => `
                      <a
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
              song.youtube.length > 0
                ? song.youtube
                    .map(video => `
                      <a
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

    songList.appendChild(item);
  });
}