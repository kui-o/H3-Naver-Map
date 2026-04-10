import MapComponent from "@/components/MapComponent";
import MapComponentDeck from "@/components/MapComponentDeck";

export default function Home() {
  return (
      <main className="w-full h-screen overflow-hidden">
        {/*<MapComponent />*/} {/*//네이버 Data Layer 사용*/}
        <MapComponentDeck /> {/*deck gl 사용*/}
      </main>
  );
}
