export type SchematicCoordinate = [number, number];

export function projectSchematicPoint(point: SchematicCoordinate, points: SchematicCoordinate[]): { left: string; top: string } {
  const all = points.length > 0 ? points : [point];
  const lngs = all.map(([lng]) => lng);
  const lats = all.map(([, lat]) => lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const longitudeSpan = Math.max(east - west, 0.001);
  const latitudeSpan = Math.max(north - south, 0.001);
  const left = 8 + ((point[0] - west) / longitudeSpan) * 84;
  const top = 8 + (1 - (point[1] - south) / latitudeSpan) * 84;
  return { left: `${Number(left.toFixed(2))}%`, top: `${Number(top.toFixed(2))}%` };
}

// ---- Line drawing for the schematic view (no extra native dependency) ----
// The fallback view draws routes and corridor segments as rotated bars in pixel space.
// Points are fitted to the same padded frame for every element so they line up.

export type SchematicSize = { width: number; height: number };
export type SchematicBounds = { west: number; east: number; south: number; north: number };
export type SchematicLine = { centreX: number; centreY: number; length: number; angle: number };

const FRAME_PADDING = 16;

export function schematicBounds(points: SchematicCoordinate[]): SchematicBounds {
  const all = points.length > 0 ? points : [[74.84, 12.87] as SchematicCoordinate];
  let west = all[0][0];
  let east = all[0][0];
  let south = all[0][1];
  let north = all[0][1];
  for (const [lng, lat] of all) {
    west = Math.min(west, lng);
    east = Math.max(east, lng);
    south = Math.min(south, lat);
    north = Math.max(north, lat);
  }
  return { west, east, south, north };
}

// Converts a GeoJSON [lng, lat] point to pixel coordinates inside a frame of the given size.
export function toFramePixel(
  point: SchematicCoordinate,
  bounds: SchematicBounds,
  size: SchematicSize,
): { x: number; y: number } {
  const usableWidth = Math.max(size.width - FRAME_PADDING * 2, 1);
  const usableHeight = Math.max(size.height - FRAME_PADDING * 2, 1);
  const lngSpan = Math.max(bounds.east - bounds.west, 0.0005);
  const latSpan = Math.max(bounds.north - bounds.south, 0.0005);
  return {
    x: FRAME_PADDING + ((point[0] - bounds.west) / lngSpan) * usableWidth,
    y: FRAME_PADDING + (1 - (point[1] - bounds.south) / latSpan) * usableHeight,
  };
}

// Turns a polyline into straight bars that can each be drawn as a rotated View.
export function polylineBars(
  coordinates: SchematicCoordinate[],
  bounds: SchematicBounds,
  size: SchematicSize,
): SchematicLine[] {
  const pixels = coordinates.map((point) => toFramePixel(point, bounds, size));
  const bars: SchematicLine[] = [];
  for (let index = 1; index < pixels.length; index += 1) {
    const from = pixels[index - 1];
    const to = pixels[index];
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (length < 0.5) continue;
    bars.push({
      centreX: (from.x + to.x) / 2,
      centreY: (from.y + to.y) / 2,
      length,
      angle: (Math.atan2(dy, dx) * 180) / Math.PI,
    });
  }
  return bars;
}