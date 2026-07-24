// ============ SHARED SITE LIBRARY ============
//
// WHY THIS FILE IS AN IIFE
// ------------------------
// This file and index.html's inline <script> both run as classic scripts, so
// their top-level `const`/`let` share one global lexical environment. This
// file used to declare `observer`, `nav`, `cursorGlow`, `SCRAMBLE_CHARS` …
// at top level — the same names the inline script declares — so the browser
// threw "Identifier 'observer' has already been declared" while *compiling*
// this file, and none of it ever ran. The duplication of cursor glow, nav,
// scramble and theme logic inside index.html is what masked it.
//
// Wrapping everything in an IIFE removes the collision permanently: nothing
// here reaches the global lexical scope, and the handful of things other
// scripts need are published explicitly on `window` at the bottom.
//
// WHAT LIVES HERE vs. IN index.html
// ---------------------------------
// index.html owns page chrome it implements more richly inline (cursor glow,
// eased smooth-scroll + active-nav tracking, mobile nav, text scramble,
// theme toggle, the hero galaxy canvas, the project modal, Supabase).
// This file owns cross-cutting behaviour that isn't page-specific:
//   • the shared dotLottie loading indicator
//   • image fade-in
//   • scroll-reveal helpers (incl. the staggered `.reveal-group` contract)
//   • magnetic buttons
// Duplicating any of the index.html-owned behaviour here would double-bind
// its listeners, so don't.

(function () {
  'use strict';

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

  // ================================================================
  // LOTTIE LOADER — one loading indicator for the whole site
  // ================================================================
  // The splash screen, every Supabase-backed grid, the project modal and
  // form submits all render the markup below, so "loading" looks identical
  // everywhere.
  //
  // <dotlottie-player> is a custom element from a CDN module, so there are
  // two windows where it can't paint: before the module parses, and forever
  // if the CDN is blocked. `.lottie-fallback` (a pure-CSS ring) covers both.
  // styles.css shows exactly one of the two, keyed off the `.lottie-ready`
  // class set on <html> once the element actually upgrades.
  const LOTTIE_SRC = 'images/loading.lottie';

  if (window.customElements) {
    customElements.whenDefined('dotlottie-player')
      .then(() => document.documentElement.classList.add('lottie-ready'))
      .catch(() => { /* leave the CSS fallback in place */ });
  }

  /**
   * Markup for the shared loader.
   * @param {Object}  [opts]
   * @param {string}  [opts.label]  Caption under the animation; '' for none.
   * @param {number}  [opts.size]   Pixel size of the animation.
   * @param {boolean} [opts.inline] Row layout, for use inside a button.
   * @returns {string} HTML
   */
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

  /** Drop the loader into a container, replacing whatever is there. */
  function showLoader(target, opts) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = lottieLoader(opts);
  }

  /**
   * Swap a container's contents with a fade instead of a hard cut — used
   * wherever JS replaces a loader with real content.
   */
  function fadeSwap(target, html) {
    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) return;
    el.innerHTML = html;
    el.classList.remove('fade-swap-in');
    // Force a reflow so re-adding the class restarts the animation even when
    // the same container is refilled twice in a row.
    void el.offsetWidth;
    el.classList.add('fade-swap-in');
  }

  /**
   * Show/hide a full-surface loading overlay inside a positioned container
   * (the project modal uses this while its image decodes).
   */
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

  // ================================================================
  // IMAGE FADE-IN
  // ================================================================
  // Any <img data-fade> starts transparent (styles.css) and fades in once it
  // decodes. Re-runnable so images injected later by Supabase renders are
  // covered too.
  function initImageFades(root) {
    (root || document).querySelectorAll('img[data-fade]:not(.is-loaded)').forEach(img => {
      if (img.complete && img.naturalWidth > 0) {
        img.classList.add('is-loaded');
        return;
      }
      const done = () => img.classList.add('is-loaded');
      img.addEventListener('load', done, { once: true });
      // Don't leave a broken image permanently invisible — an alt-text box
      // is more useful than a blank gap.
      img.addEventListener('error', done, { once: true });
    });
  }

  // ================================================================
  // SCROLL REVEAL
  // ================================================================
  // `.reveal` is the default fade+rise. The `-scale`/`-left`/`-right`/`-blur`
  // variants in styles.css share the same `.visible` toggle, so one observer
  // drives all five.
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
   * Turn a container's direct children into a staggered, one-after-another
   * entrance instead of the flat all-at-once fade a single `.reveal` block
   * gives. Each child gets `.reveal` (so it's driven by the observer above
   * and still waits until it's scrolled to) plus a `--reveal-index` custom
   * property that styles.css turns into an incremental transition-delay.
   *
   * Safe to re-run after Supabase swaps in dynamically-loaded cards.
   */
  function initRevealGroup(container) {
    const el = typeof container === 'string' ? document.querySelector(container) : container;
    if (!el) return;
    Array.from(el.children).forEach((child, i) => {
      // Never hide the loader behind a reveal — it's the thing telling the
      // user something is happening.
      if (child.classList.contains('lottie-loader')) return;
      child.classList.add('reveal');
      child.style.setProperty('--reveal-index', i);
      if (!child.classList.contains('visible')) revealObserver.observe(child);
    });
    el.classList.add('reveal-group');
  }

  // ================================================================
  // MAGNETIC BUTTONS
  // ================================================================
  // Buttons drift toward the cursor while it's over them. rAF-throttled so
  // rapid mousemove events collapse to one transform write per frame.
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
        // Let it spring back rather than snap; cleared on transitionend so
        // the inline style doesn't fight :active/:hover rules afterwards.
        btn.style.transition = 'transform 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)';
        btn.style.transform = '';
        setTimeout(() => { btn.style.transition = ''; }, 450);
      });
    });
  }

  // ================================================================
  // BOOT
  // ================================================================
  function init() {
    observeReveals();
    document.querySelectorAll('.reveal-group').forEach(initRevealGroup);
    initImageFades();
    initMagneticButtons();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // ---- Public surface ----
  // Page-specific scripts re-run these after injecting content.
  window.lottieLoader = lottieLoader;
  window.showLoader = showLoader;
  window.fadeSwap = fadeSwap;
  window.toggleOverlayLoader = toggleOverlayLoader;
  window.initImageFades = initImageFades;
  window.observeReveals = observeReveals;
  window.initRevealGroup = initRevealGroup;
  window.initMagneticButtons = initMagneticButtons;
})();

// ============ SPLASH SCREEN ============
// The splash controller lives in index.html's inline <script>, immediately
// after the markup, so it runs on first parse rather than waiting for this
// deferred file — a splash that needs a deferred script to leave can hang
// visible if that script is slow or fails. `window.hideSplashScreen` is
// published there; call it from anywhere to dismiss early.
