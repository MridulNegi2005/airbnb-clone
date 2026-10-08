"use client";

import { useEffect, useRef, useState } from "react";
import { AdvancedMarker, Map, useMap, useMapsLibrary } from "@vis.gl/react-google-maps";
import { MapPin } from "lucide-react";
import { MapProvider, MapRestriction, mapId, useServiceArea } from "./google-maps";
import type { HostAddressPickerProps, HostAddressValue } from "./types";
import styles from "./maps.module.css";

export function AddressPicker(props: HostAddressPickerProps) {
  const configured = Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY && mapId);
  return <div className={styles.address}>{configured ? <MapProvider><Autocomplete {...props} /></MapProvider> : <p className={styles.note}>Address search is unavailable right now. Enter and confirm your address below.</p>}{!props.searchOnly && <AddressFields {...props} />}</div>;
}
function AddressFields({ value, onChange, disabled }: HostAddressPickerProps) {
  return <div className={styles.fields}>{([{ key: "address", label: "Street address", wide: true }, { key: "neighbourhood", label: "Neighbourhood" }, { key: "city", label: "City" }, { key: "country", label: "Country" }] as const).map((field) => <label key={field.key} className={"wide" in field ? styles.wide : undefined}>{field.label}<input autoComplete={field.key === "address" ? "street-address" : field.key === "country" ? "country-name" : "off"} value={value[field.key]} disabled={disabled} maxLength={field.key === "address" ? 200 : 100} onChange={(event) => onChange({ ...value, [field.key]: event.target.value })} /></label>)}{(["latitude", "longitude"] as const).map((field) => <label key={field}>{field === "latitude" ? "Latitude" : "Longitude"}<input type="number" step="any" min={field === "latitude" ? -90 : -180} max={field === "latitude" ? 90 : 180} value={value[field] ?? ""} disabled={disabled} onChange={(event) => onChange({ ...value, [field]: event.target.value ? Number(event.target.value) : null })} /></label>)}</div>;
}
function Autocomplete({ value, onChange, disabled, searchOnly, placeholder }: HostAddressPickerProps) {
  const places = useMapsLibrary("places");
  const area = useServiceArea();
  const [input, setInput] = useState(value.address);
  const [predictions, setPredictions] = useState<google.maps.places.PlacePrediction[]>([]);
  const [highlight, setHighlight] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const token = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const sequence = useRef(0);
  const selectedText = useRef(value.address);
  useEffect(() => {
    const requestId = ++sequence.current;
    if (!places || !area.data || input.trim().length < 3 || input === selectedText.current) return;
    const timer = setTimeout(() => {
      token.current ??= new places.AutocompleteSessionToken();
      void places.AutocompleteSuggestion.fetchAutocompleteSuggestions({ input, sessionToken: token.current, locationRestriction: area.data!, includedRegionCodes: ["in"] }).then(({ suggestions }) => {
        if (requestId === sequence.current) { setPredictions(suggestions.flatMap((suggestion) => suggestion.placePrediction ? [suggestion.placePrediction] : [])); setError(""); }
      }).catch(() => { if (requestId === sequence.current) setError("Address suggestions could not be loaded. Enter your address below."); });
    }, 250);
    return () => clearTimeout(timer);
  }, [places, area.data, input]);
  async function select(prediction: google.maps.places.PlacePrediction) {
    setBusy(true); setError("");
    try {
      const place = prediction.toPlace();
      await place.fetchFields({ fields: ["location", "addressComponents", "formattedAddress", "id"] });
      if (!place.location) throw new Error("Missing coordinates");
      const component = (...types: string[]) => { for (const type of types) { const result = place.addressComponents?.find((part) => part.types.includes(type))?.longText; if (result) return result; } return ""; };
      const city = component("locality", "administrative_area_level_3");
      const fullAddress = place.formattedAddress ?? prediction.text.toString();
      const address = fullAddress.split(",").filter((part) => part.trim().toLowerCase() !== city.toLowerCase()).join(",").trim();
      const next: HostAddressValue = { address, neighbourhood: component("sublocality_level_1", "neighborhood", "locality"), city, country: "India", latitude: place.location.lat(), longitude: place.location.lng(), google_place_id: place.id };
      onChange(next); selectedText.current = fullAddress; setInput(fullAddress); setPredictions([]); token.current = null; ++sequence.current;
    } catch { setError("That address could not be loaded. Try another address or confirm the details below."); }
    finally { setBusy(false); }
  }
  const hasLocation = value.latitude !== null && value.longitude !== null && Number.isFinite(value.latitude) && Number.isFinite(value.longitude);
  return <><div className={styles.searchWrap}><label className={styles.addressSearch}>Enter your address<input role="combobox" aria-expanded={predictions.length > 0} aria-controls="address-predictions" aria-autocomplete="list" aria-activedescendant={predictions.length ? `address-prediction-${highlight}` : undefined} disabled={disabled || busy || !places || !area.data} placeholder={placeholder ?? (area.isError ? "Enter your address in the fields below" : "Search for an address")} value={input} onChange={(event) => { setInput(event.target.value); setHighlight(0); if (event.target.value.length < 3) setPredictions([]); }} onKeyDown={(event) => { if (event.key === "Escape") setPredictions([]); if (event.key === "ArrowDown") { event.preventDefault(); setHighlight((current) => Math.min(current + 1, predictions.length - 1)); } if (event.key === "ArrowUp") { event.preventDefault(); setHighlight((current) => Math.max(0, current - 1)); } if (event.key === "Enter" && predictions[highlight]) { event.preventDefault(); void select(predictions[highlight]); } }} /></label>{predictions.length > 0 && <div id="address-predictions" role="listbox" className={styles.predictions}>{predictions.map((prediction, index) => <button type="button" id={`address-prediction-${index}`} role="option" aria-selected={highlight === index} className={highlight === index ? styles.highlighted : undefined} key={prediction.placeId} onClick={() => void select(prediction)}>{prediction.text.toString()}</button>)}</div>}</div>{busy && <p className={styles.note} role="status">Finding your address...</p>}{error && <p className={styles.error} role="alert">{error}</p>}{area.data && !searchOnly && <><p className={styles.note}>{hasLocation ? "Confirm your address below. Drag the pin to fine-tune the location." : "Choose an address to place your pin."}</p><div className={styles.addressMap}><Map mapId={mapId} defaultCenter={{ lat: 12.9716, lng: 77.5946 }} defaultZoom={hasLocation ? 16 : 11} gestureHandling="greedy" disableDefaultUI clickableIcons={false}><MapRestriction bounds={area.data} />{hasLocation && <><FollowAddress latitude={value.latitude!} longitude={value.longitude!} /><AdvancedMarker position={{ lat: value.latitude!, lng: value.longitude! }} draggable={!disabled} onDragEnd={(event) => { if (event.latLng) onChange({ ...value, latitude: event.latLng.lat(), longitude: event.latLng.lng() }); }}><span className={styles.exactPin} aria-label="Drag to adjust address location"><MapPin size={20} /></span></AdvancedMarker></>}</Map></div></>}</>;
}
function FollowAddress({ latitude, longitude }: { latitude: number; longitude: number }) {
  const map = useMap();
  useEffect(() => { if (map) { map.panTo({ lat: latitude, lng: longitude }); map.setZoom(16); } }, [map, latitude, longitude]);
  return null;
}


