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


// -------------------------------------
// 국가 코드 → 국기
// -------------------------------------

function codeToFlag(code) {
  return code
    .toUpperCase()
    .replace(/./g, char =>
      String.fromCodePoint(
        127397 + char.charCodeAt()
      )
    );
}


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
      const j = Math.floor(
        Math.random() * (i + 1)
      );

      [songs[i], songs[j]] =
        [songs[j], songs[i]];
    }


    // 첫 화면
    renderCountries();
  })

  .catch(error => {
    console.error(
      "JSON을 불러오는 중 오류:",
      error
    );
  });


// -------------------------------------
// 국가 목록 출력
// -------------------------------------

function renderCountries() {

  selectedCountry = null;

  countryView.style.display = "block";
  songsView.style.display = "none";

  countryList.innerHTML = "";


  // 모든 곡의 countries를 하나로 합친 뒤 중복 제거
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
      <span class="country-flag">
        ${codeToFlag(code)}
      </span>

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


  countryTitle.textContent =
    `${codeToFlag(code)} ${getCountryName(code)}`;


  const countrySongs = songs.filter(song =>
    song.countries.includes(code)
  );


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
    .sort();


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

  artistFilter.value = "all";
  languageFilter.value = "all";
  tagSearch.value = "";

  renderCountries();
});


// -------------------------------------
// 필터 적용
// -------------------------------------

function applyFilters() {

  if (!selectedCountry) {
    return;
  }


  const selectedArtist =
    artistFilter.value;

  const selectedLanguage =
    languageFilter.value;

  const keyword =
    tagSearch.value.trim().toLowerCase();


  const filteredSongs = songs.filter(song => {


    // 선택한 국가
    if (
      !song.countries.includes(
        selectedCountry
      )
    ) {
      return false;
    }


    // 아티스트
    if (
      selectedArtist !== "all" &&
      !song.artist.includes(selectedArtist)
    ) {
      return false;
    }


    // 언어
    if (
      selectedLanguage !== "all" &&
      !song.language.includes(selectedLanguage)
    ) {
      return false;
    }


    // 검색
    if (keyword) {

      const titleMatch =
        song.title
          .toLowerCase()
          .includes(keyword);


      const artistMatch =
        song.artist.some(artist =>
          artist
            .toLowerCase()
            .includes(keyword)
        );


      const tagMatch =
        song.tags.some(tag =>
          tag
            .toLowerCase()
            .includes(keyword)
        );


      if (
        !titleMatch &&
        !artistMatch &&
        !tagMatch
      ) {
        return false;
      }
    }


    return true;
  });


  renderSongs(filteredSongs);
}


// -------------------------------------
// 곡 목록 출력
// -------------------------------------

function renderSongs(songArray) {

  songList.innerHTML = "";


  songArray.forEach(song => {

    const item =
      document.createElement("div");


    item.innerHTML = `
      <h2>${song.title}</h2>

      <p>
        Artist:
        ${song.artist.join(", ")}
      </p>

      <p>
        Year:
        ${song.year}
      </p>

      <p>
        Language:
        ${song.language.join(", ")}
      </p>

      <p>
        Tags:
        ${song.tags
          .map(tag =>
            `<span class="tag">${tag}</span>`
          )
          .join(" ")}
      </p>

      ${
        song.memo
          ? `
            <p>
              <strong>Memo:</strong>
              ${song.memo}
            </p>
          `
          : ""
      }

      ${
        song.links.length > 0
          ? `
            <div>
              ${song.links
                .map(link =>
                  `<a
                    href="${link.url}"
                    target="_blank"
                  >
                    ${link.title}
                  </a>`
                )
                .join("<br>")}
            </div>
          `
          : ""
      }

      ${
        song.youtube.length > 0
          ? `
            <div>
              ${song.youtube
                .map(video =>
                  `<a
                    href="${video.url}"
                    target="_blank"
                  >
                    ${video.title}
                  </a>`
                )
                .join("<br>")}
            </div>
          `
          : ""
      }
    `;


    songList.appendChild(item);
  });
}