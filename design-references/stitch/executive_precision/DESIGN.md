---
name: Executive Precision
colors:
  surface: '#f8f9ff'
  surface-dim: '#cbdbf5'
  surface-bright: '#f8f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#eff4ff'
  surface-container: '#e5eeff'
  surface-container-high: '#dce9ff'
  surface-container-highest: '#d3e4fe'
  on-surface: '#0b1c30'
  on-surface-variant: '#45464d'
  inverse-surface: '#213145'
  inverse-on-surface: '#eaf1ff'
  outline: '#76777d'
  outline-variant: '#c6c6cd'
  surface-tint: '#565e74'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#131b2e'
  on-primary-container: '#7c839b'
  inverse-primary: '#bec6e0'
  secondary: '#4b41e1'
  on-secondary: '#ffffff'
  secondary-container: '#645efb'
  on-secondary-container: '#fffbff'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#191c1e'
  on-tertiary-container: '#818486'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#dae2fd'
  primary-fixed-dim: '#bec6e0'
  on-primary-fixed: '#131b2e'
  on-primary-fixed-variant: '#3f465c'
  secondary-fixed: '#e2dfff'
  secondary-fixed-dim: '#c3c0ff'
  on-secondary-fixed: '#0f0069'
  on-secondary-fixed-variant: '#3323cc'
  tertiary-fixed: '#e0e3e5'
  tertiary-fixed-dim: '#c4c7c9'
  on-tertiary-fixed: '#191c1e'
  on-tertiary-fixed-variant: '#444749'
  background: '#f8f9ff'
  on-background: '#0b1c30'
  surface-variant: '#d3e4fe'
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
  headline-md:
    fontFamily: Geist
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
  title-lg:
    fontFamily: Geist
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  title-md:
    fontFamily: Geist
    fontSize: 16px
    fontWeight: '500'
    lineHeight: 24px
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
  label-md:
    fontFamily: Geist
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
    letterSpacing: 0.05em
  code-sm:
    fontFamily: Geist Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 12px
  md: 24px
  lg: 32px
  xl: 48px
  gutter: 20px
  margin-mobile: 16px
  margin-desktop: 32px
---

## Brand & Style
The design system is engineered for high-performance enterprise environments, where clarity and executive focus are paramount. It adopts a **Soft Minimalist** aesthetic combined with a **Spatial UI** philosophy, using depth and subtle motion to organize complex business operations.

The interface prioritizes a **Bento Grid** layout, allowing modular data visualization that remains readable under heavy information density. The emotional response is one of "calm authority"—the system should feel fast, extremely organized, and unshakeably reliable. 

Key stylistic pillars include:
- **Spatial Hierarchy:** Using selective glassmorphism to indicate temporary overlays (modals, drawers) without losing the context of the underlying workspace.
- **Precision Engineering:** Sharp execution of an 8px grid system ensures alignment that feels intentional and high-end.
- **Productive Tranquility:** Heavy use of whitespace and soft gray surfaces to reduce cognitive load during long working sessions.

## Colors
This design system employs a **60-30-10** balance to maintain professional focus:
- **60% Base (Neutral/Surface):** Using `#F8FAFC` (Slate-50) for primary canvas surfaces and `#FFFFFF` for elevated cards. This ensures a "high productivity" environment that isn't straining on the eyes.
- **30% Secondary (Deep Navy):** `#0F172A` is used for persistent structural elements like the sidebar and primary headers, providing a grounded, authoritative frame.
- **10% Accent (Professional Indigo):** `#4F46E5` is reserved strictly for primary actions, active states, and critical data points.

**Functional Palettes:**
- **Success:** `#10B981` (Emerald) for positive growth and completed tasks.
- **Warning:** `#F59E0B` (Amber) for pending approvals or threshold alerts.
- **Error:** `#EF4444` (Red) for critical system errors or failed transactions.

## Typography
We use **Geist** exclusively for its technical precision and modern, grotesque-inspired legibility. 
- **Scale:** Headlines utilize tight letter spacing to appear more "designed" and authoritative. 
- **Hierarchy:** Use `label-md` in All-Caps for table headers and small metadata categories to create a clear visual distinction from body text.
- **Monospace:** For technical data points (IDs, Currency, Tokens), use the monospace variant of the font family to ensure character alignment and a "data-rich" feel.

## Layout & Spacing
The design system follows a strict **8px linear scale**.
- **The Bento Grid:** Content is organized into modular containers. On desktop, use a 12-column grid. Bento cards should span 3, 4, 6, or 12 columns depending on information priority.
- **Responsive Behavior:** 
    - **Desktop (1440px+):** Fixed sidebar (280px), fluid main content area with max-width of 1600px.
    - **Tablet (768px - 1439px):** Collapsed sidebar (icon-only), 2-column bento stacking.
    - **Mobile (<767px):** Single column bento stack, 16px horizontal margins, bottom navigation or "hamburger" drawer.
- **Safe Areas:** Maintain a minimum of 24px padding within all Bento cards to ensure a premium, airy feel.

## Elevation & Depth
Depth is used functionally to separate the "Workspace" from "Tools."
- **Layer 0 (Canvas):** `#F8FAFC` — the background.
- **Layer 1 (Bento Cards):** White background, 1px border (`#E2E8F0`), and a very soft, subtle ambient shadow (4px blur, 2% opacity).
- **Layer 2 (Floating UI):** Command Palette, Tooltips. Uses **Glassmorphism** with `backdrop-filter: blur(12px)` and a semi-transparent white fill (80% opacity).
- **Layer 3 (Overlays):** Modals and Drawers. High-contrast shadow with a 20px blur, 10% opacity, and a 1px border. Background dimming should be `#0F172A` at 40% opacity.

## Shapes
The design system uses a **Rounded** shape language to soften the "corporate" feel and make the data more approachable.
- **Standard (8px):** Buttons, Input fields, and small UI elements.
- **Large (16px):** Bento cards and primary container blocks.
- **Extra Large (24px):** Main Modals and App Drawers.
- **Interactive States:** Clickable items should have a visible 2px radius increase or subtle scale-down effect on "active" (tap) states to feel tactile.

## Components
- **Collapsible Sidebar:** Deep Navy (`#0F172A`). Active states use a left-edge Indigo accent line and a subtle background highlight.
- **Command Palette:** Centered, floating glassmorphic bar. Triggered by `Cmd+K`. Includes "Recent Searches" and "Quick Actions."
- **Data Tables:** Borderless rows with subtle hover highlights. Use `label-md` for headers. Sort icons appear only on hover.
- **Bento Analytics Cards:** Must include a "Header" section with a title and a "Context" action (e.g., date range picker or 'Expand' icon).
- **AI Assistant Panels:** Distinguished by a subtle indigo-to-violet gradient border or background glow to signal "Intelligence" features.
- **Lead/Client Cards:** High-density, using Geist Mono for phone numbers and IDs. Progress bars for "Lead Status" should use the functional color palette.
- **Notifications/Toasts:** Positioned top-right. Minimalist icons with high-contrast text. Use the "Floating UI" elevation level.
- **Empty States:** Use monochromatic line art and a single primary action button to guide the user back to the workflow.