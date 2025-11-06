"use client";

import { useMemo, useState } from "react";
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from "geojson";
import { mergePolygonsWithShortestCorridors, type MergeDebug } from "@/utils/geometry";

const example: FeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { id: "A" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 1],
            [0, 0]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: { id: "B" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [3, 0.2],
            [4.2, 0.2],
            [4.2, 1.2],
            [3, 1.2],
            [3, 0.2]
          ]
        ]
      }
    },
    {
      type: "Feature",
      properties: { id: "C" },
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [2, 2.5],
            [2.8, 2.5],
            [2.8, 3.2],
            [2, 3.2],
            [2, 2.5]
          ]
        ]
      }
    }
  ]
};

function flattenToPolygons(fc: FeatureCollection): Feature<Polygon | MultiPolygon>[] {
  return fc.features.filter((f) => f.geometry && (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon")) as Feature<Polygon | MultiPolygon>[];
}

function computeBounds(fc: FeatureCollection) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const f of fc.features) {
    const geom: any = f.geometry;
    if (!geom) continue;
    const coords = geom.type === "Polygon" ? geom.coordinates : geom.type === "MultiPolygon" ? geom.coordinates.flat(1) : [];
    for (const ring of coords) {
      for (const [x, y] of ring) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (!isFinite(minX)) return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  return { minX, minY, maxX, maxY };
}

function project([x, y]: [number, number], bounds: { minX: number; minY: number; maxX: number; maxY: number }, w: number, h: number): [number, number] {
  const pad = 20;
  const width = w - pad * 2;
  const height = h - pad * 2;
  const scaleX = width / (bounds.maxX - bounds.minX || 1);
  const scaleY = height / (bounds.maxY - bounds.minY || 1);
  const s = Math.min(scaleX, scaleY);
  const px = pad + (x - bounds.minX) * s;
  const py = pad + height - (y - bounds.minY) * s; // invert y for screen
  return [px, py];
}

function ringToPath(ring: number[][], bounds: any, w: number, h: number): string {
  return ring.map((pt) => project(pt as any, bounds, w, h).join(",")).map((p) => `L${p}`).join(" ").replace(/^L/, "M") + " Z";
}

function polygonPath(geom: Polygon | MultiPolygon, bounds: any, w: number, h: number): string {
  if (geom.type === "Polygon") {
    return geom.coordinates.map((ring) => ringToPath(ring, bounds, w, h)).join(" ");
  }
  return geom.coordinates.map((poly) => poly.map((ring) => ringToPath(ring, bounds, w, h)).join(" ")).join(" ");
}

export default function PolygonMerger() {
  const [input, setInput] = useState<string>(() => JSON.stringify(example, null, 2));
  const [factor, setFactor] = useState<number>(1);
  const [result, setResult] = useState<Feature<Polygon | MultiPolygon> | null>(null);
  const [debug, setDebug] = useState<MergeDebug | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsed = useMemo<FeatureCollection | null>(() => {
    try {
      const v = JSON.parse(input);
      if (v && v.type === "FeatureCollection") return v as FeatureCollection;
      return null;
    } catch {
      return null;
    }
  }, [input]);

  const bounds = useMemo(() => (parsed ? computeBounds(parsed) : { minX: 0, minY: 0, maxX: 1, maxY: 1 }), [parsed]);

  function onMerge() {
    setError(null);
    if (!parsed) {
      setError("Invalid GeoJSON FeatureCollection");
      return;
    }
    const polys = flattenToPolygons(parsed);
    if (polys.length < 2) {
      setError("Provide at least two polygons");
      return;
    }
    const { output, debug } = mergePolygonsWithShortestCorridors(polys, { corridorFactor: factor });
    setResult(output);
    setDebug(debug);
  }

  const width = 900;
  const height = 520;

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <div>
          <label style={{ fontWeight: 600 }}>GeoJSON FeatureCollection</label>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            spellCheck={false}
            style={{ width: "100%", height: 300, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco", fontSize: 12, marginTop: 8 }}
          />
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12 }}>
            <label>Corridor factor</label>
            <input type="range" min={0.2} max={3} step={0.1} value={factor} onChange={(e) => setFactor(parseFloat(e.target.value))} />
            <span>{factor.toFixed(1)}x</span>
            <button onClick={onMerge} style={{ padding: "8px 12px", fontWeight: 600 }}>Merge</button>
          </div>
          {error && <div style={{ color: "#b91c1c", marginTop: 8 }}>{error}</div>}
        </div>
        <div>
          <label style={{ fontWeight: 600 }}>Output GeoJSON</label>
          <textarea
            readOnly
            value={result ? JSON.stringify(result, null, 2) : "// Click Merge to compute"}
            style={{ width: "100%", height: 300, fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco", fontSize: 12, marginTop: 8 }}
          />
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <svg width={width} height={height} style={{ border: "1px solid #eee", background: "#fafafa" }}>
          {/* input polygons */}
          {parsed && flattenToPolygons(parsed).map((f, i) => (
            <path key={i} d={polygonPath(f.geometry, bounds, width, height)} fill="#c7d2fe" stroke="#4338ca" strokeWidth={1.5} fillOpacity={0.5} />
          ))}

          {/* corridors */}
          {debug?.corridorPolygons?.map((poly, i) => (
            <path key={i} d={polygonPath(poly.geometry as any, bounds, width, height)} fill="#fef3c7" stroke="#f59e0b" strokeWidth={1.5} fillOpacity={0.6} />
          ))}

          {/* result */}
          {result && (
            <path d={polygonPath(result.geometry as any, bounds, width, height)} fill="#dcfce7" stroke="#16a34a" strokeWidth={2} fillOpacity={0.6} />
          )}
        </svg>
      </div>
    </div>
  );
}
