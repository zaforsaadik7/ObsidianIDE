---
name: Obsidian Flux - System Design Spec 2
---

## Brand & Style

The design system is engineered for high-performance development environments where focus and clarity are paramount. It targets senior engineers and technical leads who require a low-fatigue workspace for deep work and collaborative oversight.

The aesthetic is **Cyber-Minimalism** fused with **Glassmorphism**. It utilizes a "Deep Obsidian" foundation to minimize eye strain, accented by high-frequency interactive sparks (Glowing Teal) and sophisticated process indicators (Royal Purple). The UI feels technical, precise, and futuristic—evoking the sensation of a high-end command deck.

## Colors

The palette is anchored in a high-contrast dark mode to maximize legibility and reduce glare in low-light environments.

- **Primary (Glowing Teal):** Reserved exclusively for active states, primary actions, and successful build indicators. It should feel like an energized filament.
- **Secondary (Royal Purple):** Used for background processes, asynchronous tasks, and collaborative features (e.g., cursor tracking or branch status).
- **Alert (Cautionary Crimson):** High-saturation red for critical errors, security vulnerabilities, and destructive actions.
- **Surface (Dark Slate):** Used for UI containers, toolbars, and inactive panes to provide subtle separation from the obsidian background.

## Typography

This design system uses a triple-font approach:
1. **Geist (Headlines):** A technical, geometric sans used for section headers and high-level dashboard metrics.
2. **Inter (Body):** The workhorse for documentation, comments, and general UI labels.
3. **JetBrains Mono (Code/Labels):** Essential for the IDE experience. Used for all code blocks, terminal outputs, and small UI metadata.

## Layout & Spacing

- **Workspace Panes:** The core IDE utilizes a "No-Gutter" approach between panes, separated by 2px high-contrast dividers to maximize screen real estate.
- **Dashboards:** Collaborative views use a 12-column fluid grid with 16px gutters for card-based data visualization.
- **Rhythm:** A 4px baseline grid ensures alignment across text and components.

## Elevation & Depth

- **The Substrate:** Base layer is `#0A0A0B`.
- **The Glass Layer:** Modals and floating workspace cards use `backdrop-filter: blur(12px)` with a `1px` border of `rgba(255, 255, 255, 0.1)`.
