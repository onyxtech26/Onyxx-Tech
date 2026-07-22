# Changelog — Onyxx Tech Website

Append-only, dated log of significant completed work. Newest entries on top.
Format each entry: what was done, why it mattered, and any key decisions.

---

## 2026-07-22

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
