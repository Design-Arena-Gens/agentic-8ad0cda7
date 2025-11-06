import type { Feature, FeatureCollection, LineString, MultiPolygon, Polygon, Position } from "geojson";
import * as turf from "@turf/turf";

export type MergeDebug = {
  pairs: Array<{ a: number; b: number; distance: number; seg: Feature<LineString> }>;
  mstEdges: Array<{ a: number; b: number; seg: Feature<LineString> }>;
  corridorPolygons: Array<Feature<Polygon | MultiPolygon>>;
};

export function mergePolygonsWithShortestCorridors(
  features: Feature<Polygon | MultiPolygon>[],
  options?: { corridorFactor?: number }
): { output: Feature<Polygon | MultiPolygon>; debug: MergeDebug } {
  const polys = features.map((f) => turf.clone(f));
  const n = polys.length;
  if (n === 1) return { output: polys[0], debug: { pairs: [], mstEdges: [], corridorPolygons: [] } };

  const bboxAll = turf.bbox({ type: "FeatureCollection", features: polys as any });
  const diagKm = bboxDiagonalKm(bboxAll);
  const corridorWidthKm = (diagKm || 1) * 0.02 * (options?.corridorFactor ?? 1); // 2% of diagonal by default

  // Build complete graph with shortest connecting segment between polygons
  const edges: Array<{ a: number; b: number; distance: number; seg: Feature<LineString> }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const seg = shortestSegmentBetween(polys[i], polys[j]);
      const distance = turf.length(seg, { units: "kilometers" });
      edges.push({ a: i, b: j, distance, seg });
    }
  }
  edges.sort((x, y) => x.distance - y.distance);

  // Kruskal MST
  const uf = new UnionFind(n);
  const mstEdges: Array<{ a: number; b: number; seg: Feature<LineString> }> = [];
  for (const e of edges) {
    if (uf.find(e.a) !== uf.find(e.b)) {
      uf.union(e.a, e.b);
      mstEdges.push({ a: e.a, b: e.b, seg: e.seg });
      if (mstEdges.length === n - 1) break;
    }
  }

  // Create buffered corridors from MST line segments
  const corridorPolygons: Array<Feature<Polygon | MultiPolygon>> = [];
  for (const e of mstEdges) {
    const buffer = turf.buffer(e.seg, corridorWidthKm, { units: "kilometers" });
    corridorPolygons.push(buffer as Feature<Polygon | MultiPolygon>);
  }

  // Union all original polygons + corridor buffers into one
  let accumulated: Feature<Polygon | MultiPolygon> | null = null;
  const allPieces: Feature<Polygon | MultiPolygon>[] = [...polys as any, ...corridorPolygons];
  for (const piece of allPieces) {
    accumulated = accumulated ? (turf.union(accumulated, piece) as any) : piece;
  }
  if (!accumulated) throw new Error("Union failed");

  return {
    output: accumulated,
    debug: { pairs: edges, mstEdges, corridorPolygons }
  };
}

function shortestSegmentBetween(a: Feature<Polygon | MultiPolygon>, b: Feature<Polygon | MultiPolygon>): Feature<LineString> {
  // Strategy: sample points along outer rings and find min-distance pair
  const samplesA = samplePerimeterPoints(a, 24);
  const samplesB = samplePerimeterPoints(b, 24);
  let best: { pa: Position; pb: Position; d: number } | null = null;
  for (const pa of samplesA) {
    for (const pb of samplesB) {
      const d = turf.distance(pa as any, pb as any, { units: "kilometers" });
      if (!best || d < best.d) best = { pa, pb, d };
    }
  }
  if (!best) {
    // Fallback: centroids
    const ca = turf.getCoord(turf.centroid(a));
    const cb = turf.getCoord(turf.centroid(b));
    return turf.lineString([ca, cb]);
  }
  return turf.lineString([best.pa, best.pb]);
}

function samplePerimeterPoints(p: Feature<Polygon | MultiPolygon>, targetPerRing: number): Position[] {
  const positions: Position[] = [];
  const polys = p.geometry.type === "Polygon" ? [p.geometry.coordinates] : p.geometry.coordinates;
  for (const poly of polys) {
    if (!poly.length) continue;
    // Only exterior ring for connectivity
    const ring = poly[0];
    // Emit vertices
    for (const pos of ring) positions.push(pos as Position);
    // Uniformly sample along edges
    for (let i = 0; i + 1 < ring.length; i++) {
      const a = ring[i] as Position;
      const b = ring[i + 1] as Position;
      for (let s = 1; s < targetPerRing / (ring.length - 1); s++) {
        const t = s / Math.ceil(targetPerRing / (ring.length - 1));
        positions.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      }
    }
  }
  return positions;
}

function bboxDiagonalKm(bbox: turf.BBox): number {
  const [minX, minY, maxX, maxY] = bbox;
  try {
    return turf.distance([minX, minY], [maxX, maxY], { units: "kilometers" });
  } catch {
    return 1;
  }
}

class UnionFind {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = Array(n).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x) this.parent[x] = this.find(this.parent[x]);
    return this.parent[x];
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    if (this.rank[ra] < this.rank[rb]) {
      this.parent[ra] = rb;
    } else if (this.rank[ra] > this.rank[rb]) {
      this.parent[rb] = ra;
    } else {
      this.parent[rb] = ra;
      this.rank[ra]++;
    }
  }
}
