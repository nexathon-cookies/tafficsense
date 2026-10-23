# Mobile app rules

Read the [shared app rules](../../../ai/resources/app_common_rules.md) and the repository [AI rules](../../../ai/ai_agent_root_rules.md).

For any screen, style, map, navigation, API-wiring, or UI-test change, follow the mandatory [mobile UI implementation rules](../docs/ui-implementation-rules.md) and [mobile UI implementation and verification plan](../docs/ui-implementation-plan.md). The visual source is [the mobile design specification (Plan 2: Precision Mobility)](../design/plan2/DESIGN.md) (with Plan 1 preserved under `../design/plan1/`); [Part A](../docs/part-a-mobile-device.md) defines screen/navigation intent and [Part B](../docs/part-b-mobile-logic-integration.md) defines integration/parity expectations. Preserve working flows and server contracts over static reference visuals. Follow decisions D1–D8 in `../docs/IMPLEMENTATION_INSTRUCTIONS_premium_ui.md`.

- Use Expo and the existing React Native conventions when the mobile app is implemented.
- Test supported flows in Expo Go or the configured device workflow before claiming mobile verification.
- Treat background location, notifications, offline data, and secure storage as consented, privacy-sensitive features.
- Keep EAS configuration and device-specific behavior explicit; do not imply web-browser verification covers native behavior.
- Record mobile-only work in [mobile progress](../docs/progress.md).
