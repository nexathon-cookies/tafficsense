export function CorridorPreview() {
  return (
    <figure className="corridor-preview" aria-labelledby="corridor-preview-title">
      <div className="panel-heading">
        <h2 id="corridor-preview-title">Corridor view</h2>
        <span className="simulated-pill">Design preview</span>
      </div>
      <div className="corridor-illustration">
        <svg viewBox="0 0 480 220" role="img" aria-label="Schematic of a primary route and an alternative, not a geographic map">
          <rect width="480" height="220" fill="#edf3ec" />
          <path d="M0 0H115L136 40 114 82 139 124 112 176 127 220H0Z" fill="#b9e2ec" />
          <g fill="#d6e6d8">
            <rect x="158" y="18" width="77" height="41" rx="8" />
            <rect x="275" y="17" width="90" height="43" rx="8" />
            <rect x="187" y="153" width="57" height="49" rx="8" />
            <rect x="310" y="146" width="100" height="56" rx="8" />
          </g>
          <g fill="none" stroke="#ffffff" strokeWidth="12">
            <path d="M137 0L169 78 221 118 264 220M255 0L256 73 306 113 350 220M412 0L392 99 440 220M122 47L480 74M131 158L480 127" />
          </g>
          <path d="M159 179L200 119 275 96 369 108 426 61" fill="none" stroke="#005c55" strokeWidth="7" strokeLinecap="round" />
          <path d="M200 119L219 57 329 43 369 108" fill="none" stroke="#6616d7" strokeWidth="4" strokeDasharray="8 7" strokeLinecap="round" />
          <g fill="#ffffff" stroke="#005c55" strokeWidth="4">
            <circle cx="159" cy="179" r="8" /><circle cx="275" cy="96" r="8" /><circle cx="426" cy="61" r="8" />
          </g>
        </svg>
        <span className="illustration-label">Illustration only · not a live map</span>
      </div>
      <div className="preview-route"><span className="route-key" />Primary route <span>Planned</span></div>
      <div className="preview-route"><span className="route-key alternative" />Fixed alternative <span>Planned</span></div>
      <figcaption>No traffic observations are loaded yet. Interactive maps and route comparisons appear when reports are available.</figcaption>
    </figure>
  );
}
