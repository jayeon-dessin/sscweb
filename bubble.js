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
let bubbleLinks = null; // 현재 가중치 기준 KNN 링크 (가중치 바뀌면 다시 계산됨)
let bubbleGroupsByKey = null; // 이미지 경로 -> 그 이미지를 공유하는 곡 배열
let bubbleFreqMaps = null; // tags/artist/songwriters/language 값별 등장 횟수 (희귀도 가중치용)

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

// Jaccard 유사도 (교집합 크기 / 합집합 크기) - 희귀도를 고려하지 않는 기본형.
// 지금은 안 쓰고, 아래 희귀도 가중 버전(weightedJaccardSimilarity)을 씀
function jaccardSimilarity(a, b) {
  const setA = new Set(a || []);
  const setB = new Set(b || []);

  if (setA.size === 0 && setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach(v => { if (setB.has(v)) intersection++; });

  const union = new Set([...setA, ...setB]).size;
  return union === 0 ? 0 : intersection / union;
}

// 전체 곡 중에서 특정 필드(tags/artist/songwriters/language)의 값별 등장 횟수를 셈.
// 예: 언어별로 '영어'가 175곡, '아이슬란드어'가 1곡처럼 -> 희귀도 가중치 계산에 씀
function buildFrequencyMap(songArray, field) {
  const freq = new Map();
  songArray.forEach(song => {
    (song[field] || []).forEach(value => {
      freq.set(value, (freq.get(value) || 0) + 1);
    });
  });
  return freq;
}

// 희귀도 가중 Jaccard 유사도. 흔한 값(예: 영어, 팝)을 공유하는 건 약하게,
// 희귀한 값(예: 아이슬란드어, 특정 소수 태그)을 공유하는 건 강하게 반영함.
// (그냥 Jaccard를 쓰면 흔한 값 하나만 같아도 아무 관련 없는 곡들이 전부
// 서로 "유사"하다고 나오면서 허브가 되어버리는 문제가 있어서 도입함)
function weightedJaccardSimilarity(a, b, freqMap) {

  const setA = new Set(a || []);
  const setB = new Set(b || []);

  if (setA.size === 0 && setB.size === 0) return 0;

  const allValues = new Set([...setA, ...setB]);
  if (allValues.size === 0) return 0;

  let weightedIntersection = 0;
  let weightedUnion = 0;

  allValues.forEach(value => {
    const count = freqMap?.get(value) || 1;
    // 등장 횟수가 많을수록(흔할수록) 가중치가 작아짐 (log 스케일로 완만하게)
    const weight = 1 / Math.log2(count + 1.5);

    weightedUnion += weight;
    if (setA.has(value) && setB.has(value)) {
      weightedIntersection += weight;
    }
  });

  return weightedUnion === 0 ? 0 : weightedIntersection / weightedUnion;
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

// 5가지 요소의 가중치. 슬라이더로 실시간 조절 가능 (합이 100이 아니어도
// computeSimilarity에서 알아서 비율로 정규화함)
const DEFAULT_BUBBLE_WEIGHTS = {
  geo: 20,
  tag: 30,
  artist: 20,
  writer: 15,
  language: 15,
};
let bubbleWeights = { ...DEFAULT_BUBBLE_WEIGHTS };

// 두 곡의 종합 유사도 (0~1). bubbleWeights를 정규화해서 가중 평균을 냄
function computeSimilarity(songA, songB) {
  const geoSim = geoSimilarity(songA, songB);
  const tagSim = weightedJaccardSimilarity(songA.tags, songB.tags, bubbleFreqMaps?.tags);
  const artistSim = weightedJaccardSimilarity(songA.artist, songB.artist, bubbleFreqMaps?.artist);
  const writerSim = weightedJaccardSimilarity(songA.songwriters, songB.songwriters, bubbleFreqMaps?.songwriters);
  const langSim = weightedJaccardSimilarity(songA.language, songB.language, bubbleFreqMaps?.language);

  const totalWeight =
    bubbleWeights.geo +
    bubbleWeights.tag +
    bubbleWeights.artist +
    bubbleWeights.writer +
    bubbleWeights.language;

  if (totalWeight <= 0) return 0;

  return (
    geoSim * bubbleWeights.geo +
    tagSim * bubbleWeights.tag +
    artistSim * bubbleWeights.artist +
    writerSim * bubbleWeights.writer +
    langSim * bubbleWeights.language
  ) / totalWeight;
}

// 곡마다 가장 유사한 K곡과 연결 (KNN, 중복 링크 제거).
// 화면에 선을 그리진 않지만, 배치(force simulation)와 마우스오버 강조에 계속 쓰임
function buildSimilarityLinks(representativeSongs, k = 4) {

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
    같은 이미지를 쓰는 곡
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

  // 희귀도 가중치 계산에 쓸 값별 등장 횟수는 곡 전체 기준으로 한 번만 구해둠
  // (가중치 슬라이더를 조작해도 이 등장 횟수 자체는 안 바뀌므로 다시 계산할 필요 없음)
  bubbleFreqMaps = {
    tags: buildFrequencyMap(songs, "tags"),
    artist: buildFrequencyMap(songs, "artist"),
    songwriters: buildFrequencyMap(songs, "songwriters"),
    language: buildFrequencyMap(songs, "language"),
  };

  const nodeGroups = groupSongsByImage(songs);
  bubbleNodesData = nodeGroups.map((group, i) => ({
    id: i,
    group,
    radius: bubbleRadiusFor(group),
  }));

  // 화면에는 그리지 않지만, 배치와 마우스오버 이웃 강조에 계속 사용
  bubbleLinks = buildSimilarityLinks(
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
    bubbleLinks.forEach(l => {
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
      d3.forceLink(bubbleLinks)
        .id(d => d.id)
        .distance(d => (18 + (1 - d.sim) * 65) * 1.2)
    )
    .force("charge", d3.forceManyBody().strength(-120))
    .force("x", d3.forceX(BUBBLE_WIDTH / 2).strength(0.02))
    .force("y", d3.forceY(BUBBLE_HEIGHT / 2).strength(0.02))
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

// -------------------------------------
// 가중치 슬라이더 (실시간으로 유사도 재계산 + 버블 재배치)
// -------------------------------------

// 가중치가 바뀌면 KNN 링크를 다시 계산하고, 돌아가는 시뮬레이션에
// 새 링크를 넣어서 다시 배치되도록 함
function applyBubbleWeightChange() {

  if (!bubbleInitStarted || !bubbleSimulation || !bubbleNodesData) return;

  bubbleLinks = buildSimilarityLinks(
    bubbleNodesData.map(n => representativeSongOf(n.group)),
    6
  );

  bubbleSimulation.force(
    "link",
    d3.forceLink(bubbleLinks)
      .id(d => d.id)
      .distance(d => (18 + (1 - d.sim) * 65) * 1.2)
  );

  bubbleSimulation.alpha(1).restart();
}

function setupBubbleWeightControls() {

  const sliderKeyToId = {
    geo: "bubble-weight-geo",
    tag: "bubble-weight-tag",
    artist: "bubble-weight-artist",
    writer: "bubble-weight-writer",
    language: "bubble-weight-language",
  };

  // 슬라이더를 드래그하는 동안 매번 447곡을 전부 재계산하면 버벅이므로,
  // 손을 뗀 뒤 잠깐 멈췄을 때 한 번만 재계산 (디바운스)
  let debounceTimer = null;

  function scheduleRecompute() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(applyBubbleWeightChange, 250);
  }

  function syncValueLabel(id, value) {
    const label = document.querySelector(`.bubble-weight-value[data-for="${id}"]`);
    if (label) label.textContent = value;
  }

  Object.entries(sliderKeyToId).forEach(([key, id]) => {

    const input = document.getElementById(id);
    if (!input) return;

    input.addEventListener("input", () => {
      bubbleWeights[key] = parseInt(input.value, 10);
      syncValueLabel(id, input.value);
      scheduleRecompute();
    });
  });

  document.getElementById("bubble-weight-reset")?.addEventListener("click", () => {

    bubbleWeights = { ...DEFAULT_BUBBLE_WEIGHTS };

    Object.entries(sliderKeyToId).forEach(([key, id]) => {
      const input = document.getElementById(id);
      if (input) input.value = DEFAULT_BUBBLE_WEIGHTS[key];
      syncValueLabel(id, DEFAULT_BUBBLE_WEIGHTS[key]);
    });

    applyBubbleWeightChange();
  });
}

setupBubbleWeightControls();
