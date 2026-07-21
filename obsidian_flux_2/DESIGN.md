---
name: Obsidian Flux
colors:
  surface: '#131315'
  surface-dim: '#131315'
  surface-bright: '#39393b'
  surface-container-lowest: '#0e0e10'
  surface-container-low: '#1b1b1d'
  surface-container: '#1f1f21'
  surface-container-high: '#2a2a2c'
  surface-container-highest: '#353437'
  on-surface: '#e4e2e4'
  on-surface-variant: '#b9caca'
  inverse-surface: '#e4e2e4'
  inverse-on-surface: '#303032'
  outline: '#849495'
  outline-variant: '#3a494a'
  surface-tint: '#00dce5'
  primary: '#e9feff'
  on-primary: '#003739'
  primary-container: '#00f5ff'
  on-primary-container: '#006c71'
  inverse-primary: '#00696e'
  secondary: '#e0b6ff'
  on-secondary: '#4c007d'
  secondary-container: '#6d11ad'
  on-secondary-container: '#d7a4ff'
  tertiary: '#fff8f7'
  on-tertiary: '#690006'
  tertiary-container: '#ffd3ce'
  on-tertiary-container: '#c50016'
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
  on-secondary-fixed: '#2e004e'
  on-secondary-fixed-variant: '#6a0baa'
  tertiary-fixed: '#ffdad6'
  tertiary-fixed-dim: '#ffb4ac'
  on-tertiary-fixed: '#410002'
  on-tertiary-fixed-variant: '#93000d'
  background: '#131315'
  on-background: '#e4e2e4'
  surface-variant: '#353437'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1.1'
    letterSpacing: -0.02em
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
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
  code-md:
    fontFamily: JetBrains Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: '1.6'
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: '1.0'
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  unit: 4px
  gutter: 16px
  margin: 24px
  pane-gap: 2px
  sidebar-width: 260px
  toolbar-height: 48px
---

## Brand & Style

The design system is engineered for high-performance development environments where focus and clarity are paramount. It targets senior engineers and technical leads who require a low-fatigue workspace for deep work and collaborative oversight.

The aesthetic is **Cyber-Minimalism** fused with **Glassmorphism**. It utilizes a "Deep Obsidian" foundation to minimize eye strain, accented by high-frequency interactive sparks (Glowing Teal) and sophisticated process indicators (Royal Purple). The UI feels technical, precise, and futuristic—evoking the sensation of a high-end command deck.

Key visual principles:
- **Optical Precision:** Every pixel serves a functional purpose; decoration is secondary to data density.
- **Luminous Hierarchy:** Interaction is guided by "glowing" elements that appear to emit light against the dark substrate.
- **Fluid Connectivity:** Motion follows a strict physical logic, making the complex multi-pane interface feel like a single, cohesive instrument.

## Colors

The palette is anchored in a high-contrast dark mode to maximize legibility and reduce glare in low-light environments.

- **Primary (Glowing Teal):** Reserved exclusively for active states, primary actions, and successful build indicators. It should feel like an energized filament.
- **Secondary (Royal Purple):** Used for background processes, asynchronous tasks, and collaborative features (e.g., cursor tracking or branch status).
- **Alert (Cautionary Crimson):** High-saturation red for critical errors, security vulnerabilities, and destructive actions.
- **Surface (Dark Slate):** Used for UI containers, toolbars, and inactive panes to provide subtle separation from the obsidian background.
- **Status Tints:** Use 10-20% opacity versions of these colors for hover states and background fills to maintain context without overwhelming the user.

## Typography

This design system uses a triple-font approach to balance editorial impact, general readability, and technical precision.

1.  **Geist (Headlines):** A technical, geometric sans used for section headers and high-level dashboard metrics. It conveys a modern, developer-centric feel.
2.  **Inter (Body):** The workhorse for documentation, comments, and general UI labels. Chosen for its exceptional legibility and neutral character.
3.  **JetBrains Mono (Code/Labels):** Essential for the IDE experience. Used for all code blocks, terminal outputs, and small UI metadata (tags, timestamps).

Typography scales are kept tight to allow for high information density without sacrificing clarity.

## Layout & Spacing

The layout utilizes a **Fixed-Fluid Hybrid** model optimized for multi-pane productivity.

- **Workspace Panes:** The core IDE utilizes a "No-Gutter" approach between panes, separated by 2px high-contrast dividers to maximize screen real estate.
- **Dashboards:** Collaborative views use a 12-column fluid grid with 16px gutters for card-based data visualization.
- **Rhythm:** A 4px baseline grid ensures alignment across text and components. Spacing between major sections should always be a multiple of 8px.
- **Reflow:** On smaller screens, sidebars collapse into "Icon-only" rails, and secondary panes (like terminal or file tree) move to a tabbed overlay system.

## Elevation & Depth

Visual hierarchy is established through transparency and light emission rather than traditional shadows.

- **The Substrate:** The base layer is `#0A0A0B`.
- **The Glass Layer:** Modals and floating workspace cards use `backdrop-filter: blur(12px)` with a `1px` border of `rgba(255, 255, 255, 0.1)`. This creates a frosted tech aesthetic.
- **Interaction Glow:** Hovered elements do not cast black shadows; they cast a subtle "outer glow" using their respective primary/secondary color (e.g., `0 0 15px rgba(0, 245, 255, 0.2)`).
- **Z-Index Strategy:** 
    - Base (0): Main editor/dashboard background.
    - Raised (100): Hovered cards, active line highlights.
    - Overlay (200): Sidebars, toolbars.
    - Modal (500): Command palettes, dialogs.

## Shapes

The design system adopts a **Soft-Technical** shape language.

- **Base Radius (4px):** Used for standard buttons, inputs, and tags to maintain a crisp, professional appearance.
- **Container Radius (8px):** Used for cards and modals to provide a slight visual softening against the sharp lines of the IDE.
- **Sharp Edges:** Tab headers and pane dividers remain at 0px radius to emphasize the "locked-in" grid feel of a high-performance tool.

## Components

### Interactive Elements
- **Magnetic Buttons:** Primary buttons (`#00F5FF` text or fill) utilize a magnetic hover effect where the label subtly pulls toward the cursor within a 20px radius. Use `scale(1.02)` on hover.
- **Fluid Tags:** System status and language tags use `JetBrains Mono`. They are pill-shaped with low-opacity backgrounds (`10%`) and 100% opacity borders of the same hue.

### Input & IDE
- **Input Fields:** Dark Slate background (`#1A1A1C`) with a bottom-only `2px` focus border in Glowing Teal.
- **Multi-Pane Layouts:** Handlebars for resizing panes should be nearly invisible until hover, then glow Teal to indicate interactivity.
- **Glass Modals:** Centered overlays with heavy backdrop blur and high-contrast typography.

### Collaborative Feedback
- **Active Cursors:** Use the Secondary Purple color for remote collaborator cursors, with a label tag that fades out after 2 seconds of inactivity.
- **Floating Cards:** Project summaries and file previews use the glass-morphic style, appearing to float above the editor with a subtle `y-axis` float animation.

### Motion Details
- **Transition:** All state changes use `cubic-bezier(0.4, 0, 0.2, 1)` over `250ms`.
- **Elevation:** Elements "lift" using a combination of `translateY(-2px)` and increased glow intensity.