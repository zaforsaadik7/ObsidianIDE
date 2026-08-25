---
name: Obsidian Flux
colors:
  surface: '#131314'
  surface-dim: '#131314'
  surface-bright: '#3a393a'
  surface-container-lowest: '#0e0e0f'
  surface-container-low: '#1c1b1c'
  surface-container: '#201f20'
  surface-container-high: '#2a2a2b'
  surface-container-highest: '#353436'
  on-surface: '#e5e2e3'
  on-surface-variant: '#b9caca'
  inverse-surface: '#e5e2e3'
  inverse-on-surface: '#313031'
  outline: '#849495'
  outline-variant: '#3a494a'
  surface-tint: '#00dce5'
  primary: '#e9feff'
  on-primary: '#003739'
  primary-container: '#00f5ff'
  on-primary-container: '#006c71'
  inverse-primary: '#00696e'
  secondary: '#e0b6ff'
  on-secondary: '#42205e'
  secondary-container: '#5a3776'
  on-secondary-container: '#cea5ed'
  tertiary: '#fff8f7'
  on-tertiary: '#68000f'
  tertiary-container: '#ffd3d1'
  on-tertiary-container: '#c50026'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#63f7ff'
  primary-fixed-dim: '#00dce5'
  on-primary-fixed: '#002021'
  on-primary-fixed-variant: '#004f53'
  secondary-fixed: '#f2daff'
  secondary-fixed-dim: '#e0b6ff'
  on-secondary-fixed: '#2c0648'
  on-secondary-fixed-variant: '#5a3776'
  tertiary-fixed: '#ffdad8'
  tertiary-fixed-dim: '#ffb3b0'
  on-tertiary-fixed: '#410006'
  on-tertiary-fixed-variant: '#93001a'
  background: '#131314'
  on-background: '#e5e2e3'
  surface-variant: '#353436'
  surface-light: '#F4F4F6'
  surface-dark: '#0A0A0B'
  surface-slate: '#1A1A1E'
  neon-green: '#39FF14'
  ghost-track: rgba(0, 245, 255, 0.2)
typography:
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.3'
  headline-sm:
    fontFamily: Geist
    fontSize: 18px
    fontWeight: '600'
    lineHeight: '1.4'
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: '1.6'
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.5'
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: '1.4'
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '450'
    lineHeight: '1.5'
  label-caps:
    fontFamily: JetBrains Mono
    fontSize: 11px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: 0.08em
spacing:
  unit: 4px
  gutter: 16px
  margin-desktop: 32px
  margin-mobile: 16px
  pane-gap: 1px
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

In Light Mode, the system shifts to a high-contrast academic paper aesthetic (#F4F4F6) while maintaining the same accent hues for semantic consistency.

## Typography

This design system employs a tiered font strategy to separate intent:
1. **Geist (Headings):** Used for structural hierarchy. Its geometric precision fits the engineering aesthetic.
2. **Inter (Body):** Used for all prose, descriptions, and documentation to ensure maximum legibility during extended reading.
3. **JetBrains Mono (Technical):** Used for code blocks, data labels, status chips, and metadata.

**Scaling:** On mobile devices, `headline-lg` should scale to 24px to prevent excessive wrapping. All technical labels maintain their size regardless of viewport to preserve information density.

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

This "stacked" approach ensures that even in complex multi-pane layouts, the user understands the hierarchy of information without the visual "fuzziness" of traditional ambient shadows.

## Shapes

The shape language is strictly **Sharp (0px)**. 

Every UI element—including buttons, input fields, cards, and modal windows—uses square corners. This reinforces the technical, "engineered" nature of the product and allows components to sit flush against one another in a dense grid without creating awkward negative space at the corners.

## Components

- **Buttons:** Sharp-edged. Neutral buttons use a Slate background. Primary buttons use the Glowing Teal. Interactions are limited to color shifts (Teal to Neon Green) and background-opacity changes. No scaling or "pop" effects.
- **Dual-Pane Admin Cards:** A unique component consisting of a fixed-width left label area (Slate) and a flexible right content area (Obsidian), separated by a 1px vertical line.
- **Flat-Directory File Trees:** Uses JetBrains Mono. Hover states highlight the entire row in a subtle 5% Teal tint. Active files are indicated by a 2px vertical Glowing Teal line on the far left.
- **Glass-morphic Code Graphics:** Overlays within the editor use a high-blur backdrop with a semi-transparent Slate background to maintain text legibility while showing the underlying code context.
- **Input Fields:** 1px solid border. Default border is Slate; Focus border is Glowing Teal. Error state uses a Crimson border with a "shake" animation (horizontal only).
- **Magnetic CTA:** While physical scaling is forbidden, the primary action button can "attract" the cursor within a 20px radius by subtly shifting its internal background-glow toward the cursor position.