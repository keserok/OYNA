# design-sync notes — OYNA

The synced design system is a **curated subset** of the app's presentational,
store-independent components — NOT the whole app. It is built from the current
feature branch (which fully contains `main` + the finalization work). Old static
HTML prototypes under `design/player-onboarding/` are deliberately excluded.

## Shape & wiring
- **Package shape**, but the repo is an *application* with no library `dist/`/`.d.ts`.
  Components are pulled in explicitly via `componentSrcMap`, and esbuild bundles from
  a hand-written entry that re-exports only the scoped components.
- Bundle entry: `.design-sync/ds-entry.tsx` — passed with `--entry`. Adding a
  component to the DS = add its export here AND to `componentSrcMap`.
- `globalName` = `OynaDS` (previews import from `'oyna-app'`, rewired to `window.OynaDS`).

## Build command (must run BEFORE package-build / resync)
The DS styling is **Tailwind v4**, so `cfg.cssEntry` must point at COMPILED CSS.
Recompile it before every build:
```
npx @tailwindcss/cli@4.2.1 -i .design-sync/tw-entry.css -o .design-sync/.cache/compiled.css --minify
```
`tw-entry.css` imports the app's own `index.css` (tokens in `@theme`, brand utilities,
animations) and additionally `@source`s `.design-sync/previews/**` so preview-only
classes compile. It also re-declares the brand tokens in `:root` (the app styles with
literal hex like `bg-[#39FF14]`, so Tailwind tree-shakes the `@theme` color tokens),
drops the unused serif/mono `@theme` families (kills a `[FONT_MISSING] Cambria` warn),
and defines two preview-helper classes (see below).

Full build:
```
node .ds-sync/package-build.mjs --config .design-sync/config.json \
  --node-modules /home/user/OYNA/node_modules --entry .design-sync/ds-entry.tsx --out ./ds-bundle
node .ds-sync/package-validate.mjs ./ds-bundle          # add DS_CHROMIUM_PATH (below)
```

## Fonts
Inter is self-hosted (variable, latin + latin-ext for Turkish glyphs) from
`.design-sync/assets/` via `cfg.extraFonts`. The app loads Inter from Google Fonts
via a `<link>` in index.html which never reaches a rendered design, so shipping it
keeps designs on-brand. Space Grotesk is loaded by the app but unused by the scoped
components, so it is not shipped.

## Render/capture browser (chromium version mismatch)
Installed playwright (1.61) pins chromium 1228, but the cache only has 1194. Set
`DS_CHROMIUM_PATH` on every validate/capture/resync run:
```
DS_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
```

## Preview authoring rules (IMPORTANT — components are dark-theme)
Every component is designed for the dark brand background (`#0A0E14`); the preview
card renders on white, so components MUST sit on a dark surface wrapper or they look
invisible (glass fills, white text). Two hard-won capture gotchas, both solved by
preview-helper classes defined in `tw-entry.css`:

1. **Frozen clock** — `package-capture.mjs` calls `page.clock.setFixedTime`, which
   stalls framer-motion enter animations (`initial:{opacity:0}`) at opacity 0, leaving
   components invisible. Fix: put `className="ds-preview"` on the wrapper — the CSS rule
   `.ds-preview [style*="opacity"]{opacity:1!important}` forces descendants opaque.
   (No scoped component uses intentional inline opacity for decoration.)

2. **Fixed/overlay positioning** — Toast and BottomNav render `position:fixed` with
   `-translate-x-1/2`. Two traps: (a) Tailwind v4 does translate via the `--tw-translate-x`
   custom prop on the `translate` CSS property, which `transform:none` does NOT reset,
   and the CSS minifier merges a plain `translate:none` reset into `transform` and drops
   it — so `.ds-flatten` zeroes `--tw-translate-x/y`, `--tw-scale-x/y`, `--tw-rotate`
   directly; (b) an ancestor `.ds-single` wrapper has a transform (containing block).
   Fix: add `className="ds-flatten"` (alongside `ds-preview`) on the wrapper of any
   fixed/overlay component — it forces children in-flow (position:relative, inset:auto,
   margin auto, translate/scale/rotate zeroed).

Standard preview wrapper:
```tsx
const Surface = ({children}) => (
  <div className="ds-preview" style={{background:'#0A0E14', padding:24, borderRadius:20,
    display:'flex', flexWrap:'wrap', gap:14, alignItems:'center', justifyContent:'center'}}>
    {children}
  </div>
);
```
Other conventions: use realistic Turkish content (never foo/test); use a self-contained
data-URI silhouette for avatar/photo props (no external image host in the render sandbox);
cast complex data props with `as any` (esbuild strips types, so it's fine and avoids
importing app types).

## Groups
Semantic groups are set via frontmatter-`category` stubs in `.design-sync/groups/`,
mapped by `cfg.docsMap`. Note: `category` only overrides a *generic* source-derived
group, so components under real folders keep their folder name (MarketplaceCard→marketplace,
Toast/States/PageLayout→common, LocationBadge→location). This is acceptable and honest.

## Known render warns / limitations (triaged, not new)
- **FifaCard / PlayerCard** hard-code an external Turkish flag image
  (`https://flagcdn.com/w40/tr.png`). It does not load in the render sandbox and
  shows as a tiny broken-image glyph on each card. This lives in the app component
  source (out of DS-tooling scope to edit) and loads fine in the real product. It is
  the same external-image-host limitation that drove using data-URI avatars. Accepted.

## Re-sync risks (what can silently go stale)
- **cssEntry is gitignored** (`.design-sync/.cache/compiled.css`). On a fresh clone it
  must be recompiled (build command above) before package-build, or the bundle ships
  with no styling. `cfg.buildCmd`-style step is manual here.
- **Preview data is inlined** (mock players/goalkeepers/locations cast `as any`). If a
  component's required props change, its preview may silently render wrong — re-grade
  from the sheet after any component API change.
- **Avatars are data-URI silhouettes**, not real photos — intentional, self-contained.
- Fonts are self-hosted from a pinned `@fontsource-variable/inter`; if the app changes
  its brand font, update `.design-sync/assets/`.
- The scoped component list is curated by hand; new presentational components added to
  the app are NOT auto-included — add them to `ds-entry.tsx` + `componentSrcMap`.
