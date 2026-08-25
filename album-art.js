// -------------------------------------
// 앨범 아트
// -------------------------------------
//
// 이미지는 실행 중(브라우저)에 iTunes를 호출하지 않습니다.
// 대신 tools/cover-picker.html을 로컬에서 열어 미리 후보 이미지를 검토하고
// covers/ 폴더에 저장한 뒤, sscdbg.json의 song.image 필드에 로컬 경로를
// 기록해두는 방식입니다. 이렇게 하면 페이지 로딩이 즉시 끝나고,
// 화면에 나오는 이미지는 전부 사람이 직접 확인한 것만 보이게 됩니다.
//
// song.image가 없는 곡은 그냥 자리표시(placeholder) 아이콘으로 남습니다 -
// tools/cover-picker.html로 나중에 채워 넣으면 됩니다.

async function getAlbumArtURL(song) {
  return song.image || null;
}

async function loadArtworkInto(el, song) {
  if (!el) return;

  const url = await getAlbumArtURL(song);

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
