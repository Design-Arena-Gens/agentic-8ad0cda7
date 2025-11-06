export const metadata = {
  title: "Polygon Merger",
  description: "Merge disjoint polygons by shortest corridors"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto' }}>
        {children}
      </body>
    </html>
  );
}
