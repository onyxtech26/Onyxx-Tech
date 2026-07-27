# Project Status — Onyxx Tech Website

> **Living board.** Read at the start of every session; updated when significant tasks finish. Newest state on top.

**Last updated:** 2026-07-26

---

## 📍 Where I left off
**The site is multi-page again (7 pages), gridlines are gone, and the text animations work. Done and verified locally, NOT committed.**

Working tree: `index.html`, `styles.css`, `common.js`, `sitemap.xml` modified; `services.html`, `why.html`, `work.html`, `process.html`, `founders.html`, `contact.html` added; this board, `CLAUDE.md` and `docs/CHANGELOG.md` updated. Yesterday's splash rebuild is also still uncommitted and rides along.

Three things landed together:
1. **`.grid-bg` removed** sitewide. Interior pages get the galaxy instead, dialled down.
2. **The lost text animation restored and actually made visible.** Two bugs: the headline's per-line reveal had been deleted in `e9dc5d3`, *and* `.splash-done` was set by JS but used by no CSS rule — so all hero entrance animations were playing behind the 2.7s curtain and finishing before anyone saw them. Both fixed; the per-line rise is now a reusable `.lines` component used on every page.
3. **Seven pages** (`/`, `/services`, `/why`, `/work`, `/process`, `/founders`, `/contact`), matching the pre-`863a208` set but regenerated from the current sections. Home is a hub with teasers, not a copy of the whole site.

Plus: one galaxy renderer for the whole site (`window.onyxGalaxy`), `common.js` now owns all site chrome and loads **without `defer`**, splash is home-only and plays on **every** load, structured footer, nav state keyed to `aria-current`.

Verified in Chrome via Playwright: 7 pages × dark/light with zero errors, 28 page/viewport combinations with no overflow, reduced motion, splash session policy, nav reachability at 1440 and 390px, and the headline measured rising line-by-line *after* the curtain. **Not yet reviewed by the user in a live browser, and not pushed.**

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

- [x] **Splash screen rebuilt around the brand mark + the hero galaxy** (2026-07-25) — traced `onyxx_logo_transparent.png` to vector (IoU 0.96), partitioned into three fill-correct subpath groups, `pathLength="100"` driven draw-on; six node vias ignite in pairs; own galaxy canvas with the hero's spiral core at 78%/32% for a seamless handoff; progress rail + staged status + splash Lottie all removed; wordmark corrected to the banner lockup. Full write-up in `docs/CHANGELOG.md`.

- [x] **Removed the `.grid-bg` gridlines** sitewide, plus the dead `.work-item`/`.work-list` CSS from the first multi-page era (2026-07-26)
- [x] **Restored the per-line text reveal and made the hero entrance visible** — it was deleted in `e9dc5d3`, *and* `.splash-done` was styled by nothing so the whole entrance ran behind the curtain. Now a reusable `.lines` component (2026-07-26)
- [x] **Rebuilt the site as 7 pages** with page headers, per-page Supabase fetching, a hub homepage, structured footer, `aria-current` nav state and `view-transition-name` on the logo (2026-07-26)
- [x] **Unified the two galaxy implementations** into `window.onyxGalaxy()`; `common.js` now owns all site chrome and loads without `defer` (2026-07-26)
- [x] **Splash scoped to home** — initially once per session, then changed at the user's request to play on **every** homepage load (2026-07-26)

### 🔄 In progress
- (nothing active)

- [x] **Admin portal rebuilt** — corrected partner accounting, arbitrary installments replacing the fixed deposit/final pair, add-ons, quotations, Payments + Quotations tabs, and one `computeFinancials()` replacing nine independent sums (2026-07-26)
- [x] **`supabase_migration_02_financials.sql` applied to production** — financial data cleared for re-entry, three new tables created, `partner_withdrawals` + `system_settings` closed to anon, old payment columns dropped (2026-07-26)

### ⏭️ Next / To do
- **Re-enter the financial data** in the admin tool — 3 projects and 10 expenses were intentionally cleared so they could be re-keyed against the new model. Backups were exported to a local text file before the wipe.
- **Verify the accounting against real numbers** once a project with installments and an expense or two are in: the Partners tab reconciliation row should read "Balanced".
- **Receipts bucket is still public.** To close it: store the object path in `expenses.invoice_link` instead of the public URL, read via `createSignedUrl` (copy `openQuotationFile()`), convert existing rows, then flip the bucket. Not urgent, but it is financial paperwork on a guessable URL.
- **Optional: reconnect the Supabase connector** to the account owning `whjstsgtximknicppllt`, or transfer that project into the "Onyx Tech" org — the connector is authorised for that org but the project lives elsewhere, so migrations currently have to be pasted by hand.
- **User review in a real browser**, then commit and push. Untracked files need adding: `services.html`, `why.html`, `work.html`, `process.html`, `founders.html`, `contact.html`
- **Re-check the Supabase `services` count**: `/services` renders 5 cards but the copy on both the homepage teaser and the services page still says "Four disciplines." Either the table has an extra row or the heading needs updating.

### 💤 Backlog / ideas
- Dead CSS from the multi-page era (`.work-item`, `.work-list`, and the `.hero-rotator` remnants that were just removed) could be swept out of `styles.css`
- Consider client-side compression for the admin dashboard's `receipts` upload too (deliberately skipped so far — financial documents, didn't want to risk blurring numbers without the user weighing in)
- Consider whether other pages besides Home should get the animated glass orbs, or stay with the lighter static wash

---

## 🧠 Key decisions & context
- **Partner accounting: `balance(P) = 0.5 × (collected − expenses) + paid(P) − withdrawn(P)`.** One shared business account; every expense is fronted by a partner personally, so each one creates a reimbursement. **Do not "simplify" this by adding the settlement column to the profit share** — the profit share already carries −½E and settlement carries another −½E, so the sum deducts expenses 1.5×. That exact mistake is what left the original code broken. `computeFinancials()` in `admin-dashboard.html` is the only place money is derived; everything else reads `fin`.
- **The reconciliation row is a real invariant, not decoration.** `balance(A) + balance(B)` must equal `collected − withdrawn`. It only breaks on bad input (an expense with no `paid_by`), which is exactly when you want to be told.
- **`HTTP 200` from PostgREST does NOT mean a table is public.** RLS filtering returns 200 with a row count of 0; only a missing table errors. Judge exposure by the **row count**, never the status code — misreading this produced a false "your financials are public" alarm. `probe_rls.py` in the session scratchpad now checks counts.
- **`receipts` bucket is public on purpose (for now).** Receipt URLs are stored in `expenses.invoice_link` via `getPublicUrl()`, so making the bucket private breaks every existing link. Fixing it = store the object path + sign on click + convert existing rows. `quotations` is private and uses signed URLs, which is the pattern to copy.
- **`common.js` loads WITHOUT `defer`, in `<head>`.** The inline splash controller needs `window.onyxGalaxy` the moment it runs, and a deferred file wouldn't exist yet. Nothing in `common.js` touches the DOM at parse time — all of it is behind `init()` on DOMContentLoaded. It still **must stay an IIFE** (see below).
- **The splash plays on ARRIVAL and on RELOAD, not on internal navigation back to home.** Settled after two iterations, so don't change it without asking. `index.html`'s `<head>` computes `isReload || firstVisit`:
  - first load of the session → show; F5 on `/` → show (every time)
  - clicking Home from another page, or the back button → skip
  - A reload and a first arrival are both navigationType `navigate`, so **neither the nav type nor the session flag alone is sufficient** — it needs both. Interior pages have no splash markup and set `.splash-done` in their own `<head>`.
  - `data-splash="skip"` remains the manual off-switch.
- **`.splash-done` on `<html>` is the site's "the visitor can see the page now" signal.** Anything that shouldn't animate behind the curtain hangs off it. Pages with no splash set it in their `<head>` bootstrap; `index.html` sets it when the curtain starts lifting. **Never put a hero entrance animation on a plain page-load delay again** — that was the bug where the entire hero entrance played invisibly behind a 2.7s splash.
- **One galaxy renderer, three intensities.** `window.onyxGalaxy(canvas, opts)`. The default core position (78%/32%) is shared by the splash and the hero and is what makes the curtain lift seamless — don't change it for one caller only. Use `setTransform`, never `scale()`, when sizing: `scale()` compounds per resize and leaves the canvas blank after a maximise.
- **Nav active state is `[aria-current="page"]`, not a `.active` class.** Real URLs mean the current page is a fact in the markup; keying the visuals off the accessibility attribute keeps one source of truth. Watch for duplicate `::after` rules later in `styles.css` overriding the canonical one — that already bit once.
- **The hidden admin entry is a double-click on the FOOTER brand mark, not the nav logo.** The nav logo is a real link to `/`, so the first click of a double-click navigates and destroys the page before the second lands. Intercepting the click and delaying navigation only works for double-clicks faster than the delay (250ms still lost a 320ms double-click), and covering the OS default ~500ms would put half a second of lag on the primary home link on every page. The footer mark is an `<img>` with no navigation, so the gesture is instant and reliable at any speed. `/admin-login` is always the direct route.
- **Testing a double-click needs `mouse.down/up` with an explicit `click_count`.** `page.dblclick()` fires both clicks in one burst fast enough to beat the navigation, so it passes against broken code; two `page.mouse.click()` calls hard-code `clickCount: 1`, so `event.detail` never reaches 2 and it fails against working code. Both gave wrong answers here.
- **Contact needs two nav entries.** `.nav-email` is `display: none` under 768px, so there's also a drawer-only `<li class="nav-link-contact">`. Removing it leaves Contact unreachable from the mobile nav.
- **The `.lines` component is the site's text motion.** `.lines-immediate` plays on `splash-done` (hero); plain `.lines` plays on scroll via `.lines-in`. Reduced motion needs the explicit `transform: none` override — a line starts at `translateY(110%)`, fully outside its clip, so a merely-zeroed duration can leave text invisible.
- **Splash `MIN_MS` (2700), `HARD_CAP_MS` (5600) and the CSS entrance (~2.60s) are coupled.** The minimum display time sits just past where the choreography resolves, so the curtain can never pull back mid-draw; the hard cap must stay clear of `MIN_MS` + the entrance or a slow load gets cut off by the cap instead of by `load`. Every duration/delay in the splash CSS block is one 1.6×-scaled vocabulary — retiming means scaling them together, then moving both constants.
- **The splash's three subpath groups are split for *fill correctness*, not visual grouping.** Every hole must sit inside its own group's outer contour. The two right-hand node vias belong to the X, not to the trace network — grouping all six vias together makes those two render as solid discs. Same three paths then serve the stroke pass, the fill and the sweep clip.
- **The splash galaxy must stay at `opacity: 0.85` and keep its core at 78%/32%** to match `.circuit-canvas`. Those two values are what make the curtain lift read as one continuous sky instead of a cut between two backgrounds.
- **Never give `#splashScreen` an entrance opacity animation.** It's a curtain over content already in the DOM, so anything below opacity 1 shows the hero bleeding through on the first frames. Bit us once already.
- **Testing the splash:** pause `document.getAnimations()` and set `currentTime` to seek. Playwright's `screenshot(animations="disabled")` fast-forwards CSS animations to their end state and silently defeats the seek — use `animations="allow"`. Filtering `setTimeout` by delay won't hold the splash open either: when `load` lands after `MIN_MS`, the remaining delay is `0`.
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
- **2026-07-26 (admin portal)** — Rebuilt the admin financials: fixed the partner-balance bug (the expense settlement was computed then discarded, so a partner who fronted costs was never credited), replaced the two fixed payment slots with arbitrary installments, added add-ons and quotations, and collapsed nine independent money sums into one `computeFinancials()`. Applied `supabase_migration_02_financials.sql` to production; financial data cleared for re-entry at the user's request. **Also corrected a wrong security finding of my own**: `projects`/`expenses` were never publicly readable — `HTTP 200 + 0 rows` from PostgREST means RLS filtered everything, not that the table is open. Only `partner_withdrawals` and `system_settings` were actually exposed, and both are now closed.
- **2026-07-26 (later)** — Restored the hero rotator ("modern businesses." → "ambitious teams." → "bold founders." → "what comes next.") that `e9dc5d3` had replaced with a static line; rebuilt on `inline-grid` so it no longer needs a hardcoded `min-width`. Fixed the homepage project teasers showing default blue underlined link text — `.project-card--link` was applied by JS and never styled. Fixed the cursor glow being offset 283px from the pointer: a 400px circle positioned by `left`/`top` with no centring transform, so its top-left corner tracked the cursor. Bug had been present since `eb511ef`. Also moved it onto a transform (was forcing a layout every frame) and made the rAF loop idle when the pointer is still. Changed the splash from once-per-session to playing on every homepage load, at the user's request. Also rewrote the headline animation check to sample in-page on rAF: the CDP-round-trip version cost ~700ms per sample, skipped the window where the stagger is visible, and reported a false failure on a working animation.
- **2026-07-26** — Removed the gridlines; found and fixed why the text animations had "disappeared" (deleted headline rule **and** an unused `.splash-done` hook that meant the whole hero entrance played behind the curtain); rebuilt the site as 7 pages with page headers and a hub homepage; unified the two galaxy implementations into `common.js` and moved all site chrome there; scoped the splash to home/once-per-session; structured footer, `aria-current` nav state, logo view-transition. Caught in review: Contact had no mobile nav entry point once it became its own page. Full write-up in `docs/CHANGELOG.md`.
- **2026-07-25** — Rebuilt the splash screen around the brand mark and the hero galaxy (see Done + CHANGELOG). Traced the logo PNG to vector to make the mark draw itself. Removed the progress rail, the staged status line and the splash's Lottie; corrected the wordmark from Fraunces "ONYXX TECH HUB" to the real banner lockup. Also fixed a curtain fade-in that let the hero show through on first paint. Verified frame-by-frame in Chrome via Playwright. Housekeeping: this board was stale — it listed the 2026-07-24 splash work as uncommitted when it had in fact landed as `e9dc5d3`, and listed a `Carousel_Maker.png` 404 that is already fixed (the file is in `images/`).
- **2026-07-24** — Splash screen redesign + `loading.lottie` wired in sitewide + a sitewide motion/hover layer; removed the hero rotator in favour of the static "for modern businesses."; discovered and fixed that `common.js` had never executed on this site due to a global lexical `const` collision with `index.html`'s inline script. Verified in real Chrome over CDP rather than by inspection. See `docs/CHANGELOG.md` for the full write-up.
- **2026-07-22** — Set up project tracking (CLAUDE.md + PROJECT_STATUS.md + docs/CHANGELOG.md). Also mid-session: full multi-page restructure, several bug fixes, animations, image optimization, and the Vercel canonical-URL fix (see Done list above for the full breakdown — this was one long continuous session).
