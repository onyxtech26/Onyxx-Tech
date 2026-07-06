# Onyxx Tech — Website

Single-page site for Onyxx Tech, ready to deploy on GitHub Pages.

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
2. Drag in `index.html` and `onyxx-banner.png`
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

Everything is in **one file**: `index.html`. Open it in any text editor (VS Code recommended).

### Common edits:

**Change the projects (Work section):**
Find `<!-- TIP: Replace these with real project titles -->` in the HTML. Update the three `.work-item` blocks below it.

**Add a LinkedIn URL:**
Search for `nav-links` and add a new `<li>` with your LinkedIn link, or add it to the founder cards.

**Change colors:**
At the top of the `<style>` section, modify the CSS variables:
- `--accent: #00d4ff;` → change to any hex color
- `--onyx: #0a0a0a;` → background color

**Change the rotating words in the hero:**
Search for `class="rotator-word"` — you'll find 4 phrases. Edit them to whatever you want.

**Update tagline / headline:**
Search for `We build the` to find the hero headline. Edit the text directly.

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

Built with ❤️ for the Onyxx Tech launch.
