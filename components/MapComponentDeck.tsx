"use client";

import { useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import * as h3 from 'h3-js';
import {ScatterplotLayer} from "@deck.gl/layers";
import {Deck} from "@deck.gl/core";
import {H3HexagonLayer} from "@deck.gl/geo-layers";

interface Window {
    naver: any;
}

export default function MapComponentDeck() {
    const mapRef = useRef<HTMLDivElement>(null);
    const deckRef = useRef<Deck | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const workerRef = useRef<Worker | null>(null);
    const currentIdsRef = useRef<string[]>([]);
    const mapInstance = useRef<any>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [currentZoom, setCurrentZoom] = useState(17);
    const [currentRes, setCurrentRes] = useState(6);
    const currentH3Ref = useRef<{h3: string, value: number}[]>([]);

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

    const getColor = (value: number) => {
        if (value < 50) {
            // 0~50: 파란색(0,0,255)에서 노란색(255,255,0)으로
            const ratio = value / 50;
            return [255 * ratio, 255 * ratio, 255 * (1 - ratio)];
        } else {
            // 50~100: 노란색(255,255,0)에서 빨간색(255,0,0)으로
            const ratio = (value - 50) / 50;
            return [255, 255 * (1 - ratio), 0];
        }
    };

    // 레이어 렌더링 함수 분리 (재사용을 위해)
    const renderDeckLayers = (data: {h3: string, value: number}[]) => {
        if (!deckRef.current) return;

        deckRef.current.setProps({
            layers: [
                new H3HexagonLayer({
                    id: 'h3-layer',
                    data: data,
                    getHexagon: (d) => d.h3,
                    filled: true,
                    // value(0~100)에 따라 투명도 조절
                    getFillColor: (d: any) => [...getColor(d.value), 100],
                    extruded: false,
                    updateTriggers: {
                        getFillColor: [data] // data가 바뀌면 색상 다시 계산
                    }
                })
            ]
        });
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

            const { nextIds } = e.data; // ['8830...', '8831...'] 형태라고 가정

            // 1. 새로운 데이터를 데이터 객체 형태로 변환 (기본 value 0)
            const newData = nextIds.map((id: string) => ({
                h3: id,
                value: Math.random() * 100 // 초기값도 랜덤하게 주고 싶다면
            }));

            currentH3Ref.current = newData;
            renderDeckLayers(newData);
        };

        deckRef.current = new Deck({
            canvas: canvasRef.current,
            width: '100%',
            height: '100%',
            initialViewState: {
                longitude: mapInstance.current.getCenter().lng(),
                latitude: mapInstance.current.getCenter().lat(),
                zoom: mapInstance.current.getZoom() - 1,
                pitch: 0,
                bearing: 0
            },
            controller: false, // 네이버 지도가 컨트롤을 담당하도록 설정
            layers: [
                new ScatterplotLayer({
                    id: 'test-layer',
                    // 현재 지도 중심에 점 하나 찍기
                    data: [{ position: [mapInstance.current.getCenter().lng(), mapInstance.current.getCenter().lat()] }],
                    getPosition: (d) => d.position,
                    getFillColor: [255, 0, 0], // 빨간색
                    getRadius: 1000,           // 반경 1km (크게 설정)
                    opacity: 0.8,
                })
            ]
        });;

        window.naver.maps.Event.addListener(mapInstance.current, 'tilesloaded', () => {
            setIsLoading(false);
        });

        window.naver.maps.Event.addListener(mapInstance.current, 'bounds_changed', () => {
            if(!deckRef.current) return;
            console.log('pass');
            const center = mapInstance.current.getCenter();
            const zoom = mapInstance.current.getZoom();

            deckRef.current.setProps({
                viewState: {
                    longitude: center.lng(),
                    latitude: center.lat(),
                    zoom: zoom - 1,
                    pitch: 0,
                    bearing: 0
                }
            });
        });

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
            const res = zoom > 12 ? 10 : zoom > 10 ? 9 : zoom > 8 ? 8 : zoom > 10 ? 7 : 6;
            //const res = 13;

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
        if (currentH3Ref.current.length === 0) return;

        // 기존 H3 리스트는 그대로 두고 value만 새로 생성
        const updatedData = currentH3Ref.current.map(item => ({
            ...item,
            value: Math.random() * 100
        }));

        currentH3Ref.current = updatedData;
        renderDeckLayers(updatedData); // Deck 업데이트 호출
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
            <canvas
                ref={canvasRef}
                style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: '100%',
                    zIndex: 10,           // 반드시 지도보다 높아야 함
                    pointerEvents: 'none', // 마우스 클릭이 지도로 통과되게 함
                    backgroundColor: 'transparent' // 배경 투명 확인
                }}
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
