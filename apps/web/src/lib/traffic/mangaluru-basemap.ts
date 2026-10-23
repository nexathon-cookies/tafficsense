// Bundled schematic GeoJSON basemap for the Mangaluru central corridor
// Used as guaranteed offline-ready basemap fallback when external tiles are unavailable.
import type { StyleSpecification } from "maplibre-gl";

export type BasemapFeature = {
  type: "Feature";
  properties: { kind: string; name: string };
  geometry: {
    type: "Polygon" | "LineString" | "Point";
    coordinates: number[] | number[][] | number[][][];
  };
};

export type BasemapFeatureCollection = {
  type: "FeatureCollection";
  features: BasemapFeature[];
};

export const MANGALURU_BASEMAP_GEOJSON: BasemapFeatureCollection = {
  type: "FeatureCollection",
  features: [
    // Water bodies (Arabian Sea / Gurupura river schematic)
    {
      type: "Feature",
      properties: { kind: "water", name: "Arabian Sea / Estuary" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [74.825, 12.860],
            [74.836, 12.860],
            [74.837, 12.872],
            [74.834, 12.885],
            [74.832, 12.900],
            [74.825, 12.900],
            [74.825, 12.860]
          ]
        ]
      }
    },
    // Major arterial roads
    {
      type: "Feature",
      properties: { kind: "arterial", name: "KS Rao Road / Hampankatta" },
      geometry: {
        type: "LineString",
        coordinates: [[74.838, 12.868], [74.842, 12.871], [74.846, 12.874], [74.850, 12.877]]
      }
    },
    {
      type: "Feature",
      properties: { kind: "arterial", name: "MG Road (Lalbagh - Ladyhill)" },
      geometry: {
        type: "LineString",
        coordinates: [[74.846, 12.874], [74.843, 12.882], [74.841, 12.890], [74.839, 12.898]]
      }
    },
    {
      type: "Feature",
      properties: { kind: "arterial", name: "Bejai Main Road (KSRTC)" },
      geometry: {
        type: "LineString",
        coordinates: [[74.843, 12.882], [74.848, 12.886], [74.854, 12.888], [74.858, 12.885], [74.865, 12.882]]
      }
    },
    {
      type: "Feature",
      properties: { kind: "arterial", name: "Balmatta Road / Ambedkar Circle" },
      geometry: {
        type: "LineString",
        coordinates: [[74.850, 12.877], [74.856, 12.875], [74.862, 12.872], [74.868, 12.868]]
      }
    },
    {
      type: "Feature",
      properties: { kind: "arterial", name: "Bunts Hostel Road / Kadri" },
      geometry: {
        type: "LineString",
        coordinates: [[74.850, 12.877], [74.853, 12.881], [74.858, 12.885], [74.863, 12.888]]
      }
    },
    {
      type: "Feature",
      properties: { kind: "secondary", name: "Car Street Connector" },
      geometry: {
        type: "LineString",
        coordinates: [[74.840, 12.870], [74.842, 12.877], [74.846, 12.880]]
      }
    },
    {
      type: "Feature",
      properties: { kind: "secondary", name: "Kodialbail Cross" },
      geometry: {
        type: "LineString",
        coordinates: [[74.846, 12.874], [74.850, 12.880], [74.854, 12.884]]
      }
    },
    // Junction and Landmark labels
    {
      type: "Feature",
      properties: { kind: "landmark", name: "Hampankatta" },
      geometry: { type: "Point", coordinates: [74.842, 12.871] }
    },
    {
      type: "Feature",
      properties: { kind: "landmark", name: "Ambedkar Circle (Jyothi)" },
      geometry: { type: "Point", coordinates: [74.850, 12.877] }
    },
    {
      type: "Feature",
      properties: { kind: "landmark", name: "Lalbagh" },
      geometry: { type: "Point", coordinates: [74.843, 12.882] }
    },
    {
      type: "Feature",
      properties: { kind: "landmark", name: "Bejai Circle (KSRTC)" },
      geometry: { type: "Point", coordinates: [74.858, 12.885] }
    },
    {
      type: "Feature",
      properties: { kind: "landmark", name: "Ladyhill" },
      geometry: { type: "Point", coordinates: [74.841, 12.890] }
    }
  ]
};

// Minimal self-contained MapLibre style JSON specification using the schematic basemap
export function createFallbackStyle(): StyleSpecification {
  return {
    version: 8,
    name: "Mangaluru Schematic Basemap",
    sources: {
      "mangaluru-basemap": {
        type: "geojson",
        data: MANGALURU_BASEMAP_GEOJSON
      }
    },
    layers: [
      {
        id: "background",
        type: "background",
        paint: {
          "background-color": "#f1f4f9"
        }
      },
      {
        id: "water-fill",
        type: "fill",
        source: "mangaluru-basemap",
        filter: ["==", ["get", "kind"], "water"],
        paint: {
          "fill-color": "#cfe2fe",
          "fill-opacity": 0.8
        }
      },
      {
        id: "water-casing",
        type: "line",
        source: "mangaluru-basemap",
        filter: ["==", ["get", "kind"], "water"],
        paint: {
          "line-color": "#93c5fd",
          "line-width": 1.5
        }
      },
      {
        id: "secondary-roads",
        type: "line",
        source: "mangaluru-basemap",
        filter: ["==", ["get", "kind"], "secondary"],
        paint: {
          "line-color": "#cbd5e1",
          "line-width": 3
        }
      },
      {
        id: "arterial-casing",
        type: "line",
        source: "mangaluru-basemap",
        filter: ["==", ["get", "kind"], "arterial"],
        paint: {
          "line-color": "#94a3b8",
          "line-width": 7
        }
      },
      {
        id: "arterial-core",
        type: "line",
        source: "mangaluru-basemap",
        filter: ["==", ["get", "kind"], "arterial"],
        paint: {
          "line-color": "#ffffff",
          "line-width": 4
        }
      }
    ]
  };
}
