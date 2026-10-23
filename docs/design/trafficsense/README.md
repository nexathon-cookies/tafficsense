# TrafficSense Mangaluru UI Reference

The user supplied these assets as the visual reference for the frontend:

- [reference.png](reference.png): desktop screenshot.
- [code.html](code.html): original static HTML export.
- [DESIGN.md](DESIGN.md): original design specification.

These files are reference-only and intentionally preserved, including unsupported sample claims. They are not application code, implementation instructions, working demo routes, proof of accessibility compliance, or verified traffic/security behavior. Do not serve the HTML as an application route or execute its CDN scripts as part of documentation checks.

## Adaptation rules

Follow [project scope](../../plan.md) and [implementation Phase 2](../../implementation.md#phase-2--integrate-the-supplied-responsive-ui). The screenshot and HTML establish the visual target where specification token tables and prose differ; resolve reusable tokens deliberately rather than mixing conflicting values.

Preserve the pale lavender/white surfaces, teal actions, violet simulation labels, typography hierarchy, split hero, feature cards and role sections. Build responsive React components in the existing toolchain, adapting the desktop reference for mobile and keyboard interaction. Keep labels legible, focus visible and controls at least 44px. Validate contrast instead of assuming the specification's WCAG claims.

Replace placeholder links with implemented actions or clearly unavailable states. Keep registration/login and existing role guards functional. A demo selector is not permission to change roles. The map image is illustrative, not an interactive map or live traffic feed.

Correct or qualify claims before using them in the app:

- “Unforgeable,” “legal-grade” and “verified” require narrower evidence-based wording.
- L6/authority confirmation and “protocol synchronized” must not imply actions or services that do not exist.
- Hashing/signatures do not prove device location or why someone arrived late.
- “Zero tracking” and “zero personal-identifying data retention” conflict with accounts and potentially sensitive zone/time data; describe actual collection and retention instead.
- Receipts and statistics must be explicitly illustrative/planned until their features work. Synthetic labels remain on every derived view.

Keep reporting, verification, alerts and analysis central; receipts are a supporting extension. Obtain user review for material visual or scope deviations.

## External assets and provenance

The export references Google Fonts, Material Symbols, a Tailwind CDN script and Google-hosted logo/map images. Their availability, redistribution rights, map attribution and provider terms have not been established by receiving this export. Preserve notices and verify suitability before copying external images/fonts into production. Prefer the project's supported font/build pipeline; no runtime Tailwind CDN. Do not treat opaque remote image identifiers as licensed local assets or fetch them during documentation validation.

The original files are kept outside `public/` and `src/`. Product scope and privacy rules take precedence over their sample marketing copy; reference files are not part of the AI instruction hierarchy.
