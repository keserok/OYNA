# OYNA Design System — how to build with it

OYNA is a **mobile-first, dark, "glassmorphism + neon" design system** for a Turkish
football / pitch-booking app. Everything is designed for a dark canvas with a single
neon-green accent. Build screens the way the components expect and they look on-brand.

## Setup & canvas
- **Always render on the dark app background.** The components use translucent
  glass fills and light text; they are invisible on white. Wrap every screen in the
  brand background: `background: var(--color-bg-main)` (`#0A0E14`), or the utility
  `bg-[#0A0E14]`. There is **no provider to mount** — components are self-contained;
  just import them and place them on a dark surface.
- The bundle ships the fonts and tokens. Text defaults to **Inter**.
- `PageLayout` is the standard screen shell (dark bg, sticky header with title/back,
  safe-area padding, scrollable body). Reach for it as the outer container of a screen.

## Styling idiom — Tailwind v4 utilities with brand tokens
This DS styles with **Tailwind v4 utility classes**, frequently using arbitrary values
for the exact brand palette. Match that idiom for your own layout glue.

- **Brand tokens** (CSS variables, available everywhere):
  `--color-primary` `#39FF14` (neon green accent — CTAs, active states, highlights),
  `--color-primary-dark` `#1CB500`, `--color-primary-light` `#70FF56`,
  `--color-bg-main` `#0A0E14` (app background), `--color-bg-card` (glass card fill),
  `--color-text-main` `#FFFFFF`, `--color-text-muted` `#8B949E`,
  and semantic states `--color-error` `#FF4D4D`, `--color-warning` `#FFAA00`,
  `--color-success` `#00E676`, `--color-info` `#00B0FF`.
- **Common utility families the DS uses** (real classes from the components — reuse them):
  - Surfaces: `bg-[#0A0E14]`, `bg-[#161B22]/80`, `backdrop-blur-md`, `backdrop-blur-xl`,
    `border border-white/5`, `border-white/10`, `rounded-2xl`, `rounded-[24px]`,
    `shadow-[0_8px_32px_rgba(0,0,0,0.4)]`.
  - Accent: `text-[#39FF14]`, `bg-[#39FF14]/10`, `border-[#39FF14]/40`.
  - Text: `text-white`, `text-gray-400`, `font-black`, `font-bold`, `uppercase`,
    `tracking-wide`, `tracking-widest`, `italic`.
  - Named brand effects (defined in the stylesheet): `.premium-glass-card`,
    `.button-neon-glow-green`, `.card-lift`, `.mesh-bg` (animated background blobs).
- **Animation** is done with `framer-motion` (motion components, whileHover/whileTap,
  enter animations). Prefer subtle scale/opacity motion, matching the components.

## Where the truth lives
- Read `styles.css` and its `@import` closure (tokens + `_ds_bundle.css`) for the exact
  tokens and brand utility classes before styling.
- Each component has a `<Name>.d.ts` (its prop contract) and a `<Name>.prompt.md`
  (usage). Read those before composing a component.

## Components (by group)
- **Buttons:** `NeonButton` (variant primary/secondary/danger/ghost, size sm/md/lg,
  loading, fullWidth), `AnimatedButton` (ripple + haptic, same variants + size custom).
- **Cards:** `GlassCard` (glass container, optional `glow` hex, optional `onClick`),
  `FifaCard` (FUT-style rated player card), `PlayerCard` (holographic gold/silver/bronze
  tier card), `MarketplaceCard` (goalkeeper/referee listing row).
- **Layout:** `PageLayout` (screen shell). **Navigation:** `BottomNav` (fixed tab bar).
- **Feedback:** `Toast` (success/error), `LoadingState`, `ErrorState`, `EmptyState`.
- **Location:** `LocationBadge` (active-region chip). **Brand:** `OynaLogo`.

## One idiomatic example
```tsx
// A dark screen using DS components + the DS's own Tailwind idiom for layout glue.
<div className="min-h-screen bg-[#0A0E14] p-4 flex flex-col gap-4">
  <h1 className="text-white font-black text-xl tracking-tight">Yaklaşan Maçlar</h1>
  <GlassCard glow="#39FF14" className="p-4">
    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Bu Akşam</p>
    <p className="text-white font-black text-lg">Kadıköy Halı Saha · 21:00</p>
    <NeonButton variant="primary" fullWidth className="mt-3">Maça Katıl</NeonButton>
  </GlassCard>
</div>
```
