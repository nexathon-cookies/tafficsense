// Mangaluru preset points used by the web route planner. Coordinates are [lng, lat],
// matching the /api/route contract. Presets are approximate reference points, not GPS.
export type PlacePreset = { name: string; coords: [number, number] };

export const mangaluruPlaces: readonly PlacePreset[] = [
  { name: "Hampankatta Junction", coords: [74.8426, 12.8698] },
  { name: "KSRTC / Bejai Circle", coords: [74.853, 12.8856] },
  { name: "Ambedkar (Jyothi) Circle", coords: [74.8465, 12.8715] },
  { name: "Ladyhill Circle", coords: [74.8385, 12.889] },
  { name: "Pumpwell (Mahaveera) Circle", coords: [74.8685, 12.855] },
  { name: "Mangaluru Central Railway", coords: [74.839, 12.864] },
  { name: "Kadri Manjunatha Temple", coords: [74.858, 12.882] },
  { name: "Mangalore International Airport", coords: [74.89, 12.961] },
];
