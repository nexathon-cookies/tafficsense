export type ReportLocation = {
  source: "device" | "reference";
  label: string;
  lat: number;
  lng: number;
  gpsAccuracyM: number | null;
  gpsFixAt: string | null;
};

export function toReportLocationInput(location: ReportLocation) {
  return {
    lat: location.lat,
    lng: location.lng,
    gpsAccuracyM: location.gpsAccuracyM,
    gpsFixAt: location.gpsFixAt,
  };
}

export function formatCoordinates(location: Pick<ReportLocation, "lat" | "lng">) {
  return `${location.lat.toFixed(4)}° N, ${location.lng.toFixed(4)}° E`;
}
