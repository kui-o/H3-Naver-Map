import * as h3 from 'h3-js';

const KOREA_BOUNDS = [
    [126.0, 33.0], [124.5, 38.0], [130.0, 38.5],
    [131.0, 34.5], [128.5, 33.5], [126.0, 33.0]
];

addEventListener('message', (e) => {
    console.log('워커가 메시지를 받았습니다:', e.data);
    const { viewportPolygon, res, currentIds } = e.data;

    // 1. 새로운 영역의 H3 인덱스 추출
    const newIndices = h3.polygonToCells(viewportPolygon, res);
    const newIdsSet = new Set(newIndices);
    const currentIdsSet = new Set(currentIds);

    // 2. 차분 계산 (Diffing)
    const toAdd = newIndices.filter(id => !currentIdsSet.has(id));
    const toRemove = currentIds.filter(id => !newIdsSet.has(id));

    // 3. 추가할 피처들만 GeoJSON 형태로 생성
    const addFeatures = toAdd.map(id => ({
        type: 'Feature',
        id: id,
        geometry: {
            type: 'Polygon',
            coordinates: [h3.cellToBoundary(id, true)]
        },
        properties: { value: Math.random() * 100 }
    }));

    postMessage({
        toAdd: addFeatures,
        toRemove: toRemove,
        nextIds: Array.from(newIdsSet)
    });
});
