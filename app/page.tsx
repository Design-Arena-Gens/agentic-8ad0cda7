"use client";

import dynamic from "next/dynamic";

const PolygonMerger = dynamic(() => import("@/components/PolygonMerger"), { ssr: false });

export default function Page() {
  return (
    <main style={{ padding: 24, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, marginBottom: 8 }}>Merge Disjoint Polygons by Shortest Corridors</h1>
      <p style={{ color: "#555", marginBottom: 20 }}>
        Paste GeoJSON polygons, then merge them into a single connected polygon via shortest connections.
      </p>
      <PolygonMerger />
    </main>
  );
}
