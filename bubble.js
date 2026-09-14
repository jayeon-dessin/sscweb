// -------------------------------------
// 버블 뷰 (D3 force simulation, 곡 유사도 기반)
// script.js가 이미 로드한 songs / showSingleSongDetail 등을 그대로 사용하고,
// geo-data.js의 COUNTRY_CENTROIDS로 지리적 유사도를 계산합니다.
// -------------------------------------

let bubbleInitStarted = false;
let bubbleSvg = null;
let bubbleInnerGroup = null;
let bubbleSimulation = null;
let bubbleZoomBehavior = null;
let bubbleNodesData = null;

const BUBBLE_WIDTH = 1000;
const BUBBLE_HEIGHT = 640;
const BUBBLE_RADIUS = 16;

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
// 가중치: 지리 35% / 태그 25% / 아티스트 20% / 작곡·작사자 15% / 언어 5%
function computeSimilarity(songA, songB) {
  const geoSim = geoSimilarity(songA, songB);
  const tagSim = jaccardSimilarity(songA.tags, songB.tags);
  const artistSim = jaccardSimilarity(songA.artist, songB.artist);
  const writerSim = jaccardSimilarity(songA.songwriters, songB.songwriters);
  const langSim = jaccardSimilarity(songA.language, songB.language);

  return (
    geoSim * 0.35 +
    tagSim * 0.25 +
    artistSim * 0.20 +
    writerSim * 0.15 +
    langSim * 0.05
  );
}

// 곡마다 가장 유사한 K곡과 연결 (KNN, 중복 링크 제거)
function buildSimilarityLinks(songArray, k = 6) {

  const links = [];
  const seenPairs = new Set();

  songArray.forEach((song, i) => {

    const nearest = songArray
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

function initBubbleView() {

  if (bubbleInitStarted) return;
  bubbleInitStarted = true;

  bubbleSvg = d3.select("#bubble-svg");
  bubbleInnerGroup = bubbleSvg.append("g").attr("class", "bubble-inner");

  bubbleNodesData = songs.map((song, i) => ({ id: i, song }));
  const links = buildSimilarityLinks(songs, 6);

  const linkSel = bubbleInnerGroup
    .append("g")
    .attr("class", "bubble-links")
    .selectAll("line.bubble-link")
    .data(links)
    .join("line")
    .attr("class", "bubble-link");

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
    .attr("r", BUBBLE_RADIUS);

  nodeSel.append("circle")
    .attr("class", "bubble-border")
    .attr("r", BUBBLE_RADIUS);

  nodeSel.append("text")
    .attr("class", "bubble-note")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text("♪");

  nodeSel.append("title")
    .text(d => `${d.song.title} - ${(d.song.artist || []).join(", ")}`);

  nodeSel.on("click", (event, d) => {
    showSingleSongDetail(d.song, d.song.title);
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

    linkSel.classed("bubble-link-active", l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return s === d.id || t === d.id;
    });
  });

  nodeSel.on("mouseleave", () => {
    nodeSel.select(".bubble-border").classed("bubble-similar", false);
    linkSel.classed("bubble-link-active", false);
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
    .force("charge", d3.forceManyBody().strength(-24))
    .force("x", d3.forceX(BUBBLE_WIDTH / 2).strength(0.03))
    .force("y", d3.forceY(BUBBLE_HEIGHT / 2).strength(0.03))
    .force("collide", d3.forceCollide(BUBBLE_RADIUS + 3))
    .on("tick", () => {
      linkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

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
