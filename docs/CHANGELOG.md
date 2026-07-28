# Changelog — Onyxx Tech Website

Append-only, dated log of significant completed work. Newest entries on top.
Format each entry: what was done, why it mattered, and any key decisions.

---

## 2026-07-27

### Four-agent audit of the whole system; security and accessibility fixes

Triggered by a report of invisible icons in the Add Project modal. Four parallel
audits: admin CSS/visual, admin JS/business logic, public site, and data
layer/auth.

**The reported bug.** No `color-scheme` was ever declared, so Chrome painted all
*native* control chrome — date picker glyph, number spinners, select arrows,
scrollbars — for a light UI. On the dark background they were invisible. Inline
SVG icons were unaffected, which is why only *some* icons vanished. Fixed with
`color-scheme: dark` on `:root` and `light` on `[data-theme="light"]`. Number
inputs were set to `appearance: textfield` in the same change, because
`color-scheme` would otherwise have made spinner arrows appear on money fields.

**Internal files were public on production.** No `.vercelignore` existed, and
there is no build step, so every tracked file deployed as a static asset.
Verified live: `/supabase_migration.sql` (200, full schema + every RLS policy),
`/PROJECT_STATUS.md`, `/docs/CHANGELOG.md`, `/CLAUDE.md`. The SQL handed an
attacker the exact table/column/policy layout to aim the public anon key at.
Added `.vercelignore`.

**`escArg()` was backwards and did nothing.** It HTML-escaped first, so `'`
became `&#39;` — which the browser decodes back to a live quote *before* the JS
parser sees the attribute. Confirmed by execution: `');alert(1)//` broke out and
ran, while a legitimate `O'Brien` threw a SyntaxError. The JS-string escape has
to happen first, then the HTML escape. Now 8/8 hostile inputs round-trip inert.
Writing U+2028/U+2029 literally into the regex was itself a SyntaxError (they
are line terminators to the parser) — they must be `\u` escapes.

**`/work` shipped 28.2 MB.** `LOCAL_IMAGE_MAP` had drifted: two keys matched
nothing (rows re-uploaded, new filenames), so 3 of 10 projects resolved locally,
and those 3 pointed at the heavy source rather than the optimised `.webp` beside
it (`xcraft.png` 1,032,816 B vs `xcraft.webp` 25,832 B). Rebuilt against the
live rows — 9 of 10 now local `.webp`, ~520 KB total. The map is keyed on an
upload filename, so it re-breaks silently on every admin re-upload; noted in
the code.

**Accessibility.** `/work` case studies were mouse-only — cards were bare
`<div>`s with a click listener, on a page that says "click any project to see
the full story". Now `<button>`s. The *closed* project modal and mobile nav
drawer both kept their controls in the tab order (`opacity:0` stops the mouse,
not the keyboard); both got `visibility: hidden`.

**Other.** Money colours moved to `--pos`/`--warn`/`--neg` with light-theme
values (the hardcoded set measured 1.5–2.5:1 on light); Cash Flow charts made
theme-aware via a `chartPalette()` helper that reads the computed properties,
since canvas cannot resolve `var()`; three custom properties that were used but
never defined (`--accent-faint`, `--accent-dim`, `--bone-faint`) added; the
global scrollbar kill was overriding the table container's own `!important`-less
rules, re-breaking a documented past fix; `.custom-modal` capped at `90vh` with
`overflow-y: auto` (Add Project measured 900px on a phone, clipped at both
ends); two mobile rules targeting classes that do not exist (`.filter-bar`,
`.modal`/`.modal-content`) repointed at the real ones; services copy corrected
from "Four disciplines" to five; `robots.txt` rewritten (it disallowed only
`.html` paths, which `cleanUrls` redirects away from — `/admin-login` itself was
returning 200 and fully crawlable).

**Key decision.** `supabase_migration_03_admin_allowlist.sql` was written and
then substantially reworked before being run. Every RLS policy keys on
`auth.role() = 'authenticated'` while public signup is open
(`"disable_signup": false`), so anyone could self-register into full financial
access. 03 introduces an `admin_users` allowlist + `is_admin()`. The first draft
would have locked a partner out: it seeded one email and "guarded" with a bare
`SELECT`, but the SQL Editor renders only the last statement and nothing halts
on an unexpected row count. Now a `DO` block raises, which rolls back the whole
script. Also: 01 and 02 re-grant `authenticated` access if re-run, because
Postgres OR-s permissive policies — so **03 must always be run last**.

Verified with Playwright: 8/8 pages load with zero console errors and zero 4xx.

---

## 2026-07-26

### Admin portal rebuilt: real project financials and correct partner accounting

Migration `supabase_migration_02_financials.sql` **applied to production**.

**The accounting bug.** `renderPartners()` computed each partner's expense
settlement, printed it in its own column, then dropped it:

```js
const kunaSettlement = kunaPaid - kunaIdealShare;   // computed
const kunaFinal      = kunaProfitShare;             // discarded
```

A partner who fronted RM1,000 of costs was never credited the RM500 the other
owed them. `paid_by` was already being captured — only the arithmetic ignored it.
With one shared account and every expense fronted personally:

```
balance(P) = 0.5 x (collected - expenses) + paid(P) - withdrawn(P)
```

- **The trap:** you cannot fix this by adding `settlement` to `profitShare`. The
  profit share already carries −½E and the settlement carries another −½E, so
  the sum deducts expenses one and a half times. Probably why it was left
  disconnected rather than wired in.
- Verified against hand-worked figures by running the *shipped* function in a
  browser JS context with fixture data, not a reimplementation: collected
  16,000, expenses 1,200, net 14,800 → Kuna 7,900, Rooben 7,600, and the
  invariant `balance(A) + balance(B) == collected − withdrawn` holding at 15,500.
- The Partners tab shows that invariant as a reconciliation row and turns it
  **red** when it fails — which it does if any expense has no `paid_by`, the one
  input that silently corrupts both partners' numbers.

**Installments replace the two fixed payment slots.** `project_payments`,
`project_addons` and `quotations` are new tables; the `deposit_*` /
`final_payment_*` columns are gone. A project row expands into a financial panel
(value, add-ons, contract total, collected, outstanding, overdue, the schedule
with tick-to-receive, linked quotation) and warns when the schedule doesn't add
up to the contract. New **Payments** and **Quotations** tabs.

- **One source of truth.** The old model was summed independently in **nine**
  places and several already disagreed. `computeFinancials()` produces every
  figure once; Overview, Projects, Cash Flow, Partners and Reports all read it.
  Three hand-rolled monthly-revenue loops collapsed into `revenueByMonth()`.
- `paid_by` is restricted to the two partners in the UI *and* by a DB
  constraint. The dropdown previously offered every team member, which the
  constraint would now reject with a raw error.
- Verified: 36 inline handlers defined, 13 render functions present, 18 new
  element ids matched, zero references to the retired model, and the dashboard
  renders against fixtures with **zero page and console errors**.

### Correction: the "financial data is public" finding was wrong

An earlier entry claimed `projects`, `expenses`, `partner_withdrawals` and
`system_settings` were all world-readable. **Two of those four were fine.**

The mistake: reading `HTTP 200 + 0 rows` from PostgREST as "readable and empty".
When RLS filters every row it still answers **200 with a count of 0** — only a
missing table errors. Because the tables were also believed to be empty, both
wrong readings agreed and neither got questioned. The real row counts (3
projects, 10 expenses) exposed the contradiction.

What `pg_policies` actually showed:

| Table | Public SELECT policy | Verdict |
|---|---|---|
| `projects`, `expenses` | none — only `ALL` to `{authenticated}` | already private |
| `partner_withdrawals` | `USING (true)` | exposed, but 0 rows |
| `system_settings` | `USING (true)` | exposed, 3 rows |

Only the latter two were closed. Confirmed after applying: `system_settings`
went from 3 rows visible to anon to 0, every private table reports 0, and all
seven public pages still render (Services 5, Work 6, Founders 2).

- **The probe script now reports row counts, not status codes**, and flags
  anything non-zero outside the public-by-design set. Its old label said
  "READABLE" for any 200, which is precisely what produced the false alarm.
- **The pre-flight check earned its place.** The first draft of the migration
  assumed empty tables and `DROP`ped the deposit/final columns; running it
  would have destroyed four real payments.

**Deliberately not done: the `receipts` bucket stays public.** Receipts are
uploaded with `getPublicUrl()` and that URL is stored in
`expenses.invoice_link` and rendered as a plain link, so flipping the bucket
would break every existing receipt. Doing it properly means storing the object
path and signing on click, plus converting existing rows — a dashboard change,
not a migration. The new `quotations` bucket is private from the start, having
no legacy URLs.

### Restored the hero rotator, and fixed the homepage teaser cards rendering as raw links

**Hero rotator is back.** The tail of the headline cycles through "modern
businesses." / "ambitious teams." / "bold founders." / "what comes next." in the
cyan accent italic, every 2.8s. It was dropped in `e9dc5d3` in favour of a static
line; the original markup, CSS and driver were recovered from `eaa9e15`.

Three things done differently from the original:
- **`inline-grid` with every phrase in the same cell** replaces the original's
  `position: absolute` plus `min-width: 260px`. The container now sizes itself to
  the widest phrase, so there's no magic number to keep in sync with the copy and
  no width jump on swap. Measured stable at 664px across all four phrases.
- **Phrases exit upward** instead of sinking back the way they came. The original
  just removed `.active`, so the outgoing word faded *downward* while the
  incoming one rose — two directions at once. Now it reads as a conveyor.
- **Starts on `.splash-done`, not on load**, and pauses on `visibilitychange`.
  Behind a 2.7s curtain it would otherwise already be two phrases in before
  anyone saw the hero.
- The rotator is `aria-hidden` with an `sr-only` stand-in beside it, so the `h1`'s
  accessible name is the stable full sentence rather than whichever phrase
  happened to be showing. The original exposed all four phrases to screen
  readers as one run-on heading.

**Fixed the homepage project teasers rendering with default link styling.** Those
cards became real `<a>` elements in the multi-page work so they'd function
without JS — but `.project-card--link` was set by `common.js` and **never styled**,
so the UA's link rules applied: blue text, plus an underline that propagates into
every descendant, hitting the title and the description. Now resets `color` and
`text-decoration`, with a focus ring that follows the card's own 16px radius
since the whole card is the link.

- **Added a check for the whole class of mistake:** a script that diffs every
  class applied by markup/JS against every class `styles.css` defines. It found
  this one and confirmed the other seven candidates were benign (theme icons
  positioned by inline style, splash paths styled via parent-group selectors).
  Worth re-running after any batch of JS-driven markup changes.

### Fixed the cursor glow sitting 283px away from the cursor

`.cursor-glow` is a 400×400 circle positioned by JS, and it had no centring
offset — the follower wrote `left`/`top`, so the element's **top-left corner**
tracked the pointer and the visible centre sat 200px right and 200px down of it
(283px diagonal). Present since `eb511ef`, i.e. every version of this site; the
`will-change: transform` hint on the rule was a clue, since nothing was writing
a transform.

Now positioned with `translate3d(x, y, 0) translate(-50%, -50%)`, which both
centres it on the pointer and keeps `will-change: transform` honest.

- **Also a per-frame layout.** Animating `left`/`top` invalidates layout on
  every frame; a transform stays on the compositor. The old loop did this
  unconditionally at 60fps for the life of the page.
- The rAF loop now **stops when the pointer is still** and restarts on the next
  `mousemove`, instead of easing toward a stationary target forever. It also
  snaps to the first known pointer position rather than gliding in from `0,0`,
  and the element parks off-screen until the first move so it isn't briefly
  visible in the top-left corner on load.
- Verified by measurement, not by eye: pointer moved to five positions, glow's
  bounding-box centre compared against each — **0.0px offset at all five** — and
  the transform confirmed to stop being rewritten while idle.

### Splash: on arrival and on reload, but not on navigating back to home

Final shape of a rule that took two passes. The homepage plays the curtain when
the visitor **arrives** or **reloads**, and stays silent when they merely
navigate back to `/` from another page:

| Arriving at `/` | Nav type | Splash |
|---|---|---|
| First load this session | `navigate`, unseen | yes |
| Refresh / F5 | `reload` | yes, every time |
| Clicking Home from `/work` | `navigate`, seen | no |
| Browser back button | `back_forward` | no |

**The catch:** a first arrival and a reload are both navigationType `navigate`,
so neither the nav type nor a session flag is sufficient alone — the condition is
`isReload || firstVisit`, using both. `performance.navigation.type === 1` is kept
as a fallback for engines without a Navigation Timing L2 entry, and both the
timing read and the `sessionStorage` write are wrapped (Safari private mode
throws on the latter) so a failure errs toward *showing* the brand.

- Verified across all ten cases in one browser session plus a fresh context:
  arrival, two consecutive F5s, `/services`, link back to `/`, `/work`, the
  browser back button, an F5 after navigating, and a new session.
- Also re-verified the hero entrance still plays on the **no-splash** path,
  which is the easy thing to break here — that path sets `.splash-done` in
  `<head>`, and the lines were measured rising 117 → 0px staggered, 102.8px
  widest gap, exactly as on the splash path.

### Splash previously played on every homepage load (superseded by the above)

At the user's request the `sessionStorage` gate added earlier the same day is
gone: reloading `/`, or returning to it from another page, plays the curtain
again every time. The `<head>` bootstrap simply sets `data-splash="show"`
unconditionally.

`data-splash="skip"` is still honoured by both the controller and `styles.css`,
so it remains the manual off-switch — but nothing sets it automatically now.
Interior pages are unchanged: they have no splash markup and set `.splash-done`
in their own `<head>`.

- **Trade-off, stated for the record:** every arrival at the homepage now costs
  ~2.7s before the hero appears, including a returning visitor clicking "Home".
  That was the reason for the session gate; it is a deliberate call, not an
  oversight. Reverting is a one-line change in `index.html`'s bootstrap.
- Re-verified: splash on three consecutive loads plus an F5 reload, still absent
  on `/services`, present again on returning to `/`, and no `sessionStorage` key
  written any more. Hero entrance still fires correctly off `.splash-done`.

- **Testing note:** the headline check was rewritten to sample in-page on
  `requestAnimationFrame` rather than over CDP. Driving it with per-sample
  round-trips cost ~700ms each, which skipped the window where the stagger is
  widest and produced a false failure on a working animation. Also, an
  `add_init_script` runs before the parser creates `<html>`, so
  `document.documentElement` is null there — the first version of the sampler
  threw silently and collected nothing.

### Back to seven pages, gridlines gone, and the text animations actually visible

**Removed `.grid-bg`.** The fixed 80px gridline overlay is gone sitewide, along
with the `.work-list` / `.work-item` / `.work-num` / `.work-title` / `.work-meta`
/ `.work-stack` block — leftovers from the *first* multi-page era that matched no
markup in any file and would have collided with the new `work.html`.

**Found and fixed why the text animations "disappeared".** Two separate causes:

1. The homepage headline's masked per-line rise was **deleted in `e9dc5d3`** while
   the hero rotator was being removed. The `.line > span` markup and
   `@keyframes slideUp` both survived, but `overflow: hidden`, the offset and the
   animation did not — so the structure was inert and `slideUp` was orphaned.
2. **Bigger cause:** `.splash-done` was added to `<html>` by the splash
   controller but **no CSS rule anywhere used it**. Every hero entrance animation
   (logo, tag, sub, CTA, scroll hint) ran on delays of 0.1s–1.5s *from page load*
   — behind a curtain that covers the viewport for ~2.7s. The whole entrance
   played out and finished before anyone could see it. Restoring the headline
   rule alone would not have helped; it would have animated behind the curtain
   too.

Every hero entrance is now gated on `html.splash-done`, and the per-line reveal
is a reusable component (`.lines`) with two triggers: `.lines-immediate` for the
hero (plays when the curtain clears) and plain `.lines` for everything else
(plays when scrolled to, via `.lines-in` from common.js). `--line-index` drives
the stagger, so the hero's original 0.3 / 0.45 / 0.6s cadence is now
`--line-base` plus an index rather than three hardcoded `nth-child` rules.

- **Verified by measurement, not by screenshot.** Sampling each line's
  `translateY` from the instant `.splash-done` lands: `117 / 117 / 117` px at
  +5ms → `39 / 111 / 117` at +477ms → `3 / 11 / 30` at +812ms → `0 / 0 / 0` by
  +1484ms. Staggered, and demonstrably *after* the curtain. A still of the
  resolved hero would have looked identical before and after the fix.
- Reduced motion needs an explicit override here, not just a zeroed duration: a
  line starts at `translateY(110%)`, entirely outside its clipped box, so if the
  animation never applies the text would sit permanently invisible.

**Back to seven pages.** `index.html`, `services`, `why`, `work`, `process`,
`founders`, `contact` — the same set that existed before `863a208` collapsed the
site into one file. Regenerated from the current sections rather than restored
from git, since the old files predate the rebrand, the dynamic team section and
both splash generations. `vercel.json` already had `cleanUrls`, and
`@view-transition` was still in place, so cross-page cross-fades came for free.

- **Home is now a hub, not a copy of the site**: hero, then a four-card services
  teaser, the three "why" points, three project teasers, and a CTA — each linking
  through. Its project cards are real `<a>` links to `/work`; only `/work` opens
  the case-study modal.
- **Every interior page opens with a page header** (eyebrow → masked per-line
  title → intro). The old pages dropped straight into a section with no title
  treatment, which is the main reason they read as thin.
- **Per-page fetching.** `loadLandingPageData()` used to `Promise.all` all three
  Supabase tables on every load. Each page now requests only what it renders —
  home takes two, `why`/`process`/`contact` take none.
- **Anchor navigation retired.** The eased smooth-scroll and scroll-spy block
  (~85 lines) existed to move between sections of one page. With real URLs the
  active link is a fact in the markup, so the visual state is driven off
  `[aria-current="page"]` rather than a `.active` class JS infers from scroll
  position — one source of truth for both semantics and appearance.

**One galaxy renderer, three intensities.** There were two near-identical
implementations (the hero's and the splash's). Now `window.onyxGalaxy(canvas,
opts)` in `common.js`, used by the splash at full strength, the home hero at full
strength, and interior pages dialled down as a fixed backdrop — which is what
replaced the gridlines. The default core position (78% / 32%) is shared, and the
splash↔hero handoff measures a core offset of **(-2.8, -16) px** (it was
(+109, -192) when they were separate implementations).

- `size()` uses `setTransform`, not `scale()`. `scale()` compounds on every
  resize, which is what used to leave the hero canvas stuck blank after a
  maximise; unifying on the correct one preserves that fix in both places.
- The renderer pauses its rAF loop on `visibilitychange` — the old hero version
  burned frames in background tabs.

**`common.js` is now the whole site chrome**, not just cross-cutting helpers:
galaxy, cursor glow, nav, theme, reveals, line reveals, scramble, magnetic
buttons, project modal and the Supabase loaders. With seven hand-maintained
files, leaving ~800 lines of script in each page is how they drift. It loads
**without `defer`** now, because the inline splash controller needs
`window.onyxGalaxy` the moment it runs; nothing in it touches the DOM at parse
time. **It must stay an IIFE** — the documented silent-failure mode.

**Splash is homepage-only and once per session** (`sessionStorage`). Decided in
the `<head>` before first paint and stamped as `data-splash`, so a page that
won't show the curtain never flashes it. A 2.7s brand moment is right on arrival;
on every navigation it would be a toll booth.
> **Superseded the same day** — the once-per-session gate was removed at the
> user's request; the splash now plays on every homepage load. See the entry
> above. Homepage-only, and the `data-splash` mechanism, still stand.

**Design upgrades:**
- Nav active state gets a hairline that grows from the centre, keyed to
  `aria-current`. Also removed a **duplicate `.nav-links a::after`** further down
  the file that was silently overriding the canonical rule because it came later.
- Structured footer: brand + tagline, a six-link Explore column, and direct
  contacts including both founders' WhatsApp. With seven pages the footer is also
  secondary navigation.
- `view-transition-name` on the nav logo so it morphs between pages instead of
  cross-fading with everything else.

**Bug caught during review:** `.nav-email` is `display: none` under 768px, and the
mobile drawer only held the five section links — so with Contact promoted to its
own page it had **no mobile entry point in the nav at all**. Contact now also
appears as a drawer-only `<li>`. Verified by asserting all six destinations are
reachable from all seven pages at both 1440px and 390px.

**Verification.** All seven pages, dark + light: zero page errors, zero console
errors, zero failed requests. No horizontal overflow across 28 page/viewport
combinations (1440 / 768 / 390 / 320). Reduced motion: no line left stranded
outside its clip on any page. Splash policy: shows on first arrival, silent on
`/services`, silent returning to `/`, shows again in a fresh context.

---

## 2026-07-25

### Splash screen rebuilt again: the mark powers up over the hero's galaxy

Replaced yesterday's splash (orbit ring + `loading.lottie` + progress rail) with
one built out of two things the site already owns: the logo's own geometry, and
the hero's galaxy.

**The mark draws itself.** The OX monogram is a circuit-trace glyph — an O and
an X wired together through six node vias — and nothing on the site had ever
used that. It does now: the six vias ignite in symmetric pairs, a bright head
runs the outline like current finding a route, the silhouette floods in, and a
slim specular band crosses it while it waits.

To animate it, `images/onyxx_logo_transparent.png` was traced to vector. The
alpha channel was supersampled 4×, contours walked with a Moore-neighbour
trace, simplified with Douglas–Peucker, and emitted as lines through corners
and quadratic Béziers through curved runs (a first pass at coarser tolerance
came out visibly faceted — the O lumpy, the vias octagonal). Result is 11
subpaths at **IoU 0.9625** against the source alpha, ~8 KB inline.

- **Key decision:** the geometry is partitioned into three groups — traces /
  ring / cross — split so each group is *independently fill-correct*, i.e.
  every hole sits inside its own group's outer contour. That matters because
  the O's counter, the arrow notch and the six via holes are separate
  contours; grouping them by *visual* role instead (all six vias together)
  renders the two right-hand vias as solid discs, since the X actually owns
  them. Getting this right lets the same three paths serve the stroke pass,
  the solid fill and the sweep's clip without duplicating 8 KB three times.
- **Key decision:** every group carries `pathLength="100"`, so each
  `stroke-dasharray` / `stroke-dashoffset` figure in CSS is a percentage of
  that group's own outline. No measured lengths, no JS involvement in timing.
- The six via flares are explicit `<circle>` elements at the traced centroids
  (`50.37,21.03` · `35.64,27.18` · `64.90,27.19` · `35.62,80.19` ·
  `64.91,80.19` · `50.39,86.31`, r≈2.2) rather than being driven off the
  geometry, so their stagger is controllable independent of the fill grouping.

**The plate is the hero's galaxy.** The splash paints its own canvas — 300
background stars, 170 in two spiral arms, six nebula clouds, shooting stars —
sharing the hero's palette, twinkle maths, **and its spiral-core position of
78% / 32%**. That last part is the whole point: when the curtain lifts, the star
field behind it is already in the same place, so the load resolves into the page
instead of cutting to it. Verified by capturing both skies with content hidden
and comparing them. `.splash-galaxy` is pinned to `opacity: 0.85` to match
`.circuit-canvas` exactly — any other value makes the sky visibly change
brightness at the handoff, the one seam this design exists to remove.

- The splash owns its own canvas rather than revealing the hero's, because the
  hero's script is at the bottom of the page and hasn't run at first paint.
- Reduced motion draws a single static frame and never starts the rAF loop, so
  it's a real sky, just not a moving one. The whole power-up is suppressed and
  the mark is simply present, filled, at rest.
- Light theme hides the galaxy: a scatter of grey specks on white reads as
  dirt, not stars.

**Removed: the progress rail and the staged status line** (at the user's
request). Nothing replaced them — the galaxy is live, so the wait has motion
without a rail claiming byte-level progress a static page can't honestly
measure. The `sr-only` load announcement is unchanged.

**Removed: `loading.lottie` from the splash.** It rendered as an
unidentifiable blue blob next to a logo that was already visibly doing
something — two competing loaders. It remains the loader everywhere else
(grids, project modal, admin) and that system is untouched.

**Wordmark corrected to the actual brand lockup.** The previous splash set
"ONYXX TECH HUB" in Fraunces; the company banner is **ONYXX** heavy against
**TECH** light in a geometric sans. It's now Outfit 700/300 to match, which
also means the splash agrees with every other place the logo appears. The
per-character reveal indexes continuously across both words so the stagger
reads as one sweep.

**Other fixes found while building this:**
- The curtain no longer fades in. It had a 0.5s entrance opacity animation,
  which meant the hero headline was visible *through* the splash on the first
  frames — the exact thing a curtain exists to prevent. It is opaque from
  first paint and only animates on the way out.
- The exit bloom was washing the glyph out (it swallowed the O and X at full
  accent). It now sits behind the mark and flares out from around it.
- Mobile: tightened the lockup's tracking and size floor so both it and the
  tagline stay on one line down to a 320px viewport, with no horizontal
  overflow.

**Then, at the user's request: slower, and bigger.** The whole entrance was
rescaled ×1.6 (it now resolves at ~2.60s instead of ~1.60s) and the lockup was
scaled up — mark 148 → 210px, wordmark to `clamp(2.1rem, 6vw, 3rem)`, tagline
0.62 → 0.8rem; mobile 120 → 168px.

- `MIN_MS` 1500 → **2700** and `HARD_CAP_MS` 4500 → **5600**. `MIN_MS` sits just
  past the entrance so the curtain can't pull back mid-draw; the cap has to stay
  clear of `MIN_MS` + the entrance or a slow load would be cut off by the cap
  instead of by `load`. **All three numbers are coupled with the CSS above** —
  every duration and delay in that block is one ×1.6 vocabulary, so retiming
  means scaling all of them together rather than nudging one.
- The galaxy's own fade-in was *shortened* (1.7s → 0.9s, delay dropped) while
  everything else slowed. At the slower pace a long fade left the first
  half-second reading as an empty black plate; the galaxy is the backdrop, not
  a reveal, so it needs to be there before the power-up starts.
- Tagline tracking pulled back 0.32em → 0.26em. At the larger size the wider
  tracking made the strapline measure *broader than the wordmark above it*
  (404px vs 304px), which reads as the supporting line overpowering the name.
  Now 378px against 351px.
- Glow radii are CSS px against the rendered box, not viewBox units, so they had
  to grow with the mark (comet 3 → 4px, exit flare 22 → 32px) or they would have
  scaled down relative to it.
- Re-verified at 1440px, 390px and 320px: lockup and tagline each on one line,
  content fits the viewport height, no horizontal overflow, no errors.

Verified in Chrome via Playwright by pausing `document.getAnimations()` and
seeking `currentTime`, rather than by inspection: the full entrance frame by
frame, the two-stage exit, light theme, reduced motion, and mobile at 390px.
Zero page errors, zero console errors, zero failed requests in dark and light.

- **Testing note for future sessions:** Playwright's
  `screenshot(animations="disabled")` fast-forwards CSS animations to their end
  state, which silently defeats any manual seek — every frame comes back
  showing the finished mark. Use `animations="allow"` and pause/seek by hand.
  Also, filtering `setTimeout` by delay is not enough to hold the splash open:
  when `load` arrives after `MIN_MS` the remaining delay is `0`.

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
