# CLAUDE.md — Onyxx Tech Website

Marketing website for Onyxx Tech (AI agents/chatbots/custom software studio), a static no-build HTML/CSS/JS site deployed on Vercel, repo `onyxtech26/Onyxx-Tech`.

## Session continuity & documentation
**At session start:** read `PROJECT_STATUS.md` in this folder first to restore where we left off, what's done, and what's next. Treat it as the source of truth for project state.

**Document big tasks without being asked.** When a milestone/feature/decision/multi-step task completes:
- Append a dated entry to `docs/CHANGELOG.md` (what was done, why, key decisions).
- Move the item to ✅ Done in `PROJECT_STATUS.md` and add a Session-log line.
A "big task" = something worth remembering in a month; skip routine edits and intermediate steps.

**When starting new work** add it under 🔄 In progress in `PROJECT_STATUS.md`. **When wrapping up**, refresh 📍 Where I left off and bump Last updated. Keep edits surgical.

## Project-specific notes for future sessions
- **No build tool, on purpose.** Plain `<link>`/`<script src>`, not a bundler. The seven page shells (`<head>`, nav, footer) are therefore duplicated by hand — keep that duplicated part thin and put anything shared in `styles.css` / `common.js`.
- **Pages:** `index.html` (Home — a hub with teasers), `services.html`, `why.html`, `work.html`, `process.html`, `founders.html`, `contact.html`. Clean URLs via `vercel.json`, so links are `href="services"` with no `.html`.
- **`common.js` owns all site chrome** — galaxy, cursor glow, nav, theme, reveals, line reveals, scramble, magnetic buttons, project modal, and the per-page Supabase loaders. Pages declare what they need with `<body data-page="…">` plus markup presence; they don't re-implement any of it. It loads **without `defer`** (the inline splash controller needs `window.onyxGalaxy` immediately) and **must stay an IIFE**.
- **Read `PROJECT_STATUS.md`'s "Key decisions & context" before touching animations, the nav state, or the galaxy** — several of those entries exist because the same mistake was made twice.
- **`admin.html`/`admin-login.html`/`admin-dashboard.html`/`supabase_migration.sql`** are a separate internal admin tool (Supabase-backed CMS for services/showcase projects/team/finances) — treated as mostly out of scope unless the user asks about them directly.
- **Git push requires the right SSH identity** — this repo is under the `onyxtech26` GitHub org, which needs the `git@github.com-company:` SSH host alias, not the user's personal/`kunacosta` key. See the memory file `github-ssh-account-mapping.md` (in Claude's cross-session memory, not this repo) if a push gets denied.
- **Domain:** `https://onyxx-tech.vercel.app` — used in canonical/OG tags, `sitemap.xml`, and `vercel.json`'s redirect rule.
