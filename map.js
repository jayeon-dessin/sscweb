// -------------------------------------
// 지도 뷰 (D3 + topojson)
// script.js가 이미 로드한 songs / getCountryCounts / getCountryName /
// selectCountry / normalizeSearchText 등을 그대로 사용합니다.
// -------------------------------------

const MAP_WIDTH = 960;
const MAP_HEIGHT = 500;

let mapInitStarted = false;
let mapProjection = null;
let mapPathGenerator = null;
let mapZoomBehavior = null;
let mapSvg = null;
let mapInnerGroup = null;
let mapDotGroup = null;

// numeric id(ISO 3166-1) -> 해당 id를 쓰는 geojson feature 배열
// (예: 호주 본토 + Ashmore and Cartier Is.처럼 한 나라가 여러 조각으로 나뉘기도 함)
const worldFeaturesByNumericId = new Map();

function buildNumericToAlpha2() {
  const map = new Map();
  Object.entries(ALPHA2_TO_NUMERIC).forEach(([alpha2, numeric]) => {
    map.set(numeric, alpha2);
  });
  return map;
}

async function initMap() {

  if (mapInitStarted) return;
  mapInitStarted = true;

  mapSvg = d3.select("#world-map");

  // 바다/배경
  mapSvg.append("rect")
    .attr("class", "map-ocean")
    .attr("x", 0)
    .attr("y", 0)
    .attr("width", MAP_WIDTH)
    .attr("height", MAP_HEIGHT);

  let topology;

  try {
    const response = await fetch(
      "https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json"
    );
    topology = await response.json();
  } catch (error) {
    console.error("지도 데이터를 불러오는 중 오류:", error);

    mapSvg.append("text")
      .attr("x", MAP_WIDTH / 2)
      .attr("y", MAP_HEIGHT / 2)
      .attr("text-anchor", "middle")
      .attr("class", "map-error-text")
      .text("지도를 불러오지 못했습니다. 새로고침해 주세요.");

    return;
  }

  const worldFeatures = topojson.feature(
    topology,
    topology.objects.countries
  ).features;

  worldFeatures.forEach(feature => {
    const list = worldFeaturesByNumericId.get(feature.id) || [];
    list.push(feature);
    worldFeaturesByNumericId.set(feature.id, list);
  });

  mapProjection = d3.geoNaturalEarth1()
    .fitSize(
      [MAP_WIDTH, MAP_HEIGHT],
      { type: "FeatureCollection", features: worldFeatures }
    );

  mapPathGenerator = d3.geoPath().projection(mapProjection);

  mapInnerGroup = mapSvg.append("g").attr("class", "map-inner");

  const countryCounts = getCountryCounts();
  const numericToAlpha2 = buildNumericToAlpha2();

  // 국가 폴리곤
  mapInnerGroup.selectAll("path.map-country")
    .data(worldFeatures)
    .join("path")
    .attr("class", feature => {
      const alpha2 = numericToAlpha2.get(feature.id);
      const hasSongs = alpha2 && countryCounts.get(alpha2) > 0;
      return "map-country" + (hasSongs ? " has-songs" : "");
    })
    .attr("data-code", feature => numericToAlpha2.get(feature.id) || "")
    .attr("d", mapPathGenerator)
    .append("title")
    .text(feature => {
      const alpha2 = numericToAlpha2.get(feature.id);
      const count = alpha2 ? countryCounts.get(alpha2) : 0;
      if (!alpha2 || !count) return "";
      return `${getCountryName(alpha2)} · ${count}곡`;
    });

  mapInnerGroup.selectAll("path.map-country.has-songs")
    .style("cursor", "pointer")
    .on("click", (event, feature) => {
      const alpha2 = numericToAlpha2.get(feature.id);
      if (alpha2) {
        zoomToCountryThenSelect(alpha2);
      }
    });

  // 작은 국가를 위한 점 마커 (데이터에 곡이 있는 것만)
  mapDotGroup = mapInnerGroup.append("g").attr("class", "map-dot-markers");

  const dotCodes = SMALL_COUNTRY_CODES.filter(
    code => countryCounts.get(code) > 0 && COUNTRY_CENTROIDS[code]
  );

  mapDotGroup.selectAll("circle.map-dot")
    .data(dotCodes)
    .join("circle")
    .attr("class", "map-dot")
    .attr("data-code", code => code)
    .attr("cx", code => mapProjection(COUNTRY_CENTROIDS[code])[0])
    .attr("cy", code => mapProjection(COUNTRY_CENTROIDS[code])[1])
    .attr("r", 4)
    .style("cursor", "pointer")
    .on("click", (event, code) => {
      zoomToCountryThenSelect(code);
    })
    .append("title")
    .text(code => `${getCountryName(code)} · ${countryCounts.get(code)}곡`);

  // 확대/축소
  mapZoomBehavior = d3.zoom()
    .scaleExtent([1, 14])
    .translateExtent([[0, 0], [MAP_WIDTH, MAP_HEIGHT]])
    .on("zoom", event => {
      mapInnerGroup.attr("transform", event.transform);

      // 점 마커와 테두리는 확대해도 화면상 크기가 일정하게 유지되도록 보정
      mapDotGroup.selectAll("circle.map-dot")
        .attr("r", 4 / event.transform.k);

      mapInnerGroup.selectAll("path.map-country")
        .attr("stroke-width", 0.5 / event.transform.k);
    });

  mapSvg.call(mapZoomBehavior);

  const resetZoomButton = document.getElementById("map-reset-zoom");
  resetZoomButton?.addEventListener("click", () => {
    mapSvg.transition()
      .duration(600)
      .call(mapZoomBehavior.transform, d3.zoomIdentity);
  });

  // "미분류"(국가 정보가 없는 곡)는 지도 위에 표시할 위치가 없으므로,
  // 지도 하단 빈 공간에 별도 버튼으로 노출
  const unclassifiedButton = document.getElementById("map-unclassified-button");
  const unclassifiedCount = countryCounts.get("XX") || 0;

  if (unclassifiedButton) {
    if (unclassifiedCount > 0) {
      unclassifiedButton.textContent = `미분류 · ${unclassifiedCount}곡`;
      unclassifiedButton.classList.remove("hidden");
      unclassifiedButton.addEventListener("click", () => {
        selectCountry("XX");
      });
    } else {
      unclassifiedButton.classList.add("hidden");
    }
  }

  setupMapSearch(countryCounts);
}

// 특정 국가로 지도를 확대한 뒤(줌 애니메이션 종료 시) 곡 목록으로 전환
// (참고: https://observablehq.com/@d3/zoom-to-bounding-box)
function zoomToCountryThenSelect(alpha2) {

  if (!mapSvg || !mapZoomBehavior || !mapProjection) {
    // 지도가 아직 준비되지 않았다면 바로 곡 목록으로
    selectCountry(alpha2);
    return;
  }

  const numericId = ALPHA2_TO_NUMERIC[alpha2];
  const features = numericId
    ? worldFeaturesByNumericId.get(numericId)
    : null;

  let bounds = null;

  if (features && features.length) {
    bounds = features.reduce((acc, feature) => {
      const featureBounds = mapPathGenerator.bounds(feature);

      if (!acc) return featureBounds;

      return [
        [
          Math.min(acc[0][0], featureBounds[0][0]),
          Math.min(acc[0][1], featureBounds[0][1])
        ],
        [
          Math.max(acc[1][0], featureBounds[1][0]),
          Math.max(acc[1][1], featureBounds[1][1])
        ]
      ];
    }, null);
  }

  // 폴리곤이 화면상 너무 작은(또는 없는) 국가는 중심 좌표 기준으로
  // 최소 크기의 박스를 만들어서 항상 적당히 확대되도록 함
  const centroid = COUNTRY_CENTROIDS[alpha2];
  const MIN_SPAN = 70;

  if (centroid) {
    const projected = mapProjection(centroid);

    const tooSmall =
      !bounds ||
      (bounds[1][0] - bounds[0][0] < MIN_SPAN &&
        bounds[1][1] - bounds[0][1] < MIN_SPAN);

    if (tooSmall && projected) {
      const [cx, cy] = projected;
      bounds = [
        [cx - MIN_SPAN / 2, cy - MIN_SPAN / 2],
        [cx + MIN_SPAN / 2, cy + MIN_SPAN / 2]
      ];
    }
  }

  if (!bounds) {
    selectCountry(alpha2);
    return;
  }

  const [[x0, y0], [x1, y1]] = bounds;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;

  const scale = Math.max(
    1,
    Math.min(14, 0.85 / Math.max(dx / MAP_WIDTH, dy / MAP_HEIGHT))
  );

  const translate = [
    MAP_WIDTH / 2 - scale * cx,
    MAP_HEIGHT / 2 - scale * cy
  ];

  const targetTransform = d3.zoomIdentity
    .translate(translate[0], translate[1])
    .scale(scale);

  mapSvg.transition()
    .duration(700)
    .call(mapZoomBehavior.transform, targetTransform)
    .on("end", () => {
      selectCountry(alpha2);
    });
}

// -------------------------------------
// 지도 위 국가 이름 검색
// (작은 국가를 지도에서 직접 클릭하기 어려운 경우를 보완)
// -------------------------------------

function setupMapSearch(countryCounts) {

  const input = document.getElementById("map-country-search");
  const resultsContainer = document.getElementById("map-search-results");

  if (!input || !resultsContainer) return;

  const searchableCountries = Object.keys(ALPHA2_TO_NUMERIC)
    .filter(code => countryCounts.get(code) > 0)
    .map(code => ({ code, name: getCountryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "ko"));

  if (countryCounts.get("XX") > 0) {
    searchableCountries.push({ code: "XX", name: "미분류" });
  }

  function closeResults() {
    resultsContainer.innerHTML = "";
    resultsContainer.classList.remove("visible");
  }

  input.addEventListener("input", () => {

    const keyword = normalizeSearchText(input.value.trim());

    if (!keyword) {
      closeResults();
      return;
    }

    const matches = searchableCountries
      .filter(country =>
        normalizeSearchText(country.name).includes(keyword)
      )
      .slice(0, 8);

    if (matches.length === 0) {
      closeResults();
      return;
    }

    resultsContainer.innerHTML = "";
    resultsContainer.classList.add("visible");

    matches.forEach(match => {

      const item = document.createElement("button");
      item.type = "button";
      item.className = "map-search-result";

      item.innerHTML = `
        ${countryFlagHTML(match.code)}
        <span class="map-search-result-name">${match.name}</span>
        <span class="map-search-result-count">
          ${countryCounts.get(match.code)}곡
        </span>
      `;

      item.addEventListener("click", () => {
        input.value = "";
        closeResults();

        // "미분류"는 지도상 좌표가 없으므로 줌 애니메이션 없이 바로 곡 목록으로
        if (match.code === "XX") {
          selectCountry("XX");
        } else {
          zoomToCountryThenSelect(match.code);
        }
      });

      resultsContainer.appendChild(item);
    });
  });

  document.addEventListener("click", event => {
    if (event.target !== input && !resultsContainer.contains(event.target)) {
      closeResults();
    }
  });

  input.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      closeResults();
      input.blur();
    }
  });
}
