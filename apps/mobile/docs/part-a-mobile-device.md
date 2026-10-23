# Part A — Mobile screens, UI and navigation

Owner: **you**

Goal: copy the working web app's user flow into the native Expo app. Use the web screens, wording, order and design as the reference; do not invent a separate mobile product.

This is **mobile-only work**. Do not change the website, Supabase schema, RLS policies or backend. Part B supplies the data and auth functions that these screens call.

## Design plan (follow the web theme)

Use the existing web design tokens rather than choosing new colors:

- **Screen background:** pale lavender `#faf8ff`.
- **Cards and inputs:** white `#ffffff`, with a subtle lavender border `#e2e7ff`.
- **Primary action:** deep teal `#005c55`; pressed/hover state `#004741`; white text.
- **Secondary action:** white background, dark text `#131b2e`, outline `#cbd5e1`.
- **Simulation/evidence labels:** violet `#6616d7` on a very light violet surface; never present simulated data as live fact.
- **Warning/support accent:** orange `#904d00` / `#fe932c`.
- **Errors:** red `#ba1a1a` on `#fff0ed`.
- **Text:** dark navy `#131b2e`; secondary text `#3e4947`.

Use a clear large heading, short supporting text, rounded cards, teal filled primary buttons and outlined secondary buttons. Keep every control at least 44px tall, preserve visible pressed/focus states, and keep spacing generous for a phone. Adapt the web split-hero layout into a single-column mobile layout; do not copy desktop columns literally.

## Navigation map

Use this flow and do not create parallel or dead-end routes:

`Home → Report` (`/report`) or `Home → Plan route` (`/planner`)

`Report → Sign in` (`/auth/login`) when required → `Submit → Traffic` (`/traffic`)

`Plan route → Enter route → Route result → Incident details → Explicitly choose an alternative`

`Sign in → Workspace` (`/workspace`) → `Report`, `Traffic` or `Plan route`; sign out returns to `Home`.

Rules:

- Use stack navigation with a visible title and a working back button on child screens.
- After successful sign-in, replace the auth screen so Back does not return to login.
- After sign-out, clear private screens and replace the stack with Home.
- Preserve form input when returning from permission or sign-in where safe; never silently submit.
- Use one canonical screen for each feature. Do not duplicate report, traffic or route flows under different paths.
- Deep links and reloads must resolve to a safe screen; unauthenticated private routes redirect to sign-in.

## Build these mobile screens in this order

1. **Home**
   - Explain TrafficSense simply.
   - Provide the same primary actions as web: report a problem and view/plan traffic.

2. **Authentication**
   - Login, registration, confirmation message, loading and error states.
   - Match the web wording and protected navigation.

3. **Commuter workspace**
   - Show the signed-in commuter state and sign-out.
   - Keep navigation consistent after reload and account changes.

4. **Report flow**
   - Category selection, optional note, location permission only on submit, submit result.
   - Match web success, denied, unavailable, duplicate and failure states.

5. **Traffic and route flow**
   - Active incident list/map-style presentation, details, evidence label, freshness and refresh.
   - Show route warning and require an explicit avoid choice before showing an alternative.
   - Keep free-flow estimates labelled honestly.

6. **Commuter journey/sharing screens**
   - Add only the commuter-facing start/end, consent preview and stop-sharing screens that already exist on web.
   - Do not expose employer or authority administration in the native app unless explicitly requested.

## UI acceptance

- Navigation has no dead ends or incorrect back behavior.
- Loading, empty, denied, stale, offline and error states are visible.
- Phone layout has readable text, usable touch targets and no horizontal overflow.
- Labels, colors and wording match the web behavior and design intent.
- Test Android Expo Go first; check iOS configuration if it is a target.

## Handoff to Part B

- Tell Part B which screens and navigation paths are ready.
- List any API field or auth-state the UI still needs.
- Do not change API contracts silently; agree on changes before coding.

## Part A is complete when

- A phone user can follow the same path as the web user: Home → report or traffic → details/route choice → sign in when required.
- The native layout, labels, buttons, back behavior and loading/error/empty states match the web intent.
- Every screen works with Part B's real state; no hard-coded demo success is used.
