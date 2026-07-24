# Changelog — Onyxx Tech Website

Append-only, dated log of significant completed work. Newest entries on top.
Format each entry: what was done, why it mattered, and any key decisions.

---

## 2026-07-24

### Splash screen redesign, sitewide dotLottie loader, and a sitewide motion layer

**Splash screen (rebuilt).** Replaced the previous logo-and-name plate with a
choreographed loading curtain: layered radial background + drifting technical
grid + a slow sweep beam; logo inside a breathing glass disc with a rotating
conic-gradient "orbit" ring; the wordmark rises character-by-character (split
in JS so the HTML stays one readable string); then the `loading.lottie`
animation, a progress rail, and a staged status line. Exit is a two-part move —
the content lifts away fractionally before the curtain scales/blurs/fades.

Timing is now honest and bounded: a 1500 ms minimum on-screen time (so a fast
load doesn't flash a splash for 200 ms, which reads as a glitch), real dismissal
on window `load`, and a 4500 ms hard cap. Click or Escape dismisses immediately.

- **Key decision:** the controller is inline in `index.html` immediately after
  the markup, not in `common.js`. A full-viewport curtain that needs a deferred
  script to leave can hang visible if that script is slow or fails.
- The progress bar eases toward 90% on a timer and only completes on the real
  `load` event — there's no byte-level progress signal for a static page, so it
  tracks elapsed time and is honest at the one moment it claims to be done.
- The splash is `aria-hidden` (it's decorative, over content already in the DOM);
  a sibling `sr-only` live region announces load start/finish once, instead of
  reading four stage labels a user can't influence.

**`loading.lottie` everywhere.** Added a shared loader (`window.lottieLoader()` /
`showLoader()` / `toggleOverlayLoader()` in `common.js`) so every loading state
uses the same animation: the splash, the Supabase-backed services and work grids,
an overlay over the project modal's image while it decodes, the admin dashboard's
boot overlay, and the admin login button's submit state.
- `<dotlottie-player>` is a CDN custom element, so each usage ships a pure-CSS
  ring fallback. `common.js` sets `.lottie-ready` on `<html>` via
  `customElements.whenDefined`; CSS shows exactly one of the two. A blocked CDN
  degrades to a spinner instead of an empty hole. Verified by rendering the
  dashboard with JS disabled.
- A failed Supabase fetch now swaps the loader for a `.grid-empty` message
  rather than spinning forever.

**Sitewide motion layer** (new section at the end of `styles.css`). One easing
vocabulary (`--ease-out-expo`/`--ease-out-soft`/`--ease-spring`, four durations)
applied via `transition-timing-function` longhands; hover grammar for cards
(lift + glow + accent border), thumbnails, service numbers/icons, founder
avatars, process dots, the why-list rule, nav-link underline wipe, tag fills,
CTA arrows and `.project-more`; four new entrance variants (`.reveal-scale`,
`-left`, `-right`, `-blur`) sharing `.reveal`'s `.visible` toggle; image
fade-in via `img[data-fade]`; and a theme cross-fade applied only for the
duration of a toggle.
- **Constraint that shaped it:** never use a bare `transition:` shorthand on an
  element that can also carry `.reveal` — the shorthand replaces `.reveal`'s
  opacity/transform entry and the element snaps in instead of fading. This is
  the same cascade bug logged on 2026-07-22; the new layer only ever sets
  longhands on those elements.
- All hover rules sit inside `@media (hover: hover)` so a tap on a phone doesn't
  leave a card stuck in its hover state.
- `.project-card` gets the glow but not the transform: its JS 3D-tilt handler
  writes an inline `transform` that would override any rule. The lift is folded
  into that tilt string instead.

**Fixed: `common.js` had been silently dead on the site.** It and `index.html`'s
inline script both declare top-level `const observer`, `nav`, `cursorGlow`,
`SCRAMBLE_CHARS`… As classic scripts they share one global lexical environment,
so the browser threw `Identifier 'observer' has already been declared` while
*compiling* `common.js` and none of it ever ran. The duplication of that same
logic inside `index.html` (from the single-page consolidation) is what masked
it — the site looked fine, but magnetic buttons and `initRevealGroup` were doing
nothing. `common.js` is now an IIFE that publishes only to `window`, and holds
just the cross-cutting behaviour `index.html` doesn't already implement inline.

**Hero copy.** The rotating headline ("modern businesses." / "ambitious teams." /
"bold founders." / "what comes next.") is now the static line "for modern
businesses." — rotator markup, JS interval and CSS all removed.

**Verification.** Driven in real Chrome over CDP: 0 page exceptions, splash
dismisses, 5 service + 6 project cards render, 0 stuck loaders, 25 reveals fire,
7 magnetic buttons bind, and all 10 hover effects confirmed by dispatching real
mouse events and diffing computed styles. Checked in light and dark theme, and
under `prefers-reduced-motion: reduce` (nothing stays hidden, magnetism off,
smooth scroll off, splash still dismisses).

**Known pre-existing issue (not addressed):** a `showcase_projects` record points
at `images/Carousel_Maker.png`, which isn't in the repo — a 404 on every load.
The card falls back to the Onyxx logo. Needs a fix in Supabase or the image added.

---

## 2026-07-22

### Enabled clean URLs sitewide
- Enabled Vercel's `cleanUrls` in `vercel.json` so pages resolve at `/services` instead of `/services.html`. Updated every internal link (nav, hero CTAs, the work-page modal's CTA) across all 7 pages, plus canonical/OG/Twitter URLs and `sitemap.xml`, to the extensionless form. Vercel auto-redirects the old `.html` paths, so existing links/bookmarks still resolve. Actual filenames on disk are unchanged.
- **Why:** the user felt `.html` in the address bar looked unpolished/unfinished compared to other professional sites — a reasonable read, since clean URLs are the more common convention on modern marketing sites.
- Verified locally against a small Python server hand-rigged to mimic Vercel's clean-URL resolution (no Vercel CLI installed on this machine) — extensionless paths, canonical tags, and console all checked out before pushing.

### Set up project tracking
- Scaffolded CLAUDE.md, PROJECT_STATUS.md, and this changelog so sessions have continuity and big tasks get documented.
- **Why:** so work is never lost between sessions and completed milestones are remembered.

### Fixed Vercel canonical-URL issue (`/index.html` vs `/`)
- Added `vercel.json` with a permanent redirect from `/index.html` to `/`; pointed the nav logo link at `/` (was `index.html`) on all 7 pages; added real `<link rel="canonical">` and absolute `og:url`/`og:image`/`twitter:image` tags now that the production domain (`onyxx-tech.vercel.app`) is known; updated `sitemap.xml` to match.
- **Why:** clicking the nav logo always landed on `/index.html` instead of the clean root, so the same content was reachable at two URLs — bad for SEO (duplicate content) and for sharing clean links.

### Staggered content-entrance animations + restored Home glass orbs
- Added a `.reveal-group` mechanism (`common.js` + `styles.css`) that staggers a container's direct children into a one-after-another fade+rise instead of a flat all-at-once fade. Applied across all 6 non-hero pages.
- Fixed a CSS cascade bug this surfaced: `.why-item` and `.contact-email` each had their own `transition:` shorthand for hover effects, which silently overrode `.reveal`'s fade transition (a `transition:` shorthand fully replaces an earlier same-specificity rule's transition-property list rather than merging with it). Both now list their own property alongside opacity/transform.
- Restored the animated glass-orb background on Home only (removed in an earlier pass in favor of a static gradient, then brought back at the user's request) using the already-hardened parameters from the flicker fix — no `mix-blend-mode`, translate-only animation — with opacity/blur tuned further (0.7→0.4 opacity, 45px→80px blur) for a softer look.
- **Key discovery:** the user's Windows machine had OS-level animation effects disabled, which — via `prefers-reduced-motion` — was suppressing all site animation (old and new) regardless of code. Likely the real root cause of the original "site has no animation" complaint.

### Multi-page restructure + bug fixes + image weight
- Split the single-page `index.html` (2840 lines) into 7 static pages (Home + services/why/work/process/founders/contact), with shared `styles.css`/`common.js` (no build tool — plain `<link>`/`<script src>`).
- Services/Work pages now ship real static fallback content (previously JS/Supabase-only, invisible to crawlers and no-JS visitors); Supabase still enhances/replaces it live.
- Fixed hero stars vanishing after a window resize/maximize (canvas could get stuck blank if the animation loop paused mid-resize).
- Fixed the hero background flicker: removed `mix-blend-mode` and a `scale()`-animated blur from the cursor glow/hero logo/orbs.
- Fixed 4 Work-page project images that were hotlinked from Supabase storage at full screenshot resolution (5-8MB each, ~22MB combined) — resized/re-encoded to local WebP+JPEG pairs, ~95-99% smaller. Added client-side image compression (`compressImageFile()`) to the admin dashboard's showcase/avatar upload flows so future uploads don't regress this.
- Added `sitemap.xml`/`robots.txt`, deferred the Supabase script so it doesn't block first paint, added a View Transitions API cross-fade + universal fade-in for page navigation.
- **Why:** the user wanted real per-page URLs/SEO metadata instead of a single scrolling page, plus the site had several concrete bugs (stars, flicker, slow image loads) reported directly.
- **Key decision:** no build tooling introduced — the user explicitly chose plain duplicated static HTML files over a bundler/SSG, to match the site's existing build-free style.
