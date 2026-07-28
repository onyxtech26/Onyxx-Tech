# Project Status — Onyxx Tech Website

> **Living board.** Read at the start of every session; updated when significant tasks finish. Newest state on top.

**Last updated:** 2026-07-28

---

## 📍 Where I left off

**All work is committed and pushed** — `main` is at `8431366`. Everything through 2026-07-26 went up in `da983fe`; a four-agent audit followed, and its findings, the expense-rule change and the audit backlog are in `0d3d681`, `6607fbd`, `acea598`, `bb7199d`, `908b9fc` and `8431366`.

**Two migrations are written but NOT run:** `03_admin_allowlist` (needs Rooben's email filled in first) and `04_integrity`. Both are in "Next / To do" with the order they need.

**⚠️ THE ACCOUNTING RULE CHANGED — read this before looking at any figure.**
Expenses are now split by **who the purchase was for** (`expenses.scope`):

- **company** — cost shared 50/50, payer reimbursed from the account
- **personal** — carried entirely by the buyer, never reimbursed, other partner untouched

```
pool       = collected − SST − companyExpenses
share(P)   = pct(P) × pool
balance(P) = share(P) + reimbursable(P) − withdrawn(P)
```

`reimbursable(P)` counts **only company** expenses. Personal spending's absence from that line is what puts the cost on the buyer. Collected RM10,000, Kunacosta buys a RM1,000 company laptop and RM300 of headphones for himself:

| | Kunacosta | Rooben |
|---|---|---|
| Share of pool (9,000) | 4,500 | 4,500 |
| Owed back | 1,000 | 0 |
| **Balance** | **5,500** | **4,500** |
| Spent on self | 300 | 0 |
| **Net position** | **4,200** | **4,500** |

Gap in net = RM300, the headphones. Laptop cost RM500 each.

**A higher Balance is not a bug** — it means the account owes that partner for something they fronted. *Net Position* is the column that says who is ahead, and it subtracts **everything** they paid out of pocket, company and personal. (Subtracting only the personal part was a bug the tests caught.)

**If a personal item is bought with company money, log it as a withdrawal, not an expense** — otherwise it understates what that partner has taken.

`netProfit` remains `collected − SST − expenses` as a **reporting figure only** — never wire it into `share()`.

**Closed a live exposure:** production was serving `/supabase_migration.sql` (full schema + every RLS policy), `/PROJECT_STATUS.md`, `/CLAUDE.md` and `/docs/CHANGELOG.md` as public static assets — no build step means every tracked file becomes a URL. Added `.vercelignore`; all four now return 404, verified against the live domain.

**A password-reset flow now exists** (`admin-reset.html`) — there was none at all before. It needs one Supabase setting to work: `admin-reset` listed under Redirect URLs, and it must be the **only** target, because supabase-js exchanges a recovery token for a session on whatever page it lands on.

**Seven things worth remembering:**
- `escArg()` was written backwards and provided *no* protection — HTML-escaping before JS-escaping means `'` becomes `&#39;`, which the browser decodes back to a live quote before the JS parser sees the attribute. Confirmed by execution, not by reading.
- Writing U+2028/U+2029 *literally* into a regex is a SyntaxError — they are line terminators to the JS parser. Must be `\u` escapes.
- The reconciliation invariant cannot detect several classes of corruption, because both sides move together. A cascade-deleted project, a duplicated expense, and a totally failed load all still read "Balanced". Anything relying on it for safety needs a separate check.
- **RLS denial is HTTP 200 with zero rows, not an error.** Judge exposure by row count. This is also why a non-admin session used to render a confident all-zeroes dashboard.
- **`revenueByMonth()` returns sorted `[month, amount]` pairs, not an object.** Indexing it by month name silently yields `undefined`.
- **Check a class or element exists before writing code against it.** Two separate slips this session: CSS rules for `.filter-bar` / `.modal` / `.badge` that matched nothing, and `openQuotationForm` written against a `quotationModal` that does not exist. Both were invisible until something rendered.
- **Playwright tests must abort `*.supabase.co` at the network layer.** Stubbing `window.supabaseClient` does NOT work — the page holds it as a script-scoped `const`, so the assignment creates a separate binding and the real client is still used. One run reached production this way.

**The blocking items in "Next / To do" need the account owner** — they are Supabase dashboard settings I cannot change.

---

## 📍 Previously
**The site is multi-page again (7 pages), gridlines are gone, and the text animations work.** *(All of this shipped in `da983fe` on 2026-07-28 — the "NOT committed" note that used to be here is out of date.)*

Three things landed together:
1. **`.grid-bg` removed** sitewide. Interior pages get the galaxy instead, dialled down.
2. **The lost text animation restored and actually made visible.** Two bugs: the headline's per-line reveal had been deleted in `e9dc5d3`, *and* `.splash-done` was set by JS but used by no CSS rule — so all hero entrance animations were playing behind the 2.7s curtain and finishing before anyone saw them. Both fixed; the per-line rise is now a reusable `.lines` component used on every page.
3. **Seven pages** (`/`, `/services`, `/why`, `/work`, `/process`, `/founders`, `/contact`), matching the pre-`863a208` set but regenerated from the current sections. Home is a hub with teasers, not a copy of the whole site.

Plus: one galaxy renderer for the whole site (`window.onyxGalaxy`), `common.js` now owns all site chrome and loads **without `defer`**, splash is home-only and plays on **every** load, structured footer, nav state keyed to `aria-current`.

Verified in Chrome via Playwright: 7 pages × dark/light with zero errors, 28 page/viewport combinations with no overflow, reduced motion, splash session policy, nav reachability at 1440 and 390px, and the headline measured rising line-by-line *after* the curtain.

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

- [x] **Four-agent audit of the whole system** — admin CSS/visual, admin JS/business logic, public site, and data layer/auth, run in parallel and reported rather than applied so fixes stayed under one hand (2026-07-28)
- [x] **Closed the live file exposure** — added `.vercelignore`; `/supabase_migration.sql`, `/PROJECT_STATUS.md`, `/CLAUDE.md` and `/docs/CHANGELOG.md` were all returning 200 in production and now 404 (2026-07-28)
- [x] **Fixed the reported invisible icons** — no `color-scheme` was declared, so Chrome painted native control chrome (date glyph, spinners, select arrows, scrollbars) for a light UI on a dark background (2026-07-28)
- [x] **`escArg()` rewritten** — it was backwards and provided no protection at all; then applied to ~30 lines, 17 inline-handler arguments and both `file_url` sinks (2026-07-28)
- [x] **`/work` cut from 28.2MB to ~520KB** — `LOCAL_IMAGE_MAP` had drifted; rebuilt against the live rows, 9 of 10 now local `.webp` (2026-07-28)
- [x] **Accessibility** — `/work` cards were mouse-only `<div>`s and are now `<button>`s; the closed project modal and mobile nav drawer both kept their controls in the tab order and got `visibility: hidden` (2026-07-28)
- [x] **Nine money/reliability fixes** — cascade disclosure on project delete, submit guards on eight handlers, local-time dates with an editable `received_date`, SST held as `sstReserved` instead of split as profit, expense notes no longer wiped, load failures surfaced, detail panels no longer collapse, dashboard gated on `is_admin` (2026-07-28)
- [x] **Expense rule changed at the user's direction** — expenses are now borne entirely by whoever paid, not reimbursed and split 50/50. See "Where I left off" for the before/after figures (2026-07-28)
- [x] **Outstanding unified, add-on billing honoured, quotations editable, targets wired, session listener added** (2026-07-28)
- [x] **Password reset flow built** — `admin-reset.html` + a forgot-password control on the login page; recovery session signed out immediately after the change and the token stripped from history (2026-07-28)
- [x] **`supabase_migration_04_integrity.sql` written** — constraints, `updated_at` triggers, indexes. Not yet run (2026-07-28)
- [x] **Modal focus trap, scroll lock, single-open and focus restore**; dead deposit-prompt code removed; unused payment/add-on columns wired up; `.inline-select` contrast and touch targets fixed (2026-07-28)

### 🔄 In progress
- (nothing active)

- [x] **Admin portal rebuilt** — corrected partner accounting, arbitrary installments replacing the fixed deposit/final pair, add-ons, quotations, Payments + Quotations tabs, and one `computeFinancials()` replacing nine independent sums (2026-07-26)
- [x] **`supabase_migration_02_financials.sql` applied to production** — financial data cleared for re-entry, three new tables created, `partner_withdrawals` + `system_settings` closed to anon, old payment columns dropped (2026-07-26)

### ⏭️ Next / To do

**🔴 OWNER ONLY — do these in this order (2026-07-28).** Steps 1–5 are Supabase
dashboard/SQL actions Claude cannot perform. The order matters: doing 2 before 1
leaves you unable to onboard Rooben.

1. **Set Site URL + Redirect URLs.** Authentication → URL Configuration. Site URL is still `http://localhost:3000`, so every recovery and invite link is dead. Set it to `https://onyxx-tech.vercel.app` and add `https://onyxx-tech.vercel.app/admin-reset` to Redirect URLs. **`admin-reset` must be the only redirect target** — supabase-js defaults `detectSessionInUrl: true`, so a recovery link landing anywhere else signs the user in with their old password still set and never offers to change it.
2. **Turn OFF public signup.** Authentication → Sign In / Providers → Email → "Allow new users to sign up". Currently ON (`"disable_signup": false`), and every RLS policy trusts any `authenticated` user — so anyone can self-register into full read/write on all financial data.
3. **Run `supabase_migration_03_admin_allowlist.sql`** — no edits needed as it stands. **Both partners share one account** (decided 2026-07-28), so section 2 lists one address and the guard expects one row. When Rooben gets his own login: uncomment his line, raise `expected` to 2, re-run the file. It raises rather than locking anyone out, but it can only protect you if the list is right. **03 must always be the last policy-touching file run**: re-running 01 or 02 afterwards silently re-grants access, because Postgres OR-s permissive policies together.
4. **Run `supabase_migration_05_expense_scope.sql` — REQUIRED, not optional.** Adds `expenses.scope`. The dashboard writes it on every save, so **recording an expense fails until this is run**. Existing rows default to `'company'`, which is what every expense meant before the distinction existed. Touches no policies, safe either side of 03.
5. **Run `supabase_migration_04_integrity.sql`** — constraints, `updated_at` triggers, indexes. Housekeeping only: no DROP, no DELETE, nothing that changes a reported figure. Touches no policies, so it is safe either side of 03. **Genuinely not urgent** — the partner/quotation CHECKs mostly guard paths the UI does not expose, and the indexes are irrelevant at current row counts. The one reason not to defer it indefinitely is `updated_at`: audit history cannot be backfilled, so the trigger has to exist before a change happens for that change to be recorded.
6. ~~Create Rooben's account~~ — **not needed.** Both partners share one login for now. The consequence to be aware of: `updated_at` (migration 04) records *when* something changed but there is no way to tell *who* did it, and a password reset affects both of you. If that becomes a problem, see the "ADDING AN ACCOUNT LATER" note in migration 03.
7. **Re-key the financial data.** 3 projects and 10 expenses were cleared on 2026-07-26 for re-entry (backups were exported to a local text file first). When re-entering expenses, set **Who was this for?** on each one — company purchases get shared 50/50 and reimbursed, personal ones stay with the buyer. Anything migrated in without that field is treated as a company expense. Then check the Partners tab reconciliation row reads "Balanced".

**Standing notes (not tasks):**
- **`LOCAL_IMAGE_MAP` breaks silently** whenever a showcase image is re-uploaded — it is keyed on the upload filename, and the only symptom is `/work` getting slower. Verify with `GET /rest/v1/showcase_projects?select=title,image_url`.
- **Optional: reconnect the Supabase connector** to the account owning `whjstsgtximknicppllt`, or move that project into the "Onyx Tech" org — the connector is authorised for that org but the project lives elsewhere, so migrations have to be pasted by hand.

**Genuinely optional work — the audit backlog is otherwise cleared:**
- `updated_at` exists on the financial tables after migration 04, but nothing **displays** it. A "last changed" column on Payments and Expenses would make it useful rather than merely present. There is still no record of *who* changed something — that needs an `updated_by` defaulting to `auth.uid()`.
- Dead CSS from the multi-page era could be swept out of `styles.css`.

### 💤 Backlog / ideas
- Dead CSS from the multi-page era (`.work-item`, `.work-list`, and the `.hero-rotator` remnants that were just removed) could be swept out of `styles.css`
- Consider client-side compression for the admin dashboard's `receipts` upload too (deliberately skipped so far — financial documents, didn't want to risk blurring numbers without the user weighing in)
- Consider whether other pages besides Home should get the animated glass orbs, or stay with the lighter static wash

---

## 🧠 Key decisions & context
- **Partner accounting (CHANGED 2026-07-28): `balance(P) = pct(P) × (collected − SST) − withdrawn(P)`.** Expenses are borne **entirely by whoever paid them** — there is no reimbursement term and no cross-settlement. Do not add `+ paid(P)` back: that reimburses the payer out of shared money, which silently splits every cost 50/50 and is exactly what this replaced. `netProfit` is retained as `collected − SST − expenses` for reporting only and is **not** what shares derive from. `computeFinancials()` in `admin-dashboard.html` is the only place money is derived; everything else reads `fin`.
  - *Superseded:* the previous rule was `0.5 × (collected − expenses) + paid(P) − withdrawn(P)`. Figures entered before 2026-07-28 were recorded under it.
- **SST is not income.** Apportioned from the linked quotation as `sst_amount/total` of every ringgit collected, held as `fin.sstReserved`, and excluded from the distributable pool — otherwise both partners can withdraw money owed to the tax authority. With no quotations, or `sst_amount` 0, every figure is unchanged.
- **The reconciliation row is a real invariant, but it is not a safety net.** `balance(A) + balance(B)` must equal `collected − SST − withdrawn`. It only catches bad *input* (an expense with no `paid_by`). It **cannot** detect a cascade-deleted project, a duplicated expense, or a totally failed load, because both sides of the identity move together — all three still read "Balanced". Never treat a green tick as proof the data is right.
- **`HTTP 200` from PostgREST does NOT mean a table is public.** RLS filtering returns 200 with a row count of 0; only a missing table errors. Judge exposure by the **row count**, never the status code — misreading this produced a false "your financials are public" alarm. It is also why the dashboard must gate on `is_admin()` and not merely on a session existing: a non-admin otherwise sees a confident all-zeroes dashboard reporting "Balanced".
- **`receipts` and `quotations` buckets are PRIVATE.** Both store the object path and resolve it through a short-lived signed URL. (An older note here said `receipts` was public on purpose — that is no longer true; migration 01 sets `public = false` and the dashboard signs on click.) `avatars` and `showcase` stay public; they are site assets the marketing pages render.
- **No build step means every tracked file deploys as a URL.** `.vercelignore` is what keeps `*.sql`, `*.md`, `docs/` and `graphify-out/` off the public site. Do not remove it, and do not drop one-off scripts in the repo root.
- **`common.js` loads WITHOUT `defer`, in `<head>`.** The inline splash controller needs `window.onyxGalaxy` the moment it runs, and a deferred file wouldn't exist yet. Nothing in `common.js` touches the DOM at parse time — all of it is behind `init()` on DOMContentLoaded. It still **must stay an IIFE** (see below).
- **The splash plays on ARRIVAL and on RELOAD, not on internal navigation back to home.** Settled after two iterations, so don't change it without asking. `index.html`'s `<head>` computes `isReload || firstVisit`:
  - first load of the session → show; F5 on `/` → show (every time)
  - clicking Home from another page, or the back button → skip
  - A reload and a first arrival are both navigationType `navigate`, so **neither the nav type nor the session flag alone is sufficient** — it needs both. Interior pages have no splash markup and set `.splash-done` in their own `<head>`.
  - `data-splash="skip"` remains the manual off-switch.
- **`.splash-done` on `<html>` is the site's "the visitor can see the page now" signal.** Anything that shouldn't animate behind the curtain hangs off it. Pages with no splash set it in their `<head>` bootstrap; `index.html` sets it when the curtain starts lifting. **Never put a hero entrance animation on a plain page-load delay again** — that was the bug where the entire hero entrance played invisibly behind a 2.7s splash.
- **One galaxy renderer, three intensities.** `window.onyxGalaxy(canvas, opts)`. The default core position (78%/32%) is shared by the splash and the hero and is what makes the curtain lift seamless — don't change it for one caller only. Use `setTransform`, never `scale()`, when sizing: `scale()` compounds per resize and leaves the canvas blank after a maximise.
- **Nav active state is `[aria-current="page"]`, not a `.active` class.** Real URLs mean the current page is a fact in the markup; keying the visuals off the accessibility attribute keeps one source of truth. Watch for duplicate `::after` rules later in `styles.css` overriding the canonical one — that already bit once.
- **The hidden admin entry is a double-click on the NAV LOGO** (the footer brand mark does it too). The logo is a real link to `/`, so the first click starts navigating and destroys the page before a plain `dblclick` can fire — the click is intercepted instead and `event.detail` decides. On the homepage this is free: a logo click there has nowhere to go, so it is cancelled and scrolls to top. On other pages a single click waits `HOME_DELAY` (420ms) in case a second is coming; 250ms measurably lost a 320ms double-click. Don't lower it. `/admin-login` is always the direct route.
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
- **Declare `color-scheme` on `:root`, per theme.** Without it the browser paints all *native* control chrome — the date field's calendar button, number spinners, select arrows, checkboxes, scrollbars — for a light UI. On the dark background they are invisible. This was the "some icons are not visible" report, and inline SVG icons were unaffected, which is why only *some* vanished. Note it also makes number spinners appear, hence `appearance: textfield` on money fields.
- **Escaping into an inline `onclick` is a different context from escaping into element content.** The attribute is HTML-entity-decoded *before* it is parsed as JS, so HTML-escaping first is useless: `'` becomes `&#39;`, which decodes straight back into a live quote. `escArg()` must JS-escape first, then HTML-escape. `esc()` is for content and quoted attributes. Prefer `data-id` + `addEventListener` — it removes the second context entirely.
- **U+2028/U+2029 written literally into a regex is a SyntaxError**, because they are line terminators to the JS parser. It kills the entire inline script, not just the function. Use `` escapes.
- **`revenueByMonth()` returns sorted `[month, amount]` PAIRS, not an object.** Indexing it by month name yields `undefined` silently.
- **The global `html, body, *` scrollbar kill in `admin-dashboard.html` uses `!important`.** Any element that genuinely needs a scrollbar (`.table-container`, `.custom-modal`) must use `!important` too — specificity does not beat `!important`. A documented past fix to the table scrollbar was silently re-broken by exactly this.
- **Check class names against the markup before writing a CSS rule for them.** Rules for `.filter-bar`, `.modal`, `.modal-content` and `.badge` all matched nothing; the real names are `.search-filter-bar`, `.modal-backdrop`, `.custom-modal` and `.status-badge`. Same failure as the earlier `.project-card--link` incident.
- **`opacity: 0` + `pointer-events: none` does not remove an element from the tab order.** The closed project modal and the closed mobile nav drawer both kept their controls focusable. `visibility: hidden` is what does it, and it still transitions.
- **Verification must not be able to reach production.** Route `**://*.supabase.co/**` to abort in Playwright tests. Stubbing `window.supabaseClient` does **not** work — the page holds it as a script-scoped `const`, so the assignment creates a separate binding and the real client is still used. One test run reached the live database this way (rejected by RLS, nothing written).
- **Domain:** production is `https://onyxx-tech.vercel.app`.
- Site previously had a real hero-flicker bug (mix-blend-mode + scale-animated blur) that an earlier session had incorrectly written off as "the user's display, not the site" — turned out that session's claimed fix was never actually in the repo. Lesson logged in memory: verify actual file state before trusting a prior session's conclusion.

---

## 📝 Session log
- **2026-07-28 (backlog cleared)** — Built the password-reset flow that did not exist: `admin-reset.html` plus a forgot-password control on the login page. The design turns on one fact — supabase-js defaults `detectSessionInUrl: true`, so a recovery link landing on *any* page silently signs the user in with their old password still set; the reset page must be the only redirect target, and the login page now forwards a `type=recovery` fragment rather than consuming it. The recovery session is a credential, so it is signed out immediately after the change and the token stripped from history. Wrote `supabase_migration_04_integrity.sql` (constraints, `updated_at` triggers, indexes — no DROP, no DELETE, no figure changes). Gave the admin modals a focus trap, scroll lock, single-open and focus restore. Removed the dead deposit-prompt code. Wired up `project_payments.method`/`.notes` and `project_addons.notes`, and fixed `addPayment` reusing a `sort_order` after a middle row was deleted. Fixed the `.inline-select` contrast and the touch targets — and found in passing that `#themeToggleBtn` was revealed only by `.sidebar:hover`, i.e. **unreachable on a phone**. Caught in review: the anon key I wrote into the reset page from memory was a stale one with different `iat`/`exp` claims. Also corrected the dating of this whole session's entries — they were written as 2026-07-27 while every commit is stamped 2026-07-28.
- **2026-07-28 (audit + expense rule)** — Started from a report of invisible icons in the Add Project modal; the cause was that `color-scheme` was never declared, so Chrome painted native control chrome for a light UI on a dark background. Ran four parallel audits (admin CSS, admin JS, public site, data layer) and fixed the findings across four commits. The most serious was not in the audit brief: **production was publicly serving `/supabase_migration.sql`, `/PROJECT_STATUS.md`, `/CLAUDE.md` and `/docs/CHANGELOG.md`** — no build step means every tracked file becomes a URL. Closed with `.vercelignore`, verified 404 live. Then, at the user's direction, **changed the accounting rule so expenses are borne entirely by whoever paid them** rather than reimbursed and split 50/50 (see Key decisions). **Four errors of my own worth recording:** `escArg()` was written backwards and provided no protection at all (proved by executing the payload, not by reading it); writing U+2028 literally into its regex was a SyntaxError that would have killed the whole dashboard script; `openQuotationForm` was written against a `quotationModal` that does not exist; and the new targets indexed `revenueByMonth()` by month name when it returns sorted pairs. The last two were caught only because the tests asserted rendered output. Also: one verification run reached the live database, because stubbing `window.supabaseClient` does not work when the page holds it as a script-scoped `const` — RLS rejected the insert and nothing was written, and all later runs abort Supabase at the network layer. Full write-up in `docs/CHANGELOG.md`.
- **2026-07-26 (admin portal)** — Rebuilt the admin financials: fixed the partner-balance bug (the expense settlement was computed then discarded, so a partner who fronted costs was never credited), replaced the two fixed payment slots with arbitrary installments, added add-ons and quotations, and collapsed nine independent money sums into one `computeFinancials()`. Applied `supabase_migration_02_financials.sql` to production; financial data cleared for re-entry at the user's request. **Also corrected a wrong security finding of my own**: `projects`/`expenses` were never publicly readable — `HTTP 200 + 0 rows` from PostgREST means RLS filtered everything, not that the table is open. Only `partner_withdrawals` and `system_settings` were actually exposed, and both are now closed.
- **2026-07-26 (later)** — Restored the hero rotator ("modern businesses." → "ambitious teams." → "bold founders." → "what comes next.") that `e9dc5d3` had replaced with a static line; rebuilt on `inline-grid` so it no longer needs a hardcoded `min-width`. Fixed the homepage project teasers showing default blue underlined link text — `.project-card--link` was applied by JS and never styled. Fixed the cursor glow being offset 283px from the pointer: a 400px circle positioned by `left`/`top` with no centring transform, so its top-left corner tracked the cursor. Bug had been present since `eb511ef`. Also moved it onto a transform (was forcing a layout every frame) and made the rAF loop idle when the pointer is still. Changed the splash from once-per-session to playing on every homepage load, at the user's request. Also rewrote the headline animation check to sample in-page on rAF: the CDP-round-trip version cost ~700ms per sample, skipped the window where the stagger is visible, and reported a false failure on a working animation.
- **2026-07-26** — Removed the gridlines; found and fixed why the text animations had "disappeared" (deleted headline rule **and** an unused `.splash-done` hook that meant the whole hero entrance played behind the curtain); rebuilt the site as 7 pages with page headers and a hub homepage; unified the two galaxy implementations into `common.js` and moved all site chrome there; scoped the splash to home/once-per-session; structured footer, `aria-current` nav state, logo view-transition. Caught in review: Contact had no mobile nav entry point once it became its own page. Full write-up in `docs/CHANGELOG.md`.
- **2026-07-25** — Rebuilt the splash screen around the brand mark and the hero galaxy (see Done + CHANGELOG). Traced the logo PNG to vector to make the mark draw itself. Removed the progress rail, the staged status line and the splash's Lottie; corrected the wordmark from Fraunces "ONYXX TECH HUB" to the real banner lockup. Also fixed a curtain fade-in that let the hero show through on first paint. Verified frame-by-frame in Chrome via Playwright. Housekeeping: this board was stale — it listed the 2026-07-24 splash work as uncommitted when it had in fact landed as `e9dc5d3`, and listed a `Carousel_Maker.png` 404 that is already fixed (the file is in `images/`).
- **2026-07-24** — Splash screen redesign + `loading.lottie` wired in sitewide + a sitewide motion/hover layer; removed the hero rotator in favour of the static "for modern businesses."; discovered and fixed that `common.js` had never executed on this site due to a global lexical `const` collision with `index.html`'s inline script. Verified in real Chrome over CDP rather than by inspection. See `docs/CHANGELOG.md` for the full write-up.
- **2026-07-22** — Set up project tracking (CLAUDE.md + PROJECT_STATUS.md + docs/CHANGELOG.md). Also mid-session: full multi-page restructure, several bug fixes, animations, image optimization, and the Vercel canonical-URL fix (see Done list above for the full breakdown — this was one long continuous session).
