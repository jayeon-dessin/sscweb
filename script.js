let songs = [];

const artistFilter = document.getElementById("artist-filter");
const languageFilter = document.getElementById("language-filter");
const songList = document.getElementById("song-list");

fetch("sscdbg.json")
  .then(response => response.json())
  .then(data => {
    songs = data;

    makeArtistFilter();
    makeLanguageFilter();
    renderSongs(songs);
  });

function makeArtistFilter() {
  const artists = [...new Set(songs.map(song => song.artist))];

  artists.sort();

  artists.forEach(artist => {
    const option = document.createElement("option");
    option.value = artist;
    option.textContent = artist;
    artistFilter.appendChild(option);
  });
}

function makeLanguageFilter() {
  const languages = [...new Set(songs.map(song => song.language))];

  languages.sort();

  languages.forEach(language => {
    const option = document.createElement("option");
    option.value = language;
    option.textContent = language;
    languageFilter.appendChild(option);
  });
}

artistFilter.addEventListener("change", applyFilters);
languageFilter.addEventListener("change", applyFilters);

function applyFilters() {
  const selectedArtist = artistFilter.value;
  const selectedLanguage = languageFilter.value;

  const filteredSongs = songs.filter(song => {
    if (selectedArtist !== "all" && song.artist !== selectedArtist) {
      return false;
    }

    if (selectedLanguage !== "all" && song.language !== selectedLanguage) {
      return false;
    }

    return true;
  });

  renderSongs(filteredSongs);
}

function renderSongs(songArray) {
  songList.innerHTML = "";

  songArray.forEach(song => {
    const item = document.createElement("div");

    item.innerHTML = `
      <h2>${song.id}. ${song.title}</h2>
      <p>Artist: ${song.artist}</p>
      <p>Year: ${song.year}</p>
      <p>Language: ${song.language}</p>
      <p>Tags: ${song.tags.join(", ")}</p>

      ${
        song.memo
          ? `<p>Memo: <a href="${song.memo}" target="_blank">링크</a></p>`
          : ""
      }

      <div>
        ${song.youtube
          .map(
            video => `
              <a href="${video.url}" target="_blank">${video.title}</a>
            `
          )
          .join("<br>")}
      </div>

      <hr>
    `;

    songList.appendChild(item);
  });
}