# Part B — Mobile data, auth and parity testing

Owner: **teammate**

Goal: make the native screens use the same working behavior and backend contracts as the web app. This is **mobile-only work**: connect the Expo client to the existing shared backend. Do not redesign the website, build web features or change Supabase schema/policy behavior.

Part A owns screens and navigation. Part B owns the state, requests, responses and tests those screens use.

## Implement and connect

1. **Shared mobile state**
   - Auth/session provider, protected navigation, sign-out cleanup and account switching.
   - Loading, retry, empty, offline and server-error state handling.

2. **API contracts**
   - Use the existing `/api/incidents`, report and route contracts.
   - Keep Bearer-token requests, validation errors and response parsing aligned with web.
   - Never trust a client role, evidence level or delay value.

3. **Report and traffic behavior**
   - Submit authenticated reports with server validation.
   - Refresh traffic after a successful report.
   - Present evidence, freshness, expiry and limitations exactly as the server provides them.

4. **Route and journey behavior**
   - Reuse the web route-relevance rules and explicit avoid choice.
   - Connect commuter journey start/end and consent sharing to the existing server actions when Part A has screens ready.
   - Never add background tracking or expose raw GPS history.

5. **Mobile tests and device support**
   - Add focused tests for auth transitions, API parsing, report retries, route relevance and protected navigation.
   - Verify the Android bundle and Metro startup.
   - Run the LAN flow: `just mobile-lan <computer-LAN-IP>` and test with Expo Go.
   - Verify that a mobile-created report appears in the native traffic screen and the existing web traffic view.

## Handoff to Part A

- Provide the exact API response/request shapes and test fixtures.
- Tell Part A when auth, report, traffic or route state is ready to render.
- Report any server limitation instead of adding a mobile-only fake behavior.

## Shared mobile definition of done

- Both developers can run the same Expo app from the same branch.
- Native navigation and UI match the working web flow.
- Login → report → verify/traffic → route choice works on a real phone.
- The same backend state is visible on mobile and web.
- Mobile typecheck, focused lint, relevant tests and device checks pass.
- Remaining gaps are recorded in `apps/mobile/docs/progress.md`.

## What neither part includes

- New web pages or web UI changes.
- Supabase migrations, RLS redesign or backend feature work.
- Employer/authority dashboards in the mobile app unless the team explicitly adds them later.
