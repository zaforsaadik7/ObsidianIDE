---
name: Obsidian Flux - System Design Spec 1
---

## Brand & Style

The design system is engineered for professional academic and industrial research environments. It prioritizes technical precision, high information density, and a "developer-first" aesthetic. The brand personality is characterized by intellectual rigor and futuristic utility—evoking the feeling of a sophisticated laboratory terminal.

The design style is a hybrid of **Minimalist Brutalism** and **Modern Technical**. It utilizes a "flat-first" approach for structural elements (0px border radii, sharp edges) to maximize screen real estate and maintain an organized, modular grid. Depth is not communicated through shadows but through **Tonal Layering** and **Glassmorphism**, specifically using backdrop blurs and semi-transparent surfaces to focus attention during collaborative tasks. 

Interactions are immediate and stable. To maintain the integrity of a complex engineering layout, zero-layout-shift is a core principle. Feedback is provided through high-speed color transitions and opacity shifts rather than physical scaling or movement of elements.

## Colors

The palette is optimized for long-duration focus in dark mode, which serves as the default state.

- **Primary (Glowing Teal):** Used for active states, primary actions, and successful validation. It represents the "active current" of the system.
- **Secondary (Royal Purple):** Reserved exclusively for collaboration features, peer reviews, and multi-user presence indicators.
- **Tertiary (Crimson):** Used for destructive actions, syntax errors, and critical system alerts.
- **Neutrals:** The background utilizes a deep Obsidian (#0A0A0B). Surfaces and containers use a tiered Slate approach to create depth without relying on drop shadows.

## Typography

This design system employs a tiered font strategy to separate intent:
1. **Geist (Headings):** Used for structural hierarchy. Its geometric precision fits the engineering aesthetic.
2. **Inter (Body):** Used for all prose, descriptions, and documentation to ensure maximum legibility during extended reading.
3. **JetBrains Mono (Technical):** Used for code blocks, data labels, status chips, and metadata.

## Layout & Spacing

The layout is based on a **Fixed Grid** system that emphasizes pane-based architecture. 

- **Multi-Pane Environment:** The UI is divided into functional regions (File Tree, Editor, Inspector) separated by a 1px "Ghost Track" border. 
- **Resizing:** During pane resizing, a 20% opacity Teal "ghost track" line appears to indicate the new boundary before the layout snaps.
- **Responsiveness:** 
  - **Desktop:** 12-column grid with fixed sidebars.
  - **Tablet:** 8-column grid; sidebars become collapsible drawers.
  - **Mobile:** Single-column focus. The "Dual-pane" admin cards stack vertically.
  
All spacing is derived from a 4px base unit to ensure alignment with monospaced text elements.

## Elevation & Depth

Depth is established through **Tonal Layering** rather than shadows. 

1. **Base (Level 0):** Obsidian (#0A0A0B). Used for the primary application background.
2. **Surface (Level 1):** Slate (#1A1A1E). Used for cards, panes, and navigation bars.
3. **Overlay (Level 2):** Glassmorphic surfaces with a 12px backdrop blur and 10% white border-stroke. Used for code editor graphics and floating "Meet" drawers.

## Components

- **Buttons:** Sharp-edged. Neutral buttons use a Slate background. Primary buttons use the Glowing Teal.
- **Dual-Pane Admin Cards:** Fixed-width left label area (Slate) and a flexible right content area (Obsidian), separated by a 1px vertical line.
- **Flat-Directory File Trees:** Uses JetBrains Mono. Hover states highlight the entire row in a subtle 5% Teal tint. Active files are indicated by a 2px vertical Glowing Teal line on the far left.
- **Glass-morphic Code Graphics:** Overlays within the editor use a high-blur backdrop with a semi-transparent Slate background.
