# Object-Oriented Programming and Abstractions

Use the simplest structure supported by the chosen language and framework. Functions and plain data structures are often sufficient; classes are useful when they clarify state, lifecycle, or responsibilities.

- Prefer composition over deep inheritance.
- Introduce an interface for a concrete need, such as isolating a routing provider for testing or selecting an explicit simulated adapter.
- Avoid speculative factories, generic repositories, and plugin systems.
- Keep business rules independent of UI components and provider-specific response formats where practical.
- Keep constructors free of unexpected network or filesystem work; expose lifecycle operations explicitly.
- Release resources and cancel background work through the framework's established lifecycle mechanisms.
- Split code by cohesive responsibilities rather than arbitrary line or method counts.

Do not create separate services merely because the architecture document lists separate responsibilities.
