# Project Status — Onyxx Tech Website

> **Living board.** Read at the start of every session; updated when significant tasks finish. Newest state on top.

**Last updated:** 2026-07-22

---

## 📍 Where I left off
Vercel canonical-URL fix and the project tracking docs (this file, CLAUDE.md, docs/CHANGELOG.md) are committed and pushed — `origin/main` is at `1cd8262`. Nothing outstanding right now; waiting on the user for what's next.

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
- [x] Pushed three commits to `origin/main` today: `eb511ef` (multi-page restructure), `a95444b` (animations + glass orbs), `1cd8262` (canonical-URL fix + this tracking system)

### 🔄 In progress
- (nothing active)

### ⏭️ Next / To do
- (nothing queued — ask the user what's next)

### 💤 Backlog / ideas
- Consider client-side compression for the admin dashboard's `receipts` upload too (deliberately skipped so far — financial documents, didn't want to risk blurring numbers without the user weighing in)
- Consider whether other pages besides Home should get the animated glass orbs, or stay with the lighter static wash

---

## 🧠 Key decisions & context
- **No build tool, deliberately.** User chose plain duplicated static HTML files over introducing a bundler/static-site-generator, to match the site's existing build-free style. Shared CSS/JS via plain `<link>`/`<script src>` instead (not a "build step").
- **Reduced-motion discovery:** the user's Windows machine had OS-level "Animation effects" turned off, which — via `prefers-reduced-motion: reduce` — suppressed *all* site animation, old and new. This was likely the real root cause of the original "site has no animation" complaint, separate from any code issue.
- **GitHub push requires `git@github.com-company:` SSH alias** for this repo (org-owned by `onyxtech26`), not the user's personal/`kunacosta` key — see `github-ssh-account-mapping.md` in Claude's memory.
- **Domain:** production is `https://onyxx-tech.vercel.app`.
- Site previously had a real hero-flicker bug (mix-blend-mode + scale-animated blur) that an earlier session had incorrectly written off as "the user's display, not the site" — turned out that session's claimed fix was never actually in the repo. Lesson logged in memory: verify actual file state before trusting a prior session's conclusion.

---

## 📝 Session log
- **2026-07-22** — Set up project tracking (CLAUDE.md + PROJECT_STATUS.md + docs/CHANGELOG.md). Also mid-session: full multi-page restructure, several bug fixes, animations, image optimization, and the Vercel canonical-URL fix (see Done list above for the full breakdown — this was one long continuous session).
