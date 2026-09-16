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
let bubblePreviewedNodeId = null; // 한 번 클릭해서 옆에 미리보기가 떠 있는 버블의 id

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
  geo: 25,
  tag: 30,
  artist: 20,
  writer: 10,
  language: 15,
};
const bubbleWeights = { ...DEFAULT_BUBBLE_WEIGHTS }; // 고정값 - 사이트에서 조절 불가

// 두 곡의 종합 유사도 (0~1). bubbleWeights를 정규화해서 가중 평균을 냄
function computeSimilarity(songA, songB) {
  const geoSim = geoSimilarity(songA, songB);

  // 태그는 여러 곡이 합쳐진 그룹(버블)일 경우, 합친 태그 목록으로 계산한 뒤
  // 곡 수(제곱근 기하평균)로 나눠서 - 곡이 많이 묶인 그룹일수록 태그가
  // 많아져서 뭐든 잘 겹치는 것처럼 보이는 걸 막음. 단일 곡끼리는 그룹
  // 크기가 둘 다 1이라 나누는 값이 1이 되어 원래 계산과 동일함
  const groupSizeA = songA._groupSize || 1;
  const groupSizeB = songB._groupSize || 1;
  const rawTagSim = weightedJaccardSimilarity(songA.tags, songB.tags, bubbleFreqMaps?.tags);
  const tagSim = rawTagSim / Math.sqrt(groupSizeA * groupSizeB);

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
function buildSimilarityLinks(representativeSongs, k = 3) {

  const links = [];
  const seenPairs = new Set();

  representativeSongs.forEach((song, i) => {

    const candidates = representativeSongs
      .map((other, j) => ({ index: j, sim: computeSimilarity(song, other) }))
      .filter(entry => entry.index !== i && entry.sim > 0); // 조금도 안 겹치는 곡은 억지로 뽑지 않음

    // .sort()는 안정 정렬이라, 점수가 동점이면 원래 배열 순서(index가 작은 쪽)가
    // 항상 유리해짐. 가중치를 한두 요소에 몰면 동점이 아주 많아지는데, 이때
    // 매번 배열 앞쪽 곡만 뽑히는 걸 막기 위해 정렬 전에 후보 순서를 섞어서
    // 동점 처리가 공평하게(무작위로) 되도록 함
    for (let x = candidates.length - 1; x > 0; x--) {
      const y = Math.floor(Math.random() * (x + 1));
      [candidates[x], candidates[y]] = [candidates[y], candidates[x]];
    }

    const nearest = candidates
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

// 그룹(버블 하나)의 대표 곡 - 이미지·제목 등 화면 표시용으로만 사용
function representativeSongOf(group) {
  return group.songs[0];
}

// 유사도(KNN) 계산 전용: 그룹 안 모든 곡의 태그를 합쳐서 쓰되, 곡이 여러 개
// 묶인 그룹일수록 그 태그 목록으로 인한 유사도 기여가 옅어지도록
// _groupSize를 같이 담아둠 (computeSimilarity에서 이 값으로 나눔)
function similarityProfileFor(group) {
  const rep = representativeSongOf(group);

  const combinedTags = new Set();
  group.songs.forEach(song => (song.tags || []).forEach(tag => combinedTags.add(tag)));

  return {
    ...rep,
    tags: [...combinedTags],
    _groupSize: group.songs.length,
  };
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

// 버블을 처음 클릭했을 때 옆에 간단한 정보를 보여줌 (아직 페이지 이동은 안 함)
function showBubblePreview(d) {

  const panel = document.getElementById("bubble-preview");
  if (!panel) return;

  const rep = representativeSongOf(d.group);
  const count = d.group.songs.length;

  panel.classList.remove("hidden");

  const artwork = panel.querySelector(".bubble-preview-artwork");
  if (artwork) {
    artwork.innerHTML = "";
    artwork.classList.add("placeholder");
    artwork.classList.remove("no-artwork");
    if (typeof loadArtworkInto === "function") {
      loadArtworkInto(artwork, rep);
    }
  }

  const titleEl = document.getElementById("bubble-preview-title");
  if (titleEl) {
    titleEl.textContent = count > 1 ? `${rep.title} 외 ${count - 1}곡` : rep.title;
  }

  const artistEl = document.getElementById("bubble-preview-artist");
  if (artistEl) {
    const performers = rep.artist?.length ? rep.artist : (rep.songwriters || []);
    artistEl.textContent = performers.join(", ");
  }

  const metaEl = document.getElementById("bubble-preview-meta");
  if (metaEl) {
    const metaParts = [];
    if (rep.year) metaParts.push(rep.year);
    if (rep.tags?.length) metaParts.push(rep.tags.slice(0, 3).join(", "));
    metaEl.textContent = metaParts.join(" · ");
  }
}

function hideBubblePreview() {
  bubblePreviewedNodeId = null;
  document.getElementById("bubble-preview")?.classList.add("hidden");
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
    bubbleNodesData.map(n => similarityProfileFor(n.group)),
    3
  );

  // 평소엔 안 보이다가, 버블에 마우스를 올렸을 때만 연결선이 나타남
  // (노드보다 먼저 그려야 선이 버블 아래에 깔림)
  const linkSel = bubbleInnerGroup
    .append("g")
    .attr("class", "bubble-links")
    .selectAll("line.bubble-link")
    .data(bubbleLinks)
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

  // 실제 보이는 그림(배경/이미지/테두리 등)은 이 그룹 안에만 넣고,
  // hover 시 이 그룹만 확대함 - 마우스 판정 영역(히트 영역)은 따로 고정 크기로
  // 둬서, 버블이 커지는 동안 판정 경계가 마우스 위치를 스쳐 지나가며
  // mouseenter/mouseleave가 반복 발생해 깜빡이던 문제를 없앰
  const visualSel = nodeSel.append("g").attr("class", "bubble-visual");

  visualSel.append("circle")
    .attr("class", "bubble-bg")
    .attr("r", d => d.radius);

  // 앨범 이미지가 있는 곡(그룹)만 원형으로 잘라서 채움 (없으면 음표 아이콘 유지)
  visualSel.append("clipPath")
    .attr("id", d => `bubble-clip-${d.id}`)
    .append("circle")
    .attr("r", d => d.radius);

  visualSel
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

  visualSel
    .filter(d => !representativeSongOf(d.group).image)
    .append("text")
    .attr("class", "bubble-note")
    .attr("text-anchor", "middle")
    .attr("dy", "0.35em")
    .text("♪");

  visualSel.append("circle")
    .attr("class", "bubble-border")
    .attr("r", d => d.radius);

  // 실제로 마우스 이벤트를 받는 투명한 히트 영역. 크기가 고정이라
  // hover 중에도 판정 경계가 안 흔들림 (bubble-visual보다 나중에 그려서 맨 위에 옴)
  nodeSel.append("circle")
    .attr("class", "bubble-hit-area")
    .attr("r", d => d.radius + 4);

  nodeSel.append("title")
    .text(d => {
      const rep = representativeSongOf(d.group);
      if (d.group.songs.length === 1) {
        return `${rep.title} - ${(rep.artist || []).join(", ")}`;
      }
      return `${rep.title} 외 ${d.group.songs.length - 1}곡 (같은 이미지)`;
    });

  const hitAreaSel = nodeSel.select(".bubble-hit-area");

  hitAreaSel.on("click", (event, d) => {
    if (bubblePreviewedNodeId === d.id) {
      // 미리보기 상태였던 버블을 한 번 더 클릭 -> 진짜로 그 곡(들)로 이동
      hideBubblePreview();
      selectBubbleGroup(d.group);
    } else {
      // 처음 클릭한 버블(또는 다른 버블로 갈아탄 경우) -> 옆에 미리보기만 표시
      bubblePreviewedNodeId = d.id;
      showBubblePreview(d);
    }
  });

  // 배경(빈 곳)을 클릭하면 미리보기 닫기
  bubbleSvg.on("click", event => {
    if (event.target === bubbleSvg.node()) {
      hideBubblePreview();
    }
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

  // 노드 <g> 자체는 위치(translate)만 담당. 히트 영역 크기는 이걸로 안 바뀜
  function nodeTransform(d) {
    return `translate(${d.x},${d.y})`;
  }

  // 실제로 보이는 그림(.bubble-visual)만 hover 시 확대. 마우스 판정 영역과는
  // 분리되어 있어서, 커지는 동안 판정 경계가 마우스를 스쳐 지나가며
  // mouseenter/mouseleave가 반복 발생해 깜빡이던 문제가 없음
  function visualTransform(d) {
    return d.hovered ? "scale(1.35)" : "scale(1)";
  }

  hitAreaSel.on("mouseenter", (event, d) => {

    d.hovered = true;
    d3.select(event.currentTarget.parentNode).select(".bubble-visual")
      .attr("transform", visualTransform(d));

    const neighborIds = neighborIdsOf(d.id);
    nodeSel.select(".bubble-border")
      .classed("bubble-similar", n => neighborIds.has(n.id));

    linkSel.classed("bubble-link-active", l => {
      const s = typeof l.source === "object" ? l.source.id : l.source;
      const t = typeof l.target === "object" ? l.target.id : l.target;
      return s === d.id || t === d.id;
    });
  });

  hitAreaSel.on("mouseleave", (event, d) => {

    d.hovered = false;
    d3.select(event.currentTarget.parentNode).select(".bubble-visual")
      .attr("transform", visualTransform(d));

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
      d3.forceLink(bubbleLinks)
        .id(d => d.id)
        .distance(d => (18 + (1 - d.sim) * 65) * 1.2)
    )
    .force("charge", d3.forceManyBody().strength(-120))
    .force("x", d3.forceX(BUBBLE_WIDTH / 2).strength(0.02))
    .force("y", d3.forceY(BUBBLE_HEIGHT / 2).strength(0.02))
    .force("collide", d3.forceCollide(d => d.radius + 5))
    .on("tick", () => {
      linkSel
        .attr("x1", d => d.source.x)
        .attr("y1", d => d.source.y)
        .attr("x2", d => d.target.x)
        .attr("y2", d => d.target.y);

      nodeSel.attr("transform", nodeTransform);
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
