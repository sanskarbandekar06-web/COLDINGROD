---
name: Coldingrod
colors:
  surface: '#fcf8fa'
  surface-dim: '#dcd9db'
  surface-bright: '#fcf8fa'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f5'
  surface-container: '#f0edef'
  surface-container-high: '#eae7e9'
  surface-container-highest: '#e4e2e4'
  on-surface: '#1b1b1d'
  on-surface-variant: '#45464d'
  inverse-surface: '#303032'
  inverse-on-surface: '#f3f0f2'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#5c5f61'
  on-secondary: '#ffffff'
  secondary-container: '#e0e3e5'
  on-secondary-container: '#626567'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#271901'
  on-tertiary-container: '#98805d'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#e0e3e5'
  secondary-fixed-dim: '#c4c7c9'
  on-secondary-fixed: '#191c1e'
  on-secondary-fixed-variant: '#444749'
  tertiary-fixed: '#fcdeb5'
  tertiary-fixed-dim: '#dec29a'
  on-tertiary-fixed: '#271901'
  on-tertiary-fixed-variant: '#574425'
  background: '#fcf8fa'
  on-background: '#1b1b1d'
  surface-variant: '#e4e2e4'
typography:
  display-lg:
    fontFamily: Geist
    fontSize: 48px
    fontWeight: '700'
    lineHeight: 56px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Geist
    fontSize: 32px
    fontWeight: '600'
    lineHeight: 40px
    letterSpacing: -0.01em
  headline-lg-mobile:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-md:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  body-lg:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Geist
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.02em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 4px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  gutter: 20px
  margin-mobile: 16px
  margin-desktop: 40px
---

## Brand & Style
The design system is engineered for high-performance digital agencies, emphasizing clarity, precision, and a sophisticated "Soft Minimalist" aesthetic. It draws inspiration from the industry-leading utility of GitHub and the refined polish of Stripe and Vercel. 

The personality is authoritative yet unobtrusive. The UI acts as a silent partner, utilizing a "Spatial UI" approach where depth is conveyed through subtle layering rather than decorative ornamentation. The "Bento Grid" philosophy governs the interface, organizing complex agency data into modular, digestible containers that feel both structured and expansive. High whitespace usage ensures the cognitive load remains low, even when managing dense project lifecycles.

## Colors
The palette follows a strict 60-30-10 distribution to maintain a premium enterprise feel.
- **Surface (60%):** #F8FAFC is the primary canvas, providing a clean, light-gray foundation that reduces eye strain compared to pure white.
- **Primary/Text (30%):** #0F172A (Deep Slate) provides high-contrast grounding for typography and structural headers.
- **Accent (10%):** #3B82F6 (Professional Blue) is used selectively for primary calls-to-action and active states.

Functional colors for Success (#10B981) and Error (#F43F5E) are used sparingly to signal system status without disrupting the minimalist aesthetic. Subtle borders (#E2E8F0) define the grid without adding visual weight.

## Typography
The system utilizes **Geist** for its technical precision and modern geometric rhythm, reflecting a developer-centric and agency-standard polish. Headlines use tighter letter spacing and heavier weights to create a strong visual anchor.

For technical metadata, status labels, and monospaced data entries, **JetBrains Mono** is employed at small scales to provide a "developer-tool" feel, reinforcing the Business OS utility. Body text maintains a generous line height to ensure readability during long-form project management tasks.

## Layout & Spacing
This design system utilizes a **Bento Grid** philosophy. The layout is built on a 12-column fluid grid for desktop and a single-column flow for mobile. 

Spacing follows a strict 4px/8px incremental scale. Containers within the Bento Grid use `24px` padding to provide internal "breathing room." Content is grouped into logical modules that snap to the grid, creating a sense of order and reliability. On desktop, large margins (40px) push the focus toward the center, while mobile layouts collapse into vertical stacks with 16px safe-area margins.

## Elevation & Depth
Depth is handled through **Selective Glassmorphism** and tonal layering. 
- **Level 0 (Base):** #F8FAFC background.
- **Level 1 (Cards):** Solid white (#FFFFFF) with a 1px #E2E8F0 border and a very soft, diffused shadow (0px 1px 3px rgba(15, 23, 42, 0.05)).
- **Level 2 (Overlays/Modals):** Glassmorphic surfaces using a background-blur (12px) and 80% opacity white fill. This creates a spatial UI effect where the user feels they are working "above" the main dashboard.
- **Level 3 (Popovers):** Higher contrast shadows (0px 10px 15px rgba(15, 23, 42, 0.1)) to indicate temporary interaction points.

## Shapes
A consistent `8px` (rounded-md) radius is the standard for all primary UI elements, including buttons, input fields, and Bento cards. This creates a friendly yet professional appearance that feels "soft" without losing the "enterprise" edge. Smaller components like tags/badges may use a fully circular (pill) radius to distinguish them from actionable buttons.

## Components
- **Buttons:** Primary buttons use #0F172A with white text for maximum impact. Secondary buttons use a white background with a 1px #E2E8F0 border.
- **Bento Cards:** The cornerstone of the OS. Every card must have a 1px #E2E8F0 border and 24px internal padding. Titles within cards use `title-md`.
- **Input Fields:** 1px #E2E8F0 border, 8px radius. On focus, the border transitions to #3B82F6 with a subtle 2px glow of the same color at 10% opacity.
- **Status Chips:** Small caps `label-sm` text. Use low-saturation backgrounds (e.g., light emerald for success) with high-saturation text.
- **Glass Overlays:** Used specifically for sidebar navigation or command palettes (CMD+K) to maintain context of the underlying data.
- **Lists:** Clean rows with 1px bottom borders. Hover states should trigger a subtle shift to #F1F5F9 to indicate interactivity.