// -------------------------------------
// 곡 유사도 버블 뷰 (D3 force simulation)
// -------------------------------------
//
// 곡마다 아티스트/작곡가/언어/태그/국가 위치를 바탕으로 유사도를 계산하고,
// 각 곡을 가장 비슷한 상위 몇 곡과만 연결한 뒤(KNN 희소 그래프) d3-force로
// 자연스럽게 서로 가까워지도록 배치합니다.

const BUBBLE_WIDTH = 1000;
const BUBBLE_HEIGHT = 640;
const BUBBLE_NODE_RADIUS = 22;
const BUBBLE_KNN = 4; // 곡마다 연결할 최근접 이웃 수

let bubbleInitStarted = false;
let bubbleSimulation = null;
let bubbleSvg = null;
let bubbleInnerGroup = null;
let bubbleZoomBehavior = null;
let bubbleCursorPoint = null;

// -------------------------------------
// 유사도 계산
// -------------------------------------

function jaccardSimilarity(listA, listB) {
  const setA = new Set((listA || []).filter(Boolean));
  const setB = new Set((listB || []).filter(Boolean));

  if (setA.size === 0 || setB.size === 0) return 0;

  let intersection = 0;
  setA.forEach(item => {
    if (setB.has(item)) intersection++;
  });

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function toRadians(deg) {
  return (deg * Math.PI) / 180;
}

// 두 [경도, 위도] 좌표 사이의 거리 (km, haversine 공식)
function haversineDistanceKm(coordA, coordB) {
  const [lon1, lat1] = coordA;
  const [lon2, lat2] = coordB;

  const R = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// 두 곡의 국가 목록 중 가장 가까운 조합을 기준으로 지리적 유사도(0~1) 산출
// (같은 국가가 하나라도 겹치면 1, 멀수록 지수적으로 감소)
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
      if (codeA === codeB) {
        minDistance = 0;
        return;
      }
      const distance = haversineDistanceKm(
        COUNTRY_CENTROIDS[codeA],
        COUNTRY_CENTROIDS[codeB]
      );
      if (distance < minDistance) minDistance = distance;
    });
  });

  if (!isFinite(minDistance)) return 0;

  // 반감 거리 약 2000km: 가까운 나라일수록 높은 점수, 대륙이 다르면 낮은 점수
  return Math.exp(-minDistance / 2000);
}

const SIMILARITY_WEIGHTS = {
  tags: 0.35,
  geo: 0.25,
  artist: 0.2,
  songwriters: 0.15,
  language: 0.05,
};

function computeSimilarity(songA, songB) {
  const tagSim = jaccardSimilarity(songA.tags, songB.tags);
  const geoSim = geoSimilarity(songA, songB);
  const artistSim = jaccardSimilarity(songA.artist, songB.artist);
  const writerSim = jaccardSimilarity(songA.songwriters, songB.songwriters);
  const langSim = jaccardSimilarity(songA.language, songB.language);

  return (
    tagSim * SIMILARITY_WEIGHTS.tags +
    geoSim * SIMILARITY_WEIGHTS.geo +
    artistSim * SIMILARITY_WEIGHTS.artist +
    writerSim * SIMILARITY_WEIGHTS.songwriters +
    langSim * SIMILARITY_WEIGHTS.language
  );
}

// 각 곡을 가장 비슷한 상위 k곡과만 연결하는 희소 그래프 생성
// (모든 쌍을 다 연결하면 화면이 털뭉치가 되어 오히려 관련성이 안 보임)
function buildSimilarityLinks(songArray, k) {
  const n = songArray.length;
  const candidateLinks = [];

  for (let i = 0; i < n; i++) {
    const scores = [];

    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const sim = computeSimilarity(songArray[i], songArray[j]);
      if (sim > 0) {
        scores.push({ index: j, sim });
      }
    }

    scores.sort((a, b) => b.sim - a.sim);

    scores.slice(0, k).forEach(({ index, sim }) => {
      candidateLinks.push({ source: i, target: index, sim });
    });
  }

  // KNN은 대칭이 아니므로(A의 이웃이 B라고 해서 B의 이웃이 꼭 A는 아님)
  // 같은 쌍이 두 번 들어오지 않도록 정리
  const seen = new Map();

  candidateLinks.forEach(link => {
    const key =
      Math.min(link.source, link.target) +
      "-" +
      Math.max(link.source, link.target);

    const existing = seen.get(key);
    if (!existing || link.sim > existing.sim) {
      seen.set(key, link);
    }
  });

  return [...seen.values()];
}

// -------------------------------------
// 렌더링
// -------------------------------------

function initBubbleView() {
  if (bubbleInitStarted) return;
  bubbleInitStarted = true;

  bubbleSvg = d3.select("#bubble-svg");

  const nodes = songs.map((song, index) => ({ id: index, song }));
  const links = buildSimilarityLinks(songs, BUBBLE_KNN);

  bubbleInnerGroup = bubbleSvg.append("g").attr("class", "bubble-inner");

  const linkGroup = bubbleInnerGroup.append("g").attr("class", "bubble-links");
  const nodeGroup = bubbleInnerGroup.append("g").attr("class", "bubble-nodes");

  const linkLines = linkGroup
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("class", "bubble-link")
    .attr("stroke-width", d => 0.6 + d.sim * 2.2)
    .attr("stroke-opacity", d => 0.12 + d.sim * 0.4);

  const dragBehavior = d3
    .drag()
    .on("start", (event, d) => {
      if (!event.active) bubbleSimulation.alphaTarget(0.3).restart();
      d.fx = d.x;
      d.fy = d.y;
      d.__dragMoved = false;
    })
    .on("drag", (event, d) => {
      d.fx = event.x;
      d.fy = event.y;
      d.__dragMoved = true;
    })
    .on("end", (event, d) => {
      if (!event.active) bubbleSimulation.alphaTarget(0);
      d.fx = null;
      d.fy = null;
    });

  const nodeGroups = nodeGroup
    .selectAll("g.bubble-node")
    .data(nodes, d => d.id)
    .join("g")
    .attr("class", "bubble-node")
    .call(dragBehavior)
    .on("click", (event, d) => {
      if (d.__dragMoved) {
        d.__dragMoved = false;
        return;
      }
      selectSongFromBubble(d.song);
    });

  nodeGroups
    .append("clipPath")
    .attr("id", d => `bubble-clip-${d.id}`)
    .append("circle")
    .attr("r", BUBBLE_NODE_RADIUS);

  nodeGroups.append("circle").attr("class", "bubble-bg").attr("r", BUBBLE_NODE_RADIUS);

  nodeGroups
    .append("image")
    .attr("class", "bubble-image")
    .attr("clip-path", d => `url(#bubble-clip-${d.id})`)
    .attr("x", -BUBBLE_NODE_RADIUS)
    .attr("y", -BUBBLE_NODE_RADIUS)
    .attr("width", BUBBLE_NODE_RADIUS * 2)
    .attr("height", BUBBLE_NODE_RADIUS * 2)
    .attr("preserveAspectRatio", "xMidYMid slice")
    .style("display", "none");

  nodeGroups
    .append("text")
    .attr("class", "bubble-note")
    .attr("text-anchor", "middle")
    .attr("dominant-baseline", "central")
    .text("♪");

  nodeGroups
    .append("circle")
    .attr("class", "bubble-border")
    .attr("r", BUBBLE_NODE_RADIUS)
    .attr("fill", "none");

  nodeGroups.append("title").text(d => `${d.song.title} · ${(d.song.artist || []).join(", ")}`);

  // 이미지가 있는 곡은 로드되면 자리표시(음표)를 이미지로 교체
  nodeGroups.each(function (d) {
    if (!d.song.image) return;

    const group = d3.select(this);
    const image = group.select("image.bubble-image");
    const note = group.select("text.bubble-note");

    image
      .on("load", () => {
        image.style("display", null);
        note.style("display", "none");
      })
      .on("error", () => {
        image.style("display", "none");
      })
      .attr("href", d.song.image);
  });

  // -------------------------------------
  // force simulation
  // -------------------------------------

  bubbleSimulation = d3
    .forceSimulation(nodes)
    .force(
      "link",
      d3
        .forceLink(links)
        .id(d => d.id)
        .distance(d => 40 + (1 - d.sim) * 90)
        .strength(d => 0.15 + d.sim * 0.5)
    )
    .force("charge", d3.forceManyBody().strength(-45))
    .force("center", d3.forceCenter(BUBBLE_WIDTH / 2, BUBBLE_HEIGHT / 2))
    .force("collide", d3.forceCollide(BUBBLE_NODE_RADIUS + 3))
    .on("tick", () => {
      applyCursorForce(nodes);

      nodeGroups.attr("transform", d => `translate(${d.x},${d.y})`);

      linkLines
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);
    });

  // -------------------------------------
  // 커서 인터랙션: 마우스 근처 버블이 살짝 밀려남
  // -------------------------------------

  bubbleSvg
    .on("pointermove", event => {
      const [x, y] = d3.pointer(event, bubbleInnerGroup.node());
      bubbleCursorPoint = { x, y };

      if (bubbleSimulation.alpha() < 0.05) {
        bubbleSimulation.alphaTarget(0.05).restart();
      }
    })
    .on("pointerleave", () => {
      bubbleCursorPoint = null;
      bubbleSimulation.alphaTarget(0);
    });

  // -------------------------------------
  // 확대/축소
  // -------------------------------------

  bubbleZoomBehavior = d3
    .zoom()
    .scaleExtent([0.3, 4])
    .filter(event => !event.target.closest(".bubble-node"))
    .on("zoom", event => {
      bubbleInnerGroup.attr("transform", event.transform);
    });

  bubbleSvg.call(bubbleZoomBehavior);

  const resetZoomButton = document.getElementById("bubble-reset-zoom");
  resetZoomButton?.addEventListener("click", () => {
    bubbleSvg
      .transition()
      .duration(600)
      .call(bubbleZoomBehavior.transform, d3.zoomIdentity);
  });
}

// 마우스 근처의 버블을 부드럽게 밀어냄 (드래그 중인 노드는 건드리지 않음)
function applyCursorForce(nodes) {
  if (!bubbleCursorPoint) return;

  const influenceRadius = 90;

  nodes.forEach(node => {
    if (node.fx != null || node.fy != null) return;

    const dx = node.x - bubbleCursorPoint.x;
    const dy = node.y - bubbleCursorPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy) || 0.0001;

    if (distance < influenceRadius) {
      const push = ((influenceRadius - distance) / influenceRadius) * 3;
      node.x += (dx / distance) * push;
      node.y += (dy / distance) * push;
    }
  });
}

// 버블 클릭 시 그 곡 하나만 곡 목록 화면에 표시 (뒤로가기는 다시 버블 뷰로)
function selectSongFromBubble(song) {
  selectedCountry = null;

  showSongsUI();

  countryTitle.innerHTML = `${song.title}`;

  renderSongs([song]);

  updateURLState(true);
}
