// ============ SHARED SITE LIBRARY ============
//
// WHY THIS FILE IS AN IIFE
// ------------------------
// This file and each page's inline <script> run as classic scripts, so their
// top-level `const`/`let` share one global lexical environment. This file once
// declared `observer`, `nav`, `cursorGlow`, `SCRAMBLE_CHARS` … at top level —
// the same names index.html declared — so the browser threw "Identifier
// 'observer' has already been declared" while *compiling* this file and none of
// it ever ran, silently, with no error at any call site.
//
// Everything therefore stays inside the IIFE and the handful of things pages
// need are published on `window` at the bottom. Adding a top-level binding here
// will silently kill the whole file again.
//
// WHY IT IS LOADED WITHOUT `defer`
// --------------------------------
// The splash controller is inline in index.html's <body> and needs
// `window.onyxGalaxy` the moment it runs — a deferred file would not exist yet.
// So this loads as a normal blocking script in <head>. Nothing here touches the
// DOM at parse time; all DOM work is behind `init()` on DOMContentLoaded.
//
// WHAT LIVES HERE
// ---------------
// All site chrome, because the site is seven static pages with no build step and
// duplicating this into each one is how it drifts: the galaxy renderer, cursor
// glow, nav, theme toggle, scroll reveals, line reveals, text scramble, magnetic
// buttons, the project modal, and the Supabase data loaders. Pages declare what
// they need with `<body data-page="…">` and markup presence; they do not
// re-implement any of it.

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

  // ================================================================
  // LOTTIE LOADER — one loading indicator for the whole site
  // ================================================================
  // Every Supabase-backed grid, the project modal and the admin tool render the
  // markup below, so "loading" looks identical everywhere. (Not the splash —
  // that animates the brand mark itself.)
  //
  // <dotlottie-player> is a custom element from a CDN module, so there are two
  // windows where it can't paint: before the module parses, and forever if the
  // CDN is blocked. `.lottie-fallback` (a pure-CSS ring) covers both. styles.css
  // shows exactly one of the two, keyed off `.lottie-ready` on <html>.
  const LOTTIE_SRC = 'images/loading.lottie';

  if (window.customElements) {
    customElements.whenDefined('dotlottie-player')
      .then(() => document.documentElement.classList.add('lottie-ready'))
      .catch(() => { /* leave the CSS fallback in place */ });
  }

  function lottieLoader(opts) {
    const o = opts || {};
    const label = o.label === undefined ? 'Loading' : o.label;
    const size = o.size || 84;
    const inline = !!o.inline;

    return `
      <div class="lottie-loader${inline ? ' is-inline' : ''}" style="--loader-size:${size}px" role="status" aria-live="polite">
        <div class="lottie-fallback" aria-hidden="true"></div>
        <dotlottie-player src="${LOTTIE_SRC}" background="transparent" speed="1" loop autoplay aria-hidden="true"></dotlottie-player>
        ${label ? `<span class="lottie-loader-label" aria-hidden="true">${label}</span>` : ''}
        <span class="sr-only">${label || 'Loading'}</span>
      </div>
    `;
  }

  function showLoader(target, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = lottieLoader(opts);
  }

  function toggleOverlayLoader(container, show) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    let overlay = el.querySelector(':scope > .lottie-overlay');
    if (show) {
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.className = 'lottie-overlay';
        overlay.innerHTML = lottieLoader({ label: '', size: 56 });
        el.appendChild(overlay);
      }
      overlay.classList.remove('is-hidden');
    } else if (overlay) {
      overlay.classList.add('is-hidden');
      setTimeout(() => overlay.remove(), 300);
    }
  }

  /** Replace a loader with real content on a fade rather than a hard cut. */
  function fadeSwap(target, html) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove('fade-swap-in');
    void el.offsetWidth;   // reflow, so refilling the same container restarts it
    el.classList.add('fade-swap-in');
  }

  /** Leave a failed fetch reading as "unavailable", never as "stuck". */
  function loaderToMessage(ids, message) {
    ids.forEach(id => {
      const el = typeof id === 'string' ? document.getElementById(id) : id;
      if (el && el.querySelector('.lottie-loader')) {
        el.innerHTML = `<p class="grid-empty">${message}</p>`;
      }
    });
  }

  // ================================================================
  // IMAGE FADE-IN
  // ================================================================
  function initImageFades(root) {
    (root || document).querySelectorAll('img[data-fade]:not(.is-loaded)').forEach(img => {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('is-loaded');
        return;
      }
      const done = () => img.classList.add('is-loaded');
      img.addEventListener('load', done, { once: true });
      // A broken image should show its alt box, not stay invisible forever.
      img.addEventListener('error', done, { once: true });
    });
  }

  // ================================================================
  // SCROLL REVEAL
  // ================================================================
  const REVEAL_SELECTOR = '.reveal, .reveal-scale, .reveal-left, .reveal-right, .reveal-blur';

  const revealObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

  function observeReveals(root) {
    (root || document).querySelectorAll(REVEAL_SELECTOR).forEach(el => {
      if (!el.classList.contains('visible')) revealObserver.observe(el);
    });
  }

  /**
   * Turn a container's direct children into a staggered entrance instead of the
   * flat all-at-once fade a single `.reveal` block gives. Each child gets
   * `.reveal` plus a `--reveal-index` that styles.css turns into a delay.
   * Safe to re-run after Supabase swaps in cards.
   */
  function initRevealGroup(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    Array.from(el.children).forEach((child, i) => {
      // Never hide the loader behind a reveal — it's the thing telling the user
      // something is happening.
      if (child.classList.contains('lottie-loader')) return;
      child.classList.add('reveal');
      child.style.setProperty('--reveal-index', i);
      if (!child.classList.contains('visible')) revealObserver.observe(child);
    });
    el.classList.add('reveal-group');
  }

  // ================================================================
  // LINE REVEAL — the masked per-line rise
  // ================================================================
  // The homepage headline's signature motion, extended to every page's header.
  // Markup is authored as `.lines > .line > span` (readable for crawlers, no
  // JS text-splitting); this only assigns `--line-index` so styles.css can
  // stagger them. Off-hero headings wait for scroll; the hero plays as soon as
  // the splash clears, which is what `html.splash-done` gates.
  function initLineReveals(root) {
    (root || document).querySelectorAll('.lines').forEach(group => {
      group.querySelectorAll(':scope > .line').forEach((line, i) => {
        line.style.setProperty('--line-index', i);
      });
      if (!group.classList.contains('lines-immediate')) {
        lineObserver.observe(group);
      }
    });
  }

  const lineObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('lines-in');
        lineObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.25 });

  // ================================================================
  // GALAXY — one renderer, three intensities
  // ================================================================
  // Previously there were two near-identical implementations (the hero's and
  // the splash's). This is the single one, used by the splash at full strength,
  // the home hero at full strength, and interior pages dialled down.
  //
  // The spiral core defaults to 78% / 32% of the canvas — the same place the
  // hero has always put it. The splash relies on that: matching core position
  // is what makes the curtain lift read as one continuous sky rather than a cut
  // between two different backgrounds. Don't change it for one caller only.
  function onyxGalaxy(canvas, opts) {
    const el = typeof canvas === 'string' ? document.querySelector(canvas) : canvas;
    if (!el || !el.getContext) return null;
    const ctx = el.getContext('2d');
    if (!ctx) return null;

    const o = opts || {};
    const bgStars = o.bgStars === undefined ? 320 : o.bgStars;
    const armStars = o.armStars === undefined ? 170 : o.armStars;
    const dustCount = o.dust === undefined ? 6 : o.dust;
    const coreX = o.coreX === undefined ? 0.78 : o.coreX;
    const coreY = o.coreY === undefined ? 0.32 : o.coreY;
    const shooting = o.shooting === undefined ? true : !!o.shooting;
    const still = o.still === undefined ? prefersReducedMotion : !!o.still;

    let stars = [], dust = [], shots = [], raf = 0, lastShot = 0, w = 0, h = 0, stopped = false;

    function size() {
      // setTransform, not scale(): scale() compounds on every resize, which is
      // what used to leave the hero canvas stuck blank after a maximise.
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = el.offsetWidth;
      h = el.offsetHeight;
      if (!w || !h) return;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function build() {
      stars = []; dust = []; shots = [];
      if (!w || !h) return;

      for (let i = 0; i < bgStars; i++) {
        stars.push({
          x: Math.random() * w, y: Math.random() * h,
          r: Math.random() * 1.4 + 0.2,
          brightness: Math.random(),
          speed: Math.random() * 0.025 + 0.008,
          offset: Math.random() * Math.PI * 2,
          color: Math.random() < 0.15 ? 'cyan' : (Math.random() < 0.1 ? 'purple' : 'white')
        });
      }

      // Two spiral arms clustered on the core.
      const cx = w * coreX, cy = h * coreY;
      for (let i = 0; i < armStars; i++) {
        const arm = Math.floor(Math.random() * 2);
        const t = Math.random();
        const ang = arm * Math.PI + t * Math.PI * 3 + (Math.random() - 0.5) * 0.7;
        const rad = t * Math.min(w * 0.22, h * 0.38) * (0.5 + Math.random() * 0.5);
        const spread = rad * 0.18;
        stars.push({
          x: cx + Math.cos(ang) * rad + (Math.random() - 0.5) * spread,
          y: cy + Math.sin(ang) * rad * 0.55 + (Math.random() - 0.5) * spread,
          r: Math.random() * 1.8 + 0.3,
          brightness: 0.5 + Math.random() * 0.5,
          speed: Math.random() * 0.03 + 0.01,
          offset: Math.random() * Math.PI * 2,
          color: Math.random() < 0.35 ? 'cyan' : (Math.random() < 0.15 ? 'purple' : 'white')
        });
      }

      for (let i = 0; i < dustCount; i++) {
        dust.push({
          x: Math.random() * w, y: Math.random() * h * 0.9,
          rx: 60 + Math.random() * 120, ry: 40 + Math.random() * 80,
          hue: Math.random() < 0.5 ? 185 : 270,
          alpha: 0.025 + Math.random() * 0.04
        });
      }
    }

    function spawnShot() {
      const ang = Math.PI * 0.18 + Math.random() * 0.2;
      shots.push({
        x: Math.random() * w * 0.85, y: Math.random() * h * 0.6,
        vx: Math.cos(ang) * (4 + Math.random() * 4),
        vy: Math.sin(ang) * (2 + Math.random() * 2),
        len: 60 + Math.random() * 80, life: 1,
        decay: 0.022 + Math.random() * 0.018
      });
    }

    function draw(ts) {
      if (stopped || !w || !h) return;
      ctx.clearRect(0, 0, w, h);

      for (let i = 0; i < dust.length; i++) {
        const c = dust[i];
        const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(c.rx, c.ry));
        g.addColorStop(0, `hsla(${c.hue}, 100%, 65%, ${c.alpha})`);
        g.addColorStop(0.5, `hsla(${c.hue}, 80%, 50%, ${c.alpha * 0.5})`);
        g.addColorStop(1, 'transparent');
        ctx.save();
        ctx.scale(1, c.ry / c.rx);
        ctx.beginPath();
        ctx.arc(c.x, c.y * (c.rx / c.ry), c.rx, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.restore();
      }

      const gx = w * coreX, gy = h * coreY;
      const core = ctx.createRadialGradient(gx, gy, 0, gx, gy, w * 0.14);
      core.addColorStop(0, 'rgba(0, 212, 255, 0.12)');
      core.addColorStop(0.4, 'rgba(80, 0, 180, 0.07)');
      core.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.ellipse(gx, gy, w * 0.14, h * 0.1, 0, 0, Math.PI * 2);
      ctx.fillStyle = core;
      ctx.fill();

      const t = ts * 0.001;
      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const flicker = still ? 1
          : 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * s.speed * 60 + s.offset));
        const a = s.brightness * flicker;
        let r, g2, b;
        if (s.color === 'cyan') { r = 0; g2 = 212; b = 255; }
        else if (s.color === 'purple') { r = 180; g2 = 80; b = 255; }
        else { r = 220; g2 = 230; b = 255; }

        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g2},${b},${a})`;
        ctx.fill();

        if (s.r > 1.0 && a > 0.5) {
          const gl = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
          gl.addColorStop(0, `rgba(${r},${g2},${b},${a * 0.35})`);
          gl.addColorStop(1, 'transparent');
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
          ctx.fillStyle = gl;
          ctx.fill();
        }
      }

      if (shooting && !still) {
        if (ts - lastShot > 2400 + Math.random() * 2000) {
          spawnShot();
          lastShot = ts;
        }
        shots = shots.filter(s => s.life > 0);
        for (let i = 0; i < shots.length; i++) {
          const s = shots[i];
          const m = Math.hypot(s.vx, s.vy);
          const tx = s.x - (s.vx / m) * s.len, ty = s.y - (s.vy / m) * s.len;
          const grad = ctx.createLinearGradient(tx, ty, s.x, s.y);
          grad.addColorStop(0, 'transparent');
          grad.addColorStop(1, `rgba(180, 240, 255, ${s.life * 0.9})`);
          ctx.beginPath();
          ctx.moveTo(tx, ty);
          ctx.lineTo(s.x, s.y);
          ctx.strokeStyle = grad;
          ctx.lineWidth = 1.2;
          ctx.stroke();
          s.x += s.vx; s.y += s.vy; s.life -= s.decay;
        }
      }

      // Reduced motion gets one frame — a real sky, just not a moving one.
      if (!still) raf = requestAnimationFrame(draw);
    }

    size();
    build();
    if (still) draw(0); else raf = requestAnimationFrame(draw);

    // Don't burn frames in a background tab.
    function onVisibility() {
      if (document.hidden) {
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
      } else if (!stopped && !still && !raf) {
        raf = requestAnimationFrame(draw);
      }
    }
    document.addEventListener('visibilitychange', onVisibility);

    let resizeTimer;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (stopped) return;
        size();
        build();
        if (still) draw(0);
      }, 150);
    }
    window.addEventListener('resize', onResize);

    return {
      stop() {
        stopped = true;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        document.removeEventListener('visibilitychange', onVisibility);
        window.removeEventListener('resize', onResize);
      },
      resize() { size(); build(); if (still) draw(0); }
    };
  }

  // ================================================================
  // MAGNETIC BUTTONS
  // ================================================================
  function initMagneticButtons(root) {
    if (!hasFinePointer || prefersReducedMotion) return;

    (root || document).querySelectorAll('.btn:not([data-magnetic])').forEach(btn => {
      btn.setAttribute('data-magnetic', '');
      let pending = false;
      let lastEvent = null;

      btn.addEventListener('mousemove', (e) => {
        lastEvent = e;
        if (pending) return;
        pending = true;
        requestAnimationFrame(() => {
          pending = false;
          const rect = btn.getBoundingClientRect();
          const x = (lastEvent.clientX - rect.left - rect.width / 2) * 0.25;
          const y = (lastEvent.clientY - rect.top - rect.height / 2) * 0.25;
          btn.style.transform = `translate(${x}px, ${y}px)`;
        });
      }, { passive: true });

      btn.addEventListener('mouseleave', () => {
        btn.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
        btn.style.transform = '';
        setTimeout(() => { btn.style.transition = ''; }, 450);
      });
    });
  }

  // ================================================================
  // CURSOR GLOW
  // ================================================================
  // The glow eases toward the pointer rather than snapping to it. `translate(-50%,
  // -50%)` after the positional translate is what centres the 400px circle on the
  // cursor — without it the element's top-left corner tracked the pointer and the
  // visible centre sat 200px down-right of it.
  //
  // Written as a transform, not left/top: left/top forced a layout every frame.
  // The loop also only runs while the pointer has actually moved, so an idle page
  // isn't spending a frame callback on a stationary circle.
  function initCursorGlow() {
    const glow = document.getElementById('cursorGlow');
    if (!glow || !hasFinePointer || prefersReducedMotion) return;

    const EASE = 0.18;
    let mx = 0, my = 0, cx = 0, cy = 0, raf = 0, seen = false;

    function draw() {
      cx += (mx - cx) * EASE;
      cy += (my - cy) * EASE;
      glow.style.transform =
        `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0) translate(-50%, -50%)`;

      // Settle exactly on the pointer, then stop until it moves again.
      if (Math.abs(mx - cx) < 0.1 && Math.abs(my - cy) < 0.1) {
        cx = mx; cy = my;
        glow.style.transform =
          `translate3d(${cx}px, ${cy}px, 0) translate(-50%, -50%)`;
        raf = 0;
        return;
      }
      raf = requestAnimationFrame(draw);
    }

    document.addEventListener('mousemove', (e) => {
      mx = e.clientX;
      my = e.clientY;
      if (!seen) {
        // Jump to the first known position instead of gliding in from 0,0.
        seen = true;
        cx = mx;
        cy = my;
      }
      if (!raf) raf = requestAnimationFrame(draw);
    }, { passive: true });
  }

  // ================================================================
  // NAV — scrolled state + mobile drawer
  // ================================================================
  // No smooth-scroll or scroll-spy any more: the site is seven real URLs, so
  // the active link is server-side truth via `aria-current="page"` in the
  // markup rather than something JS infers from scroll position.
  function initNav() {
    const nav = document.getElementById('nav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 50);
      window.addEventListener('scroll', onScroll, { passive: true });
      onScroll();
    }

    const toggle = document.getElementById('navToggle');
    const links = document.getElementById('navLinks');
    if (toggle && links) {
      toggle.addEventListener('click', () => {
        const open = links.classList.toggle('open');
        toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
      // Any navigation closes the drawer.
      links.querySelectorAll('a').forEach(a => {
        a.addEventListener('click', () => {
          links.classList.remove('open');
          toggle.setAttribute('aria-expanded', 'false');
        });
      });
    }

    // ---- Hidden entry to the admin tool: double-click the nav logo ----
    //
    // The logo is a real link to "/", and that is the whole difficulty: the
    // first click of a double-click starts navigating and tears the page down
    // before the second one can land, so a plain `dblclick` listener never
    // fires. The click is therefore intercepted and `event.detail` — the running
    // click count — decides what happens.
    //
    // ON THE HOMEPAGE this costs nothing. A logo click there has nowhere to go,
    // so it is cancelled outright (scroll to top instead) and the gesture is
    // instant with no waiting at all.
    //
    // ON OTHER PAGES a single click has to wait out HOME_DELAY before going
    // home, in case a second click is coming. 420ms covers a comfortably slow
    // double-click — a 250ms window measurably lost one taken at 320ms — while
    // staying under the OS maximum, where the lag would start to feel broken.
    const HOME_DELAY = 420;
    const onHomePage = (document.body.dataset.page || '') === 'home';

    document.querySelectorAll('.nav-logo').forEach(logo => {
      let timer = null;
      logo.title = 'Onyxx Tech — double-click for admin';

      logo.addEventListener('click', (e) => {
        // detail === 0 is keyboard activation; there is no second click coming,
        // so let the link behave normally and instantly.
        if (e.detail === 0) return;

        e.preventDefault();

        if (e.detail >= 2) {
          clearTimeout(timer);
          window.location.href = 'admin-login.html';
          return;
        }

        clearTimeout(timer);
        if (onHomePage) {
          // Already home — reloading would be pointless, so this is free.
          window.scrollTo({ top: 0, behavior: prefersReducedMotion ? 'auto' : 'smooth' });
          return;
        }
        timer = setTimeout(() => {
          window.location.href = logo.getAttribute('href') || '/';
        }, HOME_DELAY);
      });
    });

    // Same gesture on the footer mark. It is an <img> with no navigation of its
    // own, so it needs none of the above and works at any speed — kept as the
    // zero-latency route for anyone who finds it.
    document.querySelectorAll('.footer-brand-mark').forEach(mark => {
      mark.title = 'Onyxx Tech — double-click for admin';
      mark.addEventListener('dblclick', () => {
        window.location.href = 'admin-login.html';
      });
    });
  }

  // ================================================================
  // THEME
  // ================================================================
  let themeTimer;

  function updateThemeIcons() {
    const theme = document.documentElement.getAttribute('data-theme');
    const btn = document.getElementById('themeToggleBtn');
    if (!btn) return;
    const sun = btn.querySelector('.sun-icon');
    const moon = btn.querySelector('.moon-icon');
    if (sun) sun.style.display = theme === 'light' ? 'none' : 'block';
    if (moon) moon.style.display = theme === 'light' ? 'block' : 'none';
  }

  function toggleTheme() {
    const root = document.documentElement;
    const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';

    // Cross-fade the palette instead of hard-cutting. The class is only present
    // for the length of the swap — a permanent background/colour transition on
    // every card would tax ordinary scrolling for no benefit.
    if (!prefersReducedMotion) {
      root.classList.add('theme-transition');
      clearTimeout(themeTimer);
      themeTimer = setTimeout(() => root.classList.remove('theme-transition'), 500);
    }

    root.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    updateThemeIcons();
  }

  function initTheme() {
    const btn = document.getElementById('themeToggleBtn');
    if (btn) btn.addEventListener('click', toggleTheme);
    updateThemeIcons();
  }

  // ================================================================
  // TEXT SCRAMBLE — section eyebrow labels
  // ================================================================
  const SCRAMBLE_POOL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%!?';
  const SCRAMBLE_KEEP = new Set([' ', ' ', '—', '/', '.', '-', '·']);

  function scramble(el, duration) {
    const ms = duration || 1200;
    const original = el.textContent;
    let start = null;
    function frame(ts) {
      if (!start) start = ts;
      const progress = Math.min((ts - start) / ms, 1);
      const resolved = Math.floor(progress * original.length);
      el.textContent = original.split('').map((ch, i) => {
        if (SCRAMBLE_KEEP.has(ch) || i < resolved) return ch;
        return SCRAMBLE_POOL[Math.floor(Math.random() * SCRAMBLE_POOL.length)];
      }).join('');
      if (progress < 1) requestAnimationFrame(frame);
      else el.textContent = original;
    }
    requestAnimationFrame(frame);
  }

  function initScramble() {
    if (prefersReducedMotion) return;

    const obs = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          scramble(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.8 });

    document.querySelectorAll('.section-label').forEach(el => obs.observe(el));

    const heroTag = document.querySelector('.hero-tag span:last-child');
    if (heroTag) {
      // After the splash, not after load — otherwise it scrambles behind the
      // curtain and the visitor sees only the settled text.
      onSplashDone(() => setTimeout(() => scramble(heroTag, 1500), 600));
    }
  }

  // ================================================================
  // HERO ROTATOR
  // ================================================================
  // The tail of the headline cycles through phrases. Restored after being
  // dropped in e9dc5d3 for a static line.
  //
  // Starts on `.splash-done`, not on load: behind a 2.7s curtain it would
  // already be two phrases in by the time anyone saw the hero. The first swap
  // lands at ~2.8s after that, which is comfortably past the headline's own
  // entrance (line 3 settles ~1.6s in), so the first phrase is never mid-swap
  // while the line is still rising.
  const ROTATOR_MS = 2800;

  function initHeroRotator() {
    const rot = document.getElementById('heroRotator');
    if (!rot) return;

    const words = Array.from(rot.querySelectorAll('.rotator-word'));
    // Nothing to cycle, and reduced motion keeps whichever phrase is marked
    // active in the markup.
    if (words.length < 2 || prefersReducedMotion) return;

    let i = words.findIndex(w => w.classList.contains('is-active'));
    if (i < 0) i = 0;
    let timer = 0;

    function step() {
      const outgoing = words[i];
      i = (i + 1) % words.length;
      const incoming = words[i];

      outgoing.classList.remove('is-active');
      outgoing.classList.add('is-leaving');
      incoming.classList.add('is-active');
      // Drop the exit state once it has played, so the word is back to its
      // waiting position (below) before its next turn comes round.
      setTimeout(() => outgoing.classList.remove('is-leaving'), 750);
    }

    function play() { if (!timer) timer = setInterval(step, ROTATOR_MS); }
    function pause() { clearInterval(timer); timer = 0; }

    onSplashDone(play);

    // Don't cycle text nobody is looking at.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else if (document.documentElement.classList.contains('splash-done')) play();
    });
  }

  // ================================================================
  // SPLASH COORDINATION
  // ================================================================
  // `html.splash-done` is the site's "the visitor can see the page now" signal.
  // Pages with no splash set it in their <head> bootstrap, so hero entrances
  // play immediately there. index.html's controller sets it when the curtain
  // starts lifting. Anything that should not animate behind the curtain hangs
  // off this.
  function onSplashDone(fn) {
    if (document.documentElement.classList.contains('splash-done')) {
      fn();
      return;
    }
    const root = document.documentElement;
    const obs = new MutationObserver(() => {
      if (root.classList.contains('splash-done')) {
        obs.disconnect();
        fn();
      }
    });
    obs.observe(root, { attributes: true, attributeFilter: ['class'] });
  }

  // ================================================================
  // PROJECT MODAL — work.html only
  // ================================================================
  function initProjectModal() {
    const overlay = document.getElementById('projectModal');
    if (!overlay) return null;

    const closeBtn = document.getElementById('modalClose');
    const cta = document.getElementById('modalCta');

    function open(card) {
      const d = card.dataset;
      const img = document.getElementById('modalImg');
      const thumbBg = document.getElementById('modalThumbBg');
      const thumbLabel = document.getElementById('modalThumbLabel');
      const cardImg = card.querySelector('.project-thumb img');

      if (d.img || cardImg) {
        const src = d.img || cardImg.src;
        img.alt = d.name || '';
        img.style.display = 'block';
        thumbBg.style.display = 'none';

        // Full-resolution modal images can lag well behind the modal opening,
        // so cover the thumb until it decodes — the panel never opens onto an
        // empty rectangle.
        const thumb = img.closest('.modal-thumb');
        if (img.src !== src) {
          toggleOverlayLoader(thumb, true);
          img.addEventListener('load', () => toggleOverlayLoader(thumb, false), { once: true });
          img.addEventListener('error', () => toggleOverlayLoader(thumb, false), { once: true });
          img.src = src;
        } else {
          toggleOverlayLoader(thumb, false);
        }
      } else {
        img.style.display = 'none';
        thumbBg.style.background = d.gradient || 'var(--onyx-soft)';
        thumbBg.style.display = 'flex';
        thumbLabel.textContent = d.name || '';
      }

      document.getElementById('modalCategory').textContent = d.category || '';
      document.getElementById('modalTitle').textContent = d.name || '';
      document.getElementById('modalClient').textContent = d.client || '';
      document.getElementById('modalDesc').textContent = d.desc || '';

      const stackEl = document.getElementById('modalStack');
      stackEl.innerHTML = (d.stack || '').split(',').filter(s => s.trim())
        .map(s => `<span>${s.trim()}</span>`).join('');

      const gh = document.getElementById('modalGithub');
      if (d.github) {
        gh.href = d.github;
        gh.style.display = 'inline-flex';
      } else {
        gh.style.display = 'none';
      }

      overlay.classList.add('open');
      document.body.style.overflow = 'hidden';
    }

    function close() {
      overlay.classList.remove('open');
      document.body.style.overflow = '';
    }

    closeBtn?.addEventListener('click', close);
    cta?.addEventListener('click', close);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

    return { open, close };
  }

  /**
   * Click-to-open plus the 3D tilt/glare on a project card.
   * `modal` may be null (home's teaser cards link through to /work instead).
   */
  function initProjectCard(card, modal) {
    if (modal) card.addEventListener('click', () => modal.open(card));
    if (!hasFinePointer || prefersReducedMotion) return;

    const glare = document.createElement('div');
    glare.style.cssText =
      'position:absolute;inset:0;pointer-events:none;z-index:5;opacity:0;transition:opacity 0.3s ease;';
    card.appendChild(glare);

    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      card.style.transition = 'transform 0.1s ease, background 0.4s ease, box-shadow 0.4s ease';
      // The translateY is the same lift `.project-card:hover` gives every other
      // card. It has to be baked into this string: an inline transform beats the
      // stylesheet outright, so a tilt written alone would cancel the lift.
      card.style.transform =
        `perspective(900px) translateY(-6px) rotateX(${(y - 0.5) * -10}deg) rotateY(${(x - 0.5) * 10}deg)`;
      glare.style.opacity = '1';
      glare.style.background =
        `radial-gradient(circle at ${x * 100}% ${y * 100}%, rgba(56,224,255,0.06) 0%, transparent 65%)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transition = 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s ease, box-shadow 0.4s ease';
      card.style.transform = '';
      glare.style.opacity = '0';
    });
  }

  // ================================================================
  // SUPABASE
  // ================================================================
  const SUPABASE_URL = 'https://whjstsgtximknicppllt.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoanN0c2d0eGlta25pY3BwbGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTc5NzgsImV4cCI6MjA5ODM3Mzk3OH0.I_GHJG8XcyFO_WamEwWnme_-l1ZPUCUCuZ7roOE-B2U';

  let client = null;
  function supabase() {
    if (client) return client;
    if (!window.supabase) return null;
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return client;
  }

  // ---- service cards ----
  const SERVICE_ICONS = {
    '/01': `<svg class="service-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">
      <circle cx="24" cy="24" r="6"/><circle cx="24" cy="8" r="3"/><circle cx="24" cy="40" r="3"/>
      <circle cx="8" cy="24" r="3"/><circle cx="40" cy="24" r="3"/>
      <line x1="24" y1="11" x2="24" y2="18"/><line x1="24" y1="30" x2="24" y2="37"/>
      <line x1="11" y1="24" x2="18" y2="24"/><line x1="30" y1="24" x2="37" y2="24"/>
    </svg>`,
    '/02': `<svg class="service-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">
      <path d="M8 12 L40 12 L40 32 L24 32 L16 40 L16 32 L8 32 Z"/>
      <circle cx="18" cy="22" r="1.5" fill="currentColor"/><circle cx="24" cy="22" r="1.5" fill="currentColor"/>
      <circle cx="30" cy="22" r="1.5" fill="currentColor"/>
    </svg>`,
    '/03': `<svg class="service-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="6" y="10" width="36" height="28" rx="2"/><line x1="6" y1="18" x2="42" y2="18"/>
      <circle cx="11" cy="14" r="0.8" fill="currentColor"/><circle cx="14" cy="14" r="0.8" fill="currentColor"/>
      <line x1="12" y1="26" x2="36" y2="26"/><line x1="12" y1="32" x2="28" y2="32"/>
    </svg>`,
    '/04': `<svg class="service-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">
      <rect x="14" y="6" width="20" height="36" rx="2"/><line x1="14" y1="12" x2="34" y2="12"/>
      <line x1="14" y1="36" x2="34" y2="36"/><circle cx="24" cy="39" r="0.8" fill="currentColor"/>
    </svg>`
  };

  const SERVICE_ICON_DEFAULT = `<svg class="service-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="1.2">
    <circle cx="24" cy="24" r="10"/><path d="M24 10 L24 38 M10 24 L38 24 M14 14 L34 34 M14 34 L34 14"/>
  </svg>`;


  /**
   * Escape a value before it is interpolated into an innerHTML template.
   *
   * Card markup below is built from database strings — service names, project
   * titles, client names, team emails. Without this, an "&" in a company name
   * produces broken markup and a value containing a tag executes in every
   * visitor's browser. Applies to attribute positions too, hence the quote
   * escaping.
   */
  function esc(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderServices(grid, services, limit) {
    if (!grid) return;
    const list = limit ? services.slice(0, limit) : services;
    grid.innerHTML = '';
    list.forEach(s => {
      const num = s.num || '/00';
      const tags = Array.isArray(s.tags)
        ? s.tags.map(t => `<span class="service-tag">${esc(t)}</span>`).join('') : '';
      const card = document.createElement('div');
      card.className = 'service-card';
      card.setAttribute('data-service', '');
      card.innerHTML = `
        <div class="service-num">${esc(num)}</div>
        ${SERVICE_ICONS[num] || SERVICE_ICON_DEFAULT}
        <h3 class="service-name">${esc(s.name)}</h3>
        <p class="service-desc">${esc(s.description)}</p>
        <div class="service-tags">${tags}</div>
      `;
      grid.appendChild(card);
    });
    initServiceCardGlow(grid);
  }

  /** Cursor-tracked highlight inside each service card. */
  function initServiceCardGlow(root) {
    if (!hasFinePointer) return;
    (root || document).querySelectorAll('[data-service]:not([data-glow])').forEach(card => {
      card.setAttribute('data-glow', '');
      card.addEventListener('mousemove', (e) => {
        const rect = card.getBoundingClientRect();
        card.style.setProperty('--mx', ((e.clientX - rect.left) / rect.width) * 100 + '%');
        card.style.setProperty('--my', ((e.clientY - rect.top) / rect.height) * 100 + '%');
      }, { passive: true });
    });
  }

  // ---- project cards ----
  // showcase_projects.image_url points at the Supabase storage originals, which
  // are 5-8MB PNGs. This maps them to the optimised local copies.
  //
  // It had drifted badly: two keys matched nothing at all (those rows were
  // re-uploaded and got new filenames), so only 3 of the 10 projects resolved
  // locally and /work was pulling ~28MB. The three that did resolve pointed at
  // the heavy .png/.jpg while an optimised .webp sat beside it on disk —
  // xcraft.png is 1,032,816 B against xcraft.webp's 25,832 B, a 40x difference.
  //
  // Now: all 9 available locals, every one a .webp. Total ~520KB.
  //
  // This map is keyed on an upload filename, so it breaks SILENTLY every time
  // someone re-uploads an image through the admin tool — the page just gets
  // slower, nothing errors. Verify against the live rows when touching it:
  //   GET /rest/v1/showcase_projects?select=title,image_url
  const LOCAL_IMAGE_MAP = {
    '1783223293991_9suav.png':  'images/Policy_Snap.webp',
    '1783350472356_oftj.png':   'images/SunToursRoma.webp',
    '1783351117063_6olrku.png': 'images/Conglomerate.webp',
    '1783223786542_nzlr5n.png': 'images/Carousel_Maker.webp',
    '1783223708224_314sh7.png': 'images/Walletwise.webp',
    '1783223573215_jmhlwn.png': 'images/xcraft.webp',
    '1783356161162_kajzr.png':  'images/LogicLens.webp',
    '1783522411782_gr7p72.png': 'images/Watch_bot.webp',
    '1783522442252_m3w30f.png': 'images/Mpt.webp'
    // POS System (1784540735392_9327ps.png) has no local copy, but the original
    // is only 28KB, so it is left to load from storage.
  };

  function projectImage(p) {
    if (!p || !p.image_url) return '';
    for (const key in LOCAL_IMAGE_MAP) {
      if (p.image_url.includes(key)) return LOCAL_IMAGE_MAP[key];
    }
    return p.image_url;
  }

  const CARD_GRADIENTS = [
    'linear-gradient(145deg, #0c1829, #1a2d50)',
    'linear-gradient(145deg, #1a0e00, #3d2200)',
    'linear-gradient(145deg, #001319, #012b38)',
    'linear-gradient(145deg, #001208, #002914)',
    'linear-gradient(145deg, #110820, #1e1038)',
    'linear-gradient(145deg, #0d1a00, #1a2e00)'
  ];

  /**
   * @param {Object} opts
   * @param {number} [opts.limit]      Cap the number rendered.
   * @param {Object} [opts.modal]      Modal API; when absent cards link to /work.
   * @param {string} [opts.linkTo]     Wrap each card in a link to this URL.
   */
  function renderProjects(grid, projects, opts) {
    if (!grid) return;
    const o = opts || {};
    const list = o.limit ? projects.slice(0, o.limit) : projects;
    grid.innerHTML = '';

    list.forEach((p, idx) => {
      const grad = CARD_GRADIENTS[idx % CARD_GRADIENTS.length];
      const stack = Array.isArray(p.tech_stack) ? p.tech_stack.join(', ') : '';
      const tags = Array.isArray(p.tech_stack)
        ? p.tech_stack.slice(0, 3).map(t => `<span class="project-tag">${esc(t)}</span>`).join('') : '';

      let thumb;
      if (p.image_url) {
        const url = projectImage(p);
        const contain = /portal|mpt/i.test(p.title || '');
        thumb = `<div class="project-thumb${contain ? ' project-thumb--contain' : ''}" style="background:${grad}">
          <img src="${esc(url)}" alt="${esc(p.title)}" data-fade loading="lazy" decoding="async"
               onerror="this.onerror=null;this.src='images/onyxx_logo_transparent.png';">
        </div>`;
      } else {
        thumb = `<div class="project-thumb"><div class="project-thumb-bg" style="background:${grad}">
          <span class="project-thumb-label">${esc(p.title)}</span></div></div>`;
      }

      const body = `
        ${thumb}
        <div class="project-body">
          <div class="project-category">${esc(p.category)}</div>
          <div class="project-name">${esc(p.title)}</div>
          <div class="project-client">${esc(p.client)}</div>
          <p class="project-desc">${esc(p.description)}</p>
          <div class="project-footer">
            <div class="project-tags">${tags}</div>
            <span class="project-more">${o.linkTo ? 'View' : 'Details'} →</span>
          </div>
        </div>`;

      let card;
      if (o.linkTo) {
        // Home's teasers are real links, so they work without JS and get the
        // browser's own affordances; only /work opens the modal.
        card = document.createElement('a');
        card.href = o.linkTo;
        card.className = 'project-card project-card--link';
      } else {
        // /work opens a modal rather than navigating, so there is no href to
        // hang this on — but a bare <div> with only a click listener made the
        // entire case-study content mouse-only, while the page header tells
        // people to "click any project to see the full story". A real <button>
        // gets focus, Enter and Space for free.
        card = document.createElement('button');
        card.type = 'button';
        card.className = 'project-card';
        card.setAttribute('aria-haspopup', 'dialog');
        card.setAttribute('aria-label', `${p.title || 'Project'} — view details`);
      }

      if (p.image_url) card.setAttribute('data-img', projectImage(p));
      card.setAttribute('data-category', p.category || '');
      card.setAttribute('data-name', p.title || '');
      card.setAttribute('data-client', p.client || '');
      card.setAttribute('data-desc', p.description || '');
      card.setAttribute('data-stack', stack);
      card.setAttribute('data-gradient', grad);
      if (p.github_url) card.setAttribute('data-github', p.github_url);
      if (p.live_url) card.setAttribute('data-live', p.live_url);

      card.innerHTML = body;
      grid.appendChild(card);
      initProjectCard(card, o.modal);
    });
  }

  // ---- team cards ----
  const WA_ICON = `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.7-.8-1.9-.9-.3-.1-.5-.1-.7.1-.2.3-.7.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.4-2.3-1.4-.8-.8-1.4-1.7-1.6-2-.2-.3 0-.4.1-.6.1-.1.3-.3.4-.5.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5 0-.1-.7-1.6-.9-2.2-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.4 0 1.4 1 2.8 1.2 3 .1.2 2 3 4.8 4.2.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.3.2-.7.2-1.2.2-1.3-.1-.1-.3-.2-.6-.3z"/><path d="M20.5 3.5C18.2 1.2 15.2 0 12 0 5.4 0 0 5.4 0 12c0 2.1.6 4.2 1.6 6L0 24l6.2-1.6c1.7.9 3.7 1.4 5.7 1.4 6.6 0 12-5.4 12-12 0-3.2-1.2-6.2-3.4-8.3zM12 21.8c-1.8 0-3.6-.5-5.2-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.3 0-5.5 4.5-10 10-10 2.7 0 5.2 1 7.1 2.9 1.9 1.9 2.9 4.4 2.9 7.1 0 5.5-4.5 10-10 10z"/></svg>`;
  const MAIL_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><polyline points="22,6 12,13 2,6"/></svg>`;

  function renderTeam(grid, members) {
    // The grid ships static founder cards as an SEO/no-JS fallback, so an empty
    // result must leave them alone rather than blanking the section.
    if (!grid || !members || members.length === 0) return;
    grid.innerHTML = '';

    members.forEach(t => {
      const avatar = t.avatar_url || 'images/onyxx_logo_transparent.png';
      const waClean = t.whatsapp ? t.whatsapp.replace(/[^0-9+]/g, '').replace(/^\+/, '') : '';
      const card = document.createElement('div');
      card.className = 'founder-card';
      card.innerHTML = `
        <div class="founder-avatar"><img src="${esc(avatar)}" alt="${esc(t.name)}" data-fade loading="lazy" decoding="async"
             onerror="this.onerror=null;this.src='images/onyxx_logo_transparent.png';"></div>
        <h3 class="founder-name">${esc(t.name)}</h3>
        <div class="founder-role">${esc(t.role)}</div>
        <div class="founder-contact">
          ${waClean ? `<a href="https://wa.me/${esc(waClean)}" target="_blank" rel="noopener">${WA_ICON}${esc(t.whatsapp)}</a>` : ''}
          ${t.email ? `<a href="mailto:${esc(t.email)}">${MAIL_ICON}${esc(t.email)}</a>` : ''}
        </div>`;
      grid.appendChild(card);
    });
  }

  /** Re-apply the site's entrance/hover behaviour to freshly injected cards. */
  function refresh(container) {
    initRevealGroup(container);
    initImageFades(container);
    initMagneticButtons(container);
  }

  // ================================================================
  // PER-PAGE DATA
  // ================================================================
  // Each page fetches only the tables it renders — the single-page version used
  // to pull all three on every load.
  async function loadPageData() {
    const page = document.body.dataset.page || '';
    const db = supabase();

    const servicesGrid = document.getElementById('servicesGrid');
    const projectsGrid = document.getElementById('projectsGrid');
    const teamGrid = document.querySelector('.founders-grid');

    const wants = {
      services: !!servicesGrid,
      projects: !!projectsGrid,
      team: !!teamGrid
    };
    if (!wants.services && !wants.projects && !wants.team) return;

    if (!db) {
      loaderToMessage([servicesGrid, projectsGrid].filter(Boolean),
        'Content is taking a moment to load. Please refresh.');
      return;
    }

    // Only cover grids that are genuinely empty until Supabase answers. The
    // founders grid has static cards already, so a spinner there would hide
    // content that is present.
    if (wants.services && servicesGrid.children.length === 0) {
      showLoader(servicesGrid, { label: 'Loading services' });
    }
    if (wants.projects && projectsGrid.children.length === 0) {
      showLoader(projectsGrid, { label: 'Loading work' });
    }

    try {
      const jobs = [];
      if (wants.services) jobs.push(db.from('services').select('*').order('num'));
      if (wants.projects) jobs.push(db.from('showcase_projects').select('*').order('created_at', { ascending: false }));
      if (wants.team) jobs.push(db.from('team_members').select('*').order('created_at', { ascending: true }));

      const results = await Promise.all(jobs);
      let i = 0;

      if (wants.services) {
        const res = results[i++];
        if (res.error) console.error('services:', res.error);
        renderServices(servicesGrid, res.data || [], page === 'home' ? 4 : 0);
        refresh(servicesGrid);
      }

      if (wants.projects) {
        const res = results[i++];
        if (res.error) console.error('showcase:', res.error);
        const all = res.data || [];
        if (page === 'home') {
          renderProjects(projectsGrid, all, { limit: 3, linkTo: 'work' });
        } else {
          const modal = initProjectModal();
          renderProjects(projectsGrid, all, { modal });
          initShowMore(projectsGrid, all, modal);
        }
        refresh(projectsGrid);
      }

      if (wants.team) {
        const res = results[i++];
        if (res.error) console.error('team:', res.error);
        renderTeam(teamGrid, res.data || []);
        refresh(teamGrid);
      }
    } catch (err) {
      console.error('page data:', err);
      loaderToMessage([servicesGrid, projectsGrid].filter(Boolean),
        'Content is taking a moment to load. Please refresh.');
    }
  }

  /** work.html shows six, then reveals the rest. */
  function initShowMore(grid, all, modal) {
    const wrap = document.getElementById('showMoreContainer');
    const btn = document.getElementById('btnToggleShowcase');
    if (!wrap || !btn) return;

    if (all.length <= 6) {
      wrap.style.display = 'none';
      renderProjects(grid, all, { modal });
      refresh(grid);
      return;
    }

    let expanded = false;
    const label = btn.querySelector('span');
    const arrow = btn.querySelector('.arrow');

    function paint() {
      renderProjects(grid, all, { modal, limit: expanded ? 0 : 6 });
      refresh(grid);
      if (label) label.textContent = expanded ? 'Show Less' : 'Show More';
      if (arrow) arrow.style.transform = expanded ? 'rotate(180deg)' : '';
    }

    wrap.style.display = 'flex';
    paint();

    btn.addEventListener('click', () => {
      expanded = !expanded;
      paint();
      if (!expanded) grid.scrollIntoView({ behavior: prefersReducedMotion ? 'auto' : 'smooth', block: 'start' });
    });
  }

  // ================================================================
  // BACKGROUND GALAXY
  // ================================================================
  // Home's hero runs the full sky. Every other page gets the same renderer
  // dialled down behind the content — it replaces the old fixed gridlines with
  // something on-brand instead of leaving interior pages flat.
  function initBackgroundGalaxy() {
    const hero = document.getElementById('circuitCanvas');
    if (hero) {
      onyxGalaxy(hero, { bgStars: 350, armStars: 180 });

      // Fade the sky out as the hero scrolls away.
      const section = hero.closest('.hero');
      if (section && !prefersReducedMotion) {
        window.addEventListener('scroll', () => {
          const fade = Math.max(0, 1 - window.scrollY / (section.offsetHeight * 0.5));
          hero.style.opacity = fade * 0.85;
        }, { passive: true });
      }
      return;
    }

    const page = document.getElementById('pageGalaxy');
    if (page) {
      onyxGalaxy(page, {
        bgStars: 170,
        armStars: 90,
        dust: 4,
        shooting: false     // a shooting star behind body copy pulls the eye off it
      });
    }
  }

  // ================================================================
  // BOOT
  // ================================================================
  function init() {
    initCursorGlow();
    initNav();
    initTheme();
    initBackgroundGalaxy();
    observeReveals();
    document.querySelectorAll('.reveal-group').forEach(initRevealGroup);
    initLineReveals();
    initHeroRotator();
    initImageFades();
    initMagneticButtons();
    initServiceCardGlow();
    initScramble();
    loadPageData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---- Public surface ----
  window.lottieLoader = lottieLoader;
  window.showLoader = showLoader;
  window.fadeSwap = fadeSwap;
  window.toggleOverlayLoader = toggleOverlayLoader;
  window.initImageFades = initImageFades;
  window.observeReveals = observeReveals;
  window.initRevealGroup = initRevealGroup;
  window.initMagneticButtons = initMagneticButtons;
  window.initLineReveals = initLineReveals;
  window.onyxGalaxy = onyxGalaxy;
  window.onSplashDone = onSplashDone;
  window.toggleTheme = toggleTheme;
})();
