# Onyxx Tech Hub — Website

Multi-page site for Onyxx Tech Hub, ready to deploy on GitHub Pages. No build step — plain HTML/CSS/JS, `<link>`/`<script src>` shared assets.

**Pages:** `index.html` (Home/Hero), `services.html`, `why.html`, `work.html`, `process.html`, `founders.html`, `contact.html`.
**Shared assets:** `styles.css` (all site CSS), `common.js` (shared chrome: nav, theme toggle, cursor glow, reveal-on-scroll, etc — loaded by every page). Page-specific behavior (the hero starfield canvas, live Supabase data for Services/Work) lives in an inline `<script>` at the bottom of that page only.

`services.html` and `work.html` ship real static fallback content (not JS-only) so search crawlers and no-JS visitors see real content immediately; a Supabase fetch then enhances/replaces it with the latest live data.

---

## 🚀 Deploy to GitHub Pages (5 minutes)

### Step 1: Create the GitHub repo
1. Go to [github.com/new](https://github.com/new)
2. Name it: `onyxx-tech` (or `kunacosta.github.io` for a cleaner URL)
3. Set to **Public**
4. Click **Create repository**

### Step 2: Upload the files
**Easy way (browser):**
1. On the new repo page, click **uploading an existing file**
2. Drag in all the `.html` files, `styles.css`, `common.js`, `sitemap.xml`, `robots.txt`, and the `images/` folder
3. Click **Commit changes**

**Git way (terminal):**
```bash
git clone https://github.com/YOUR_USERNAME/onyxx-tech.git
cd onyxx-tech
# copy index.html and onyxx-banner.png into this folder
git add .
git commit -m "Initial site"
git push
```

### Step 3: Enable GitHub Pages
1. In the repo, go to **Settings → Pages**
2. Under **Source**, pick **Deploy from a branch**
3. Branch: `main`, folder: `/ (root)`
4. Click **Save**

### Step 4: Get your URL
After ~1 minute, your site will be live at:
- `https://YOUR_USERNAME.github.io/onyxx-tech/` (if repo named onyxx-tech)
- `https://YOUR_USERNAME.github.io/` (if repo named YOUR_USERNAME.github.io)

That's the link to share on LinkedIn. 🎉

---

## ✏️ Editing Later

Each section now lives on its own page (see the list above). Shared chrome (nav, footer, colors, fonts) lives in `styles.css` and `common.js` — edit those once and every page picks it up.

### Common edits:

**Change the projects (Work section):**
The Supabase `showcase_projects` table is the live source of truth — edit it there. `work.html` also has a hand-written static fallback grid (`#projectsGrid`) for SEO/no-JS visitors; keep it roughly in sync if you change the featured projects.

**Add a LinkedIn URL:**
Search `common.js`/each page for `nav-links` and add a new `<li>` with your LinkedIn link, or add it to the founder cards in `founders.html`.

**Change colors:**
At the top of `styles.css`, modify the CSS variables:
- `--accent: #38e0ff;` → change to any hex color
- `--onyx: #0a0a0a;` → background color

**Change the rotating words in the hero:**
In `index.html`, search for `class="rotator-word"` — you'll find 4 phrases. Edit them to whatever you want.

**Update tagline / headline:**
In `index.html`, search for `We build the` to find the hero headline. Edit the text directly.

---

## 🎨 What's Included

- **Hero section** with animated circuit-node background, rotating headline text, pulsing accent dot
- **Services grid** (4 cards: AI Agents, Chatbots, Custom Software, Web & Apps) with cursor-tracking glow
- **Why Onyxx** — 3 differentiators
- **Work** — 3 placeholder project entries with hover animation
- **Process** — 4-step Discover → Design → Build → Deploy flow
- **Founders** — Cards for Kunacosta and Rooben with WhatsApp + email links
- **Contact CTA** with pre-filled WhatsApp messages
- **Fully responsive** — mobile, tablet, desktop
- **SEO meta tags** — when shared on LinkedIn, the preview shows your logo + tagline
- **Custom cursor glow** on desktop
- **Subtle noise texture and grid** for visual depth
- **Smooth scroll** with reveal-on-scroll animations

---

## 📞 Pre-Configured Contact

- **Email:** onyxtech26@gmail.com (mailto link with pre-filled subject)
- **Kunacosta WhatsApp:** +60 11-3988 4927 (wa.me link with pre-filled message)
- **Rooben WhatsApp:** +60 19-468 8052 (wa.me link with pre-filled message)

---

## 🔧 Tech Notes

- **Zero dependencies** — pure HTML/CSS/JS, no build step
- **Loads fast** — Google Fonts are the only external request
- **Accessible** — respects `prefers-reduced-motion`
- **No tracking** — clean and private out of the box

Built with ❤️ for the Onyxx Tech Hub launch.
