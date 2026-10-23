export type PresetLocation = {
  name: string;
  coords: [number, number];
};

export const MANGALURU_PRESETS: PresetLocation[] = [
  { name: "Hampankatta Junction", coords: [74.8426, 12.8698] },
  { name: "KSRTC / Bejai Circle", coords: [74.8530, 12.8856] },
  { name: "Ambedkar (Jyothi) Circle", coords: [74.8465, 12.8715] },
  { name: "Ladyhill Circle", coords: [74.8385, 12.8890] },
  { name: "Pumpwell (Mahaveera) Circle", coords: [74.8685, 12.8550] },
  { name: "Lalbagh Junction (MG Road)", coords: [74.8460, 12.8770] },
  { name: "Bunts Hostel Circle", coords: [74.8490, 12.8720] },
  { name: "Nanthoor Junction", coords: [74.8650, 12.8740] },
  { name: "Kottara Chowki", coords: [74.8380, 12.9080] },
  { name: "Mangaluru Central Railway", coords: [74.8390, 12.8640] },
  { name: "Kadri Manjunatha Temple", coords: [74.8580, 12.8820] },
  { name: "Mangalore International Airport", coords: [74.8900, 12.9610] },
];

export function findNearestPreset(coords: [number, number], maxDistanceKm = 1.0): PresetLocation | null {
  let closest: PresetLocation | null = null;
  let minDistance = Number.POSITIVE_INFINITY;
  for (const preset of MANGALURU_PRESETS) {
    const dLng = preset.coords[0] - coords[0];
    const dLat = preset.coords[1] - coords[1];
    const dist = Math.hypot(dLng * 111.32 * Math.cos((coords[1] * Math.PI) / 180), dLat * 110.574);
    if (dist < minDistance) {
      minDistance = dist;
      closest = preset;
    }
  }
  return minDistance <= maxDistanceKm ? closest : null;
}
