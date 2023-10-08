import { Spinner } from "@chakra-ui/react";
import { GoogleMap, Rectangle, useJsApiLoader } from "@react-google-maps/api";
import { useEffect, useRef, useState } from "react";
import { toPoint as mgrsToWgs } from 'mgrs';
import './App.css';

// interface GMapProps {
//   address?: string;
//   latitude?: number;
//   longitude?: number;
//   zoom: number;
// }

export default function GoogleMapsView({ mgrs } : { mgrs: string }) {
  const mapRef = useRef<GoogleMap | null>(null);

  const { isLoaded } = useJsApiLoader({
    id: 'google-maps-script',
    googleMapsApiKey: import.meta.env.VITE_GMAPS_API_KEY
  });

  const containerStyle = {
    width: '50vw',
    height: '80vh'
  };

  const center = {
    // SF City Hall
    lat: 37.779840,
    lng: -122.419410
  } 

  function wgsPointToBBox(point: [number, number]): [number, number, number, number] {
    // Since we're only supporting 100km squares, we can just do a simple
    // calculation here.

    // latitude_change = x km / 111.132 km/degree
    // longitude_change = x km / (111.132 km/degree * cos(latitude))
    // We need to go west 50km, east 50km, north 50km, and south 50km.

    const latitude_change = 50 / 111.132;
    const longitude_change = 50 / (111.132 * Math.cos(point[0]));

    return [
      point[1] - longitude_change,
      point[0] - latitude_change,
      point[1] + longitude_change,
      point[0] + latitude_change,
    ];
  }

  const [rectangle, setRectangle] = useState<google.maps.RectangleOptions | null>(null);

  useEffect(() => {
    if(!mapRef.current) return;
    if(!mgrs || mgrs.length !== 5) {
      setRectangle(null);
      return;
    };

    try {
      const centerPoint = mgrsToWgs(mgrs);
      const bbox = wgsPointToBBox(centerPoint);
      
      const newRectangle: google.maps.RectangleOptions = {
        strokeColor: "#FF0000",
        strokeOpacity: 0.8,
        strokeWeight: 2,
        fillColor: "#FF0000",
        fillOpacity: 0,
        bounds: {
          west: bbox[2],
          south: bbox[1],
          east: bbox[0],
          north: bbox[3],
        },
      };
      console.log(bbox);
      console.log(newRectangle);

      setRectangle(newRectangle);

      // const latLng = new google.maps.LatLng(centerPoint[1], centerPoint[0]);
      // mapRef.current.panTo(latLng);
    } catch (e) {
      console.error(e);
    }
  }, [mgrs]);

  if (!isLoaded) {
    return (
      <Spinner />
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      center={center}
      zoom={10}
      // onLoad={onLoad}
      // onUnmount={onUnmount}
      ref={mapRef}
    >
      {
        rectangle && (
          <Rectangle options={rectangle} />
        )
      }
    </GoogleMap>
  )
}
