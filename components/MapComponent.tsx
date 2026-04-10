"use client";

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import * as h3 from 'h3-js';

interface Window {
    naver: any;
}

export default function MapComponent() {
    const mapRef = useRef<HTMLDivElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const currentIdsRef = useRef<string[]>([]);
    const mapInstance = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentZoom, setCurrentZoom] = useState(17);
    const [currentRes, setCurrentRes] = useState(6);

    const getH3GeoJson = (h3Indices: string[]) => {
        const features = h3Indices.map((id) => ({
            type: 'Feature',
            id: id, // getFeatureById로 접근하기 위해 ID 지정
            geometry: {
                type: 'Polygon',
                coordinates: [h3.cellToBoundary(id, true)], // [lng, lat] 형식
            },
            properties: { h3Index: id, value: Math.random() * 100 }, // 초기값
        }));

        return { type: 'FeatureCollection', features };
    };

    const initMap = () => {
        if (!mapRef.current || !window.naver) return;
        mapInstance.current = new window.naver.maps.Map(mapRef.current, {
            center: new window.naver.maps.LatLng(37.3595704, 127.105399),
            zoom: 17,
            zoomControl: true,
            zoomControlOptions: {
                position: window.naver.maps.Position.RIGHT_CENTER
            },
            mapTypeControl: true
        });
        //workerRef.current = new Worker('../app/h3-worker.js');
        workerRef.current = new Worker(new URL('../app/h3-worker.ts', import.meta.url));

        workerRef.current.onmessage = (e) => {
            console.log('worker done')
            const { toAdd, toRemove, nextIds } = e.data;

            // 삭제: 나간 놈들만 제거
            toRemove.forEach((id: string) => {
                const feature = mapInstance.current.data.getFeatureById(id);
                if (feature) mapInstance.current.data.removeFeature(feature);
            });

            // 추가: 새로 들어온 놈들만 추가
            if (toAdd.length > 0) {
                mapInstance.current.data.addGeoJson({ type: 'FeatureCollection', features: toAdd });
            }

            currentIdsRef.current = nextIds;
        };

        window.naver.maps.Event.addListener(mapInstance.current, 'tilesloaded', () => {
            setIsLoading(false);
        });

        const getColor = (value: number) => {
            if (value > 80) return '#084594'; // 매우 높음
            if (value > 60) return '#2171b5'; // 높음
            if (value > 40) return '#6baed6'; // 보통
            if (value > 20) return '#bdd7e7'; // 낮음
            return '#eff3ff';                // 매우 낮음
        };

        /*mapInstance.current.data.addListener('click', (e) => {
            const id = e.feature.getId();
            const val = e.feature.getProperty('value');
            alert(`클릭한 지역 H3: ${id}\n현재 값: ${val.toFixed(2)}`);

            // 클릭한 곳 강조
            //mapInstance.current.data.overrideStyle(e.feature, { strokeColor: '#ff0000', strokeWeight: 3 });
        });*/

        mapInstance.current.data.setStyle((feature: any) => {
            const value = feature.getProperty('value');
            return {
                fillColor: getColor(value),
                fillOpacity: 0.5,
                strokeWeight: 1,
                strokeColor: '#ffffff',
            };
        });

        const handleIdle = () => {
            const bounds = mapInstance.current.getBounds();
            const sw = bounds.getSW();
            const ne = bounds.getNE();
            const zoom = mapInstance.current.getZoom();

            // 줌에 따른 해상도 결정
            //const res = zoom > 12 ? 8 : zoom > 9 ? 6 : 4;
            //const res = 10;
            //const res = zoom > 12 ? 10 : zoom > 9 ? 6 : 5;
            const res = zoom > 15 ? 10 : zoom > 13 ? 9 : zoom > 12 ? 8 : zoom > 10 ? 7 : 6;

            // UI 상태 업데이트
            setCurrentZoom(zoom);
            setCurrentRes(res);

            workerRef.current?.postMessage({
                viewportPolygon: [[sw.lat(), sw.lng()], [ne.lat(), sw.lng()], [ne.lat(), ne.lng()], [sw.lat(), ne.lng()], [sw.lat(), sw.lng()]],
                res,
                currentIds: currentIdsRef.current
            });
        };

        const idleListener = window.naver.maps.Event.addListener(mapInstance.current, 'idle', handleIdle);
        return () => {
            window.naver.maps.Event.removeListener(idleListener);
            workerRef.current?.terminate();
        };

        //const centerH3 = h3.latLngToCell(37.3595704, 127.105399, 10);
        //const kRingIndices = h3.gridDisk(centerH3, 25);

        //const geojson = getH3GeoJson(kRingIndices);
        //mapInstance.current.data.addGeoJson(geojson);
    };

    const updateAllRandomly = () => {
        const map = mapRef.current;
        if (!map) return;

        mapInstance.current.data.forEach((feature) => {
            feature.setProperty('value', Math.random() * 100);
        });
    };

    return (
        <div style={{ position: 'relative', width: '100%', height: '100vh' }}>
            <Script
                strategy="afterInteractive"
                src={`https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID}`}
                onReady={initMap} // 스크립트 로드 완료 후 실행
            />

            {/* 컨트롤 레이어: z-index를 높게 설정하여 지도 위에 띄움 */}
            <div style={{
                position: 'absolute',
                top: '20px',
                left: '20px',
                zIndex: 1000, // 지도(보통 0~100)보다 확실히 높게 설정
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
                pointerEvents: 'none' // 컨테이너 자체는 클릭 통과, 자식 요소는 아래에서 auto로 복구
            }}>
                {/* 버튼 UI */}
                <button
                    onClick={updateAllRandomly}
                    style={{
                        padding: '12px 20px',
                        backgroundColor: '#03C75A',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        fontWeight: 'bold',
                        cursor: 'pointer',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        pointerEvents: 'auto', // 클릭 가능하게 설정
                        transition: 'transform 0.1s'
                    }}
                    onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.95)'}
                    onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
                >
                    값 변경 테스트
                </button>

                {/* 정보 표시 UI */}
                <div style={{
                    padding: '10px 15px',
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    borderRadius: '8px',
                    fontSize: '14px',
                    color: '#333',
                    border: '1px solid rgba(0,0,0,0.1)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '5px',
                    pointerEvents: 'auto'
                }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                        <span style={{ fontWeight: '600' }}>Zoom Level</span>
                        <span style={{ color: '#03C75A', fontWeight: 'bold' }}>{currentZoom}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: '20px' }}>
                        <span style={{ fontWeight: '600' }}>H3 Resolution</span>
                        <span style={{ color: '#03C75A', fontWeight: 'bold' }}>{currentRes}</span>
                    </div>
                </div>
            </div>

            {/* 로딩 인디케이터 (z-index 최상위) */}
            {isLoading && (
                <div style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    backgroundColor: 'rgba(255, 255, 255, 0.7)', display: 'flex',
                    justifyContent: 'center', alignItems: 'center', zIndex: 2000
                }}>
                    <div className="spinner" />
                </div>
            )}

            {/* 지도 엘리먼트: 전체 화면을 꽉 채우도록 설정 */}
            <div
                ref={mapRef}
                style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, zIndex: 1 }}
            />

            <style jsx>{`
                .spinner {
                    width: 40px;
                    height: 40px;
                    border: 4px solid #f3f3f3;
                    border-top: 4px solid #03C75A;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
            `}</style>
        </div>
    );
}
