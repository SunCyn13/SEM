import { useState } from "react";
import { Button } from "react-bootstrap";
import { GoogleMap, Marker, useJsApiLoader } from "@react-google-maps/api";

const DEFAULT_CENTER = { lat: 13.7563, lng: 100.5018 }; //ตั้งเริ่มที่กทม
const MAP_STYLE = { width: "100%", height: 320, borderRadius: 8 };

export default function MapPinPicker({ initial, onSubmit, busy }) {
  const { isLoaded, loadError } = useJsApiLoader({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || "",
  });
  const [pin, setPin] = useState(initial || null); //lat, lng 

  const setFromEvent = (e) => setPin({ lat: e.latLng.lat(), lng: e.latLng.lng() });

  if (loadError) return <p className="text-danger">โหลดแผนที่ไม่สำเร็จ (เช็ค VITE_GOOGLE_MAPS_API_KEY)</p>;
  if (!isLoaded) return <p className="text-secondary">กำลังโหลดแผนที่</p>;

  return (
    <div>
      <p className="small text-secondary">คลิกบนแผนที่เพื่อปักหมุด</p>
      <GoogleMap
        mapContainerStyle={MAP_STYLE}
        center={pin || DEFAULT_CENTER}
        zoom={pin ? 16 : 11}
        onClick={setFromEvent}
      >
        {pin && <Marker position={pin} draggable onDragEnd={setFromEvent} />}
      </GoogleMap>

      <div className="d-flex justify-content-between align-items-center mt-3">
        <span className="small text-secondary">
          {pin ? `${pin.lat.toFixed(6)}, ${pin.lng.toFixed(6)}` : "ยังไม่ได้ปักหมุด"}
        </span>
        <Button
          disabled={busy || !pin}
          onClick={() =>
            onSubmit({
              latitude: Number(pin.lat.toFixed(7)),  
              longitude: Number(pin.lng.toFixed(7)),
            })
          }
        >
          {busy ? "กำลังบันทึก" : "บันทึกตำแหน่งที่ปักหมุด"}
        </Button>
      </div>
    </div>
  );
}