const paths = {
  evidence: "M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3Zm-4 9 3 3 5-6",
  route: "M5 19V8a3 3 0 0 1 6 0v8a3 3 0 0 0 6 0V5m-3 3 3-3 3 3M3 19h4",
  analysis: "M4 4v16h16M8 15l4-5 4 2 4-7",
  commuter: "M5 17h14V7a3 3 0 0 0-3-3H8a3 3 0 0 0-3 3v10Zm0-7h14M8 14h1m6 0h1M7 17v3m10-3v3",
  employer: "M4 21V4h11v17M15 10h5v11M8 8h3m-3 4h3m-3 4h3M2 21h20",
} as const;

export function FeatureIcon({ name }: { name: keyof typeof paths }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={paths[name]} />
    </svg>
  );
}
