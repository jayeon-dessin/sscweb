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
        selectCountry(alpha2);
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
      selectCountry(code);
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
}
