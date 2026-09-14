// -------------------------------------
// 버블 뷰 (D3 force simulation, 곡 유사도 기반)
// script.js가 이미 로드한 songs / showSingleSongDetail / renderCompactSongGrid 등을
// 그대로 사용하고, geo-data.js의 COUNTRY_CENTROIDS로 지리적 유사도를 계산합니다.
// -------------------------------------

let bubbleInitStarted = false;
let bubbleSvg = null;
let bubbleInnerGroup = null;
let bubbleSimulation = null;
let bubbleZoomBehavior = null;
let bubbleNodesData = null;
let bubbleGroupsByKey = null; // 이미지 경로 -> 그 이미지를 공유하는 곡 배열

const BUBBLE_WIDTH = 1000;
const BUBBLE_HEIGHT = 640;
const BUBBLE_RADIUS = 25;

// 두 [경도, 위도] 좌표 사이의 거리 (km, haversine 공식)
function haversineDistanceKm(coordA, coordB) {
  const [lon1, lat1] = coordA;
  const [lon2, lat2] = coordB;

  const R = 6371;
  const toRad = deg => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Jaccard 유사도 (교집합 크기 / 합집합 크기)
function jaccardSimilarity(a, b) {
  const setA = new Set(a || []);
  const setB = new Set(b || []);

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach(v => { if (setB.has(v)) intersection++; });

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// 두 곡의 지리적 유사도 (0~1). 같은 나라끼리는 0으로 둠 -
// 같은 나라는 이미 아티스트/언어 등 다른 요소로 연결될 가능성이 높으므로,
// 지리적 유사도는 "다른 나라인데 가까운 경우"에 보너스를 주는 용도로 씀
function geoSimilarity(songA, songB) {

  const countriesA = (songA.countries || []).filter(
    code => typeof COUNTRY_CENTROIDS !== "undefined" && COUNTRY_CENTROIDS[code]
  );
  const countriesB = (songB.countries || []).filter(
    code => typeof COUNTRY_CENTROIDS !== "undefined" && COUNTRY_CENTROIDS[code]
  );

  if (countriesA.length === 0 || countriesB.length === 0) return 0;

  let minDistance = Infinity;

  countriesA.forEach(codeA => {
    countriesB.forEach(codeB => {
      if (codeA === codeB) return; // 같은 나라는 0으로 취급하므로 거리 계산에서 제외
      const distance = haversineDistanceKm(
        COUNTRY_CENTROIDS[codeA],
        COUNTRY_CENTROIDS[codeB]
      );
      if (distance < minDistance) minDistance = distance;
    });
  });

  if (minDistance === Infinity) return 0;

  // 지구 반대편(약 20000km)에 가까울수록 0, 가까운 나라일수록 1에 가깝게
  const MAX_MEANINGFUL_DISTANCE_KM = 20000;
  return Math.max(0, 1 - minDistance / MAX_MEANINGFUL_DISTANCE_KM);
}

// 두 곡의 종합 유사도 (0~1)
// 가중치: 지리 45% / 태그 22% / 아티스트 18% / 작곡·작사자 12% / 언어 3%
// (원래는 지리 35%였는데, 지리적 인접성의 비중을 조금 더 키움)
function computeSimilarity(songA, songB) {
  const geoSim = geoSimilarity(songA, songB);
  const tagSim = jaccardSimilarity(songA.tags, songB.tags);
  const artistSim = jaccardSimilarity(songA.artist, songB.artist);
  const writerSim = jaccardSimilarity(songA.songwriters, songB.songwriters);
  const langSim = jaccardSimilarity(songA.language, songB.language);

  return (
    geoSim * 0.3 +
    tagSim * 0.3 +
    artistSim * 0.2 +
    writerSim * 0.1 +
    langSim * 0.1
  );
}

// 곡마다 가장 유사한 K곡과 연결 (KNN, 중복 링크 제거).
// 화면에 선을 그리진 않지만, 배치(force simulation)와 마우스오버 강조에 계속 쓰임
function buildSimilarityLinks(representativeSongs, k = 6) {

  const links = [];
  const seenPairs = new Set();

  representativeSongs.forEach((song, i) => {

    const nearest = representativeSongs
      .map((other, j) => ({ index: j, sim: computeSimilarity(song, other) }))
      .filter(entry => entry.index !== i)
      .sort((a, b) => b.sim - a.sim)
      .slice(0, k);

    nearest.forEach(entry => {
      const key = i < entry.index ? `${i}-${entry.index}` : `${entry.index}-${i}`;
      if (seenPairs.has(key)) return;
      seenPairs.add(key);
      links.push({ source: i, target: entry.index, sim: entry.sim });
    });
  });

  return links;
}

// 같은 앨범 이미지를 쓰는 곡들을 하나의 버블(그룹)로 묶음.
// 이미지가 없거나, 이미지가 있어도 그 이미지를 쓰는 곡이 자기 하나뿐이면 단일 곡 버블
function groupSongsByImage(songArray) {

  const byImage = new Map();
  songArray.forEach(song => {
    if (!song.image) return;
    if (!byImage.has(song.image)) byImage.set(song.image, []);
    byImage.get(song.image).push(song);
  });

  bubbleGroupsByKey = new Map();

  const seenImages = new Set();
  const nodeGroups = [];

  songArray.forEach(song => {

    if (song.image && byImage.get(song.image).length > 1) {
      if (seenImages.has(song.image)) return;
      seenImages.add(song.image);

      const groupSongs = byImage.get(song.image);
      bubbleGroupsByKey.set(song.image, groupSongs);
      nodeGroups.push({ songs: groupSongs, groupKey: song.image });
    } else {
      nodeGroups.push({ songs: [song], groupKey: null });
    }
  });

  return nodeGroups;
}

// 그룹(버블 하나)의 대표 곡 - 유사도 계산·제목 표시 등에 사용
function representativeSongOf(group) {
  return group.songs[0];
}

// 곡 수에 따라 버블 반지름을 키움 (면적이 곡 수에 비례하도록 제곱근 스케일)
function bubbleRadiusFor(group) {
  return BUBBLE_RADIUS * Math.sqrt(group.songs.length);
}

// 그룹(버블) 하나를 선택했을 때: 곡이 하나면 바로 상세로,
// 여러 곡이 묶여있으면 국가/태그 화면과 같은 간략 카드 목록으로 보여줌
function selectBubbleGroup(group) {

  if (group.songs.length === 1) {
    showSingleSongDetail(group.songs[0], group.songs[0].title);
    return;
  }

  selectedCountry = null;
  selectedTag = null;
  compactListReturnTo = null;

  showSongsUI();

  countryTitle.innerHTML = `
    이 이미지를 공유하는 곡
    <span class="country-title-count">${group.songs.length}곡</span>
  `;

  songList.classList.add("song-list-compact");
  renderCompactSongGrid(songList, group.songs, {
    returnTo: { type: "bubbleGroup", value: group.groupKey },
  });
}

// 뒤로가기에서 특정 그룹으로 복귀할 때 사용 (script.js의 back-button 핸들러가 호출)
function selectBubbleGroupByKey(groupKey) {
  const groupSongs = bubbleGroupsByKey?.get(groupKey);
  if (!groupSongs) return;
  selectBubbleGroup({ songs: groupSongs, groupKey });
}

function initBubbleView() {

  if (bubbleInitStarted) return;
  bubbleInitStarted = true;

  bubbleSvg = d3.select("#bubble-svg");
  bubbleInnerGroup = bubbleSvg.append("g").attr("class", "bubble-inner");

  const nodeGroups = groupSongsByImage(songs);
  bubbleNodesData = nodeGroups.map((group, i) => ({
    id: i,
    group,
    radius: bubbleRadiusFor(group),
  }));

  // 화면에는 그리지 않지만, 배치와 마우스오버 이웃 강조에 계속 사용
  const links = buildSimilarityLinks(
    bubbleNodesData.map(n => representativeSongOf(n.group)),
    6
  );

  const nodeSel = bubbleInnerGroup
    .append("g")
    .attr("class", "bubble-nodes")
    .selectAll("g.bubble-node")
    .data(bubbleNodesData)
    .join("g")
    .attr("class", "bubble-node")
    .style("cursor", "pointer");

  nodeSel.append("circle")
    .attr("class", "bubble-bg")
    .attr("r", d => d.radius);

  // 앨범 이미지가 있는 곡(그룹)만 원형으로 잘라서 채움 (없으면 음표 아이콘 유지)
  nodeSel.append("clipPath")
    .attr("id", d => `bubble-clip-${d.id}`)
    .append("circle")
    .attr("r", d => d.radius);

  nodeSel
    .filter(d => !!representativeSongOf(d.group).image)
    .append("image")
    .attr("class", "bubble-image")
    .attr("clip-path", d => `url(#bubble-clip-${d.id})`)
    .attr("x", d => -d.radius)
    .attr("y", d => -d.radius)
    .attr("width", d => d.radius * 2)
    .attr("height", d => d.radius * 2)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .attr("href", d => representativeSongOf(d.group).image)
    .attr("xlink:href", d => representativeSongOf(d.group).image);

  nodeSel
    .filter(d => !representativeSongOf(d.group).image)
    .append("text")
    .attr("class", "bubble-note")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text("♪");

  nodeSel.append("circle")
    .attr("class", "bubble-border")
    .attr("r", d => d.radius);

  nodeSel.append("title")
    .text(d => {
      const rep = representativeSongOf(d.group);
      if (d.group.songs.length === 1) {
        return `${rep.title} - ${(rep.artist || []).join(", ")}`;
      }
      return `${rep.title} 외 ${d.group.songs.length - 1}곡 (같은 이미지)`;
    });

  nodeSel.on("click", (event, d) => {
    selectBubbleGroup(d.group);
  });

  function neighborIdsOf(nodeId) {
    const ids = new Set();
    links.forEach(l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      if (s === nodeId) ids.add(t);
      if (t === nodeId) ids.add(s);
    });
    return ids;
  }

  nodeSel.on("mouseenter", (event, d) => {
    const neighborIds = neighborIdsOf(d.id);
    nodeSel.select(".bubble-border")
      .classed("bubble-similar", n => neighborIds.has(n.id));
  });

  nodeSel.on("mouseleave", () => {
    nodeSel.select(".bubble-border").classed("bubble-similar", false);
  });

  const drag = d3.drag()
    .on("start", (event, d) => {
      if (!event.active) bubbleSimulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
    })
    .on("end", (event, d) => {
      if (!event.active) bubbleSimulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });

  nodeSel.call(drag);

  bubbleSimulation = d3.forceSimulation(bubbleNodesData)
    .velocityDecay(0.5)
    .force(
      "link",
      d3.forceLink(links)
        .id(d => d.id)
        .distance(d => (18 + (1 - d.sim) * 65) * 1.2)
    )
    .force("charge", d3.forceManyBody().strength(-45))
    .force("x", d3.forceX(BUBBLE_WIDTH / 2).strength(0.005))
    .force("y", d3.forceY(BUBBLE_HEIGHT / 2).strength(0.005))
    .force("collide", d3.forceCollide(d => d.radius + 5))
    .on("tick", () => {
      nodeSel.attr("transform", d => `translate(${d.x},${d.y})`);
    });

  bubbleZoomBehavior = d3.zoom()
    .scaleExtent([0.5, 6])
    .on("zoom", event => {
      bubbleInnerGroup.attr("transform", event.transform);
    });

  bubbleSvg.call(bubbleZoomBehavior);

  document.getElementById("bubble-reset-layout")?.addEventListener("click", () => {
    bubbleNodesData.forEach(n => {
      n.fx = null;
      n.fy = null;
    });
    bubbleSimulation.alpha(1).restart();
  });

  document.getElementById("bubble-reset-zoom")?.addEventListener("click", () => {
    bubbleSvg.transition().duration(600)
      .call(bubbleZoomBehavior.transform, d3.zoomIdentity);
  });
}
