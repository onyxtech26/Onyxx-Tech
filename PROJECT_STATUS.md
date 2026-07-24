# Project Status — Onyxx Tech Website

> **Living board.** Read at the start of every session; updated when significant tasks finish. Newest state on top.

**Last updated:** 2026-07-24

---

## 📍 Where I left off
Splash screen redesign, sitewide `loading.lottie` loader, and the sitewide motion layer are **done and verified locally but not committed**. Working tree has `index.html`, `styles.css`, `common.js`, `admin-login.html`, `admin-dashboard.html` modified. Verified in real Chrome over CDP (0 exceptions, all 10 hover effects confirmed, light/dark/reduced-motion checked) — but not yet reviewed by the user in a browser, and not pushed.

**Note the site is now single-page.** `index.html` is the only public page; the 6 other HTML pages were removed in commit `863a208`. Parts of `styles.css` (`.work-item`, `.work-list`) are leftovers from the multi-page era and match nothing.

---

## 🗂️ Board

### ✅ Done
- [x] Set up cross-session project tracking (this system)
- [x] Split single-page `index.html` into 7 static pages (Home + services/why/work/process/founders/contact), shared `styles.css`/`common.js`
- [x] Fixed hero stars vanishing after window resize/maximize (canvas could get stuck blank)
- [x] Fixed hero background flicker (removed `mix-blend-mode` + scale-animated blur)
- [x] Added static SEO fallback content to Services/Work pages (previously JS/Supabase-only, invisible to crawlers)
- [x] Added `sitemap.xml`/`robots.txt`, deferred Supabase script
- [x] Fixed 4 Work-page project images hotlinked from Supabase storage at 5-8MB each (resized/re-encoded to local WebP+JPEG, ~95-99% smaller)
- [x] Added client-side image compression to admin dashboard's showcase/avatar upload flows (prevents the above from recurring)
- [x] Added View Transitions API cross-fade + universal fade-in for page navigation
- [x] Removed animated/blurred glass-orb divs sitewide, replaced with a static CSS gradient wash (then partially reverted — see below)
- [x] Added staggered content-entrance animations (`.reveal-group`) across all 6 non-hero pages; fixed a CSS transition-cascade bug it surfaced on `.why-item`/`.contact-email`
- [x] Restored the animated glass orbs on Home only (user preference), tuned opacity/blur (0.7→0.4 opacity, 45px→80px blur)
- [x] Diagnosed and fixed the Vercel `/index.html` vs `/` canonical URL issue (`vercel.json` redirect, logo link, canonical tags, sitemap)
- [x] Enabled clean URLs sitewide (`/services` instead of `/services.html`) — `vercel.json` `cleanUrls`, every internal link/canonical/OG/sitemap entry updated to match
- [x] Pushed five commits to `origin/main` today: `eb511ef` (multi-page restructure), `a95444b` (animations + glass orbs), `1cd8262` (canonical-URL fix + this tracking system), `85ecf26` (status board tweak), `2147681` (clean URLs)

- [x] **Rebuilt the splash screen** — orbiting logo ring, per-character wordmark reveal, `loading.lottie`, progress rail, staged status, choreographed two-part exit; 1.5s minimum display, dismiss on `load`, 4.5s hard cap, click/Escape to skip
- [x] **`loading.lottie` used sitewide** via a shared helper in `common.js` (splash, services grid, work grid, project-modal image overlay, admin dashboard boot, admin login button) — each with a CSS-ring fallback for when the CDN player doesn't arrive
- [x] **Sitewide motion layer** — one easing/duration vocabulary, hover grammar across every interactive surface, 4 new entrance variants, image fade-in, theme cross-fade; all hovers gated behind `@media (hover: hover)`
- [x] **Fixed `common.js` being silently dead** — top-level `const` collision with `index.html`'s inline script threw a SyntaxError at compile time, so none of it ever ran (magnetic buttons and `initRevealGroup` were doing nothing). Now an IIFE publishing to `window`
- [x] Hero headline rotator replaced with the static line "for modern businesses."

### 🔄 In progress
- (nothing active)

### ⏭️ Next / To do
- **User review of the splash + animations in a real browser**, then commit and push
- **Fix the `Carousel_Maker.png` 404** — a `showcase_projects` row points at `images/Carousel_Maker.png`, which isn't in the repo. Card falls back to the Onyxx logo, but it 404s on every load. Fix the Supabase record or add the image.

### 💤 Backlog / ideas
- Dead CSS from the multi-page era (`.work-item`, `.work-list`, and the `.hero-rotator` remnants that were just removed) could be swept out of `styles.css`
- Consider client-side compression for the admin dashboard's `receipts` upload too (deliberately skipped so far — financial documents, didn't want to risk blurring numbers without the user weighing in)
- Consider whether other pages besides Home should get the animated glass orbs, or stay with the lighter static wash

---

## 🧠 Key decisions & context
- **`common.js` must stay an IIFE.** It and `index.html`'s inline `<script>` are both classic scripts, so their top-level `const`/`let` share one global lexical environment. `common.js` previously declared `observer`, `nav`, `cursorGlow`, `SCRAMBLE_CHARS`… at top level — the same names the inline script uses — so the browser threw `Identifier 'observer' has already been declared` while *compiling* it and none of it ran. Adding a top-level binding back to `common.js` will silently kill the whole file again. Keep the wrapper; publish to `window`.
- **Division of labour after that fix:** `index.html`'s inline script owns page chrome it implements more richly (cursor glow, eased smooth-scroll + active-nav, mobile nav, text scramble, theme toggle, hero galaxy canvas, project modal, Supabase). `common.js` owns cross-cutting behaviour only (Lottie loader, image fades, reveal helpers, magnetic buttons). Duplicating either side double-binds listeners.
- **Never put a bare `transition:` shorthand on an element that can carry `.reveal`** — the shorthand replaces `.reveal`'s opacity/transform entry and the element snaps in instead of fading. Use longhands (`transition-timing-function`, `transition-duration`). Bit us twice now.
- **No build tool, deliberately.** User chose plain duplicated static HTML files over introducing a bundler/static-site-generator, to match the site's existing build-free style. Shared CSS/JS via plain `<link>`/`<script src>` instead (not a "build step").
- **Reduced-motion discovery:** the user's Windows machine had OS-level "Animation effects" turned off, which — via `prefers-reduced-motion: reduce` — suppressed *all* site animation, old and new. This was likely the real root cause of the original "site has no animation" complaint, separate from any code issue.
- **GitHub push requires `git@github.com-company:` SSH alias** for this repo (org-owned by `onyxtech26`), not the user's personal/`kunacosta` key — see `github-ssh-account-mapping.md` in Claude's memory.
- **Domain:** production is `https://onyxx-tech.vercel.app`.
- Site previously had a real hero-flicker bug (mix-blend-mode + scale-animated blur) that an earlier session had incorrectly written off as "the user's display, not the site" — turned out that session's claimed fix was never actually in the repo. Lesson logged in memory: verify actual file state before trusting a prior session's conclusion.

---

## 📝 Session log
- **2026-07-24** — Splash screen redesign + `loading.lottie` wired in sitewide + a sitewide motion/hover layer; removed the hero rotator in favour of the static "for modern businesses."; discovered and fixed that `common.js` had never executed on this site due to a global lexical `const` collision with `index.html`'s inline script. Verified in real Chrome over CDP rather than by inspection. See `docs/CHANGELOG.md` for the full write-up.
- **2026-07-22** — Set up project tracking (CLAUDE.md + PROJECT_STATUS.md + docs/CHANGELOG.md). Also mid-session: full multi-page restructure, several bug fixes, animations, image optimization, and the Vercel canonical-URL fix (see Done list above for the full breakdown — this was one long continuous session).
