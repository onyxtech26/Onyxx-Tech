// ============ SHARED SITE CHROME ============
// Behavior common to every page: cursor glow, nav scroll state, mobile nav,
// scroll-reveal, text scramble, magnetic buttons, theme toggle. Page-specific
// behavior (hero galaxy canvas, Supabase-backed grids, project modal) lives
// in that page's own inline <script>, loaded after this file.

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const hasFinePointer = window.matchMedia('(pointer: fine)').matches;

// ============ CURSOR GLOW ============
const cursorGlow = document.getElementById('cursorGlow');
let mouseX = 0, mouseY = 0, currentX = 0, currentY = 0;

if (cursorGlow && !prefersReducedMotion && hasFinePointer) {
  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
  }, { passive: true });

  function animateCursor() {
    currentX += (mouseX - currentX) * 0.15;
    currentY += (mouseY - currentY) * 0.15;
    cursorGlow.style.transform = `translate3d(${currentX - 200}px, ${currentY - 200}px, 0)`;
    requestAnimationFrame(animateCursor);
  }
  requestAnimationFrame(animateCursor);
} else if (cursorGlow) {
  cursorGlow.style.display = 'none';
}

// ============ SERVICE CARD GLOW (follows cursor inside card) ============
// Delegated + rAF-throttled so cards added later (dynamic services) are covered
// and rapid mousemove events collapse to one DOM write per frame. No-op on
// pages without a [data-service] card.
let serviceGlowPending = false;
let serviceGlowEvent = null;

document.addEventListener('mousemove', (e) => {
  const card = e.target.closest('[data-service]');
  if (!card) return;
  serviceGlowEvent = { card, clientX: e.clientX, clientY: e.clientY };
  if (!serviceGlowPending) {
    serviceGlowPending = true;
    requestAnimationFrame(() => {
      serviceGlowPending = false;
      if (!serviceGlowEvent) return;
      const { card, clientX, clientY } = serviceGlowEvent;
      const rect = card.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      card.style.setProperty('--mx', x + '%');
      card.style.setProperty('--my', y + '%');
    });
  }
}, { passive: true });

// ============ NAV SCROLL STATE ============
const nav = document.getElementById('nav');
let scrollTicking = false;
window.addEventListener('scroll', () => {
  if (scrollTicking) return;
  scrollTicking = true;
  requestAnimationFrame(() => {
    scrollTicking = false;
    nav.classList.toggle('scrolled', window.scrollY > 50);
  });
}, { passive: true });

// ============ MOBILE NAV ============
const navToggle = document.getElementById('navToggle');
const navLinks = document.getElementById('navLinks');
const navEl = document.getElementById('nav');

navToggle?.addEventListener('click', (e) => {
  e.stopPropagation();
  navLinks?.classList.toggle('open');
});

// Auto-close mobile nav when clicking outside
document.addEventListener('click', (e) => {
  if (navLinks && navLinks.classList.contains('open')) {
    if (!navEl?.contains(e.target)) {
      navLinks.classList.remove('open');
    }
  }
});

// Auto-close mobile nav when clicking any nav link
navLinks?.querySelectorAll('a').forEach(link => {
  link.addEventListener('click', () => {
    navLinks.classList.remove('open');
  });
});

// ============ SCROLL REVEAL ============
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

// ============ STAGGERED REVEAL GROUPS ============
// A `.reveal-group` container (a grid, or a label/title/intro block) turns
// its direct children into a staggered, one-after-another entrance instead
// of the flat all-at-once fade a single `.reveal` block gives. Each child
// gets the existing `.reveal` class — so it's driven by the same
// IntersectionObserver above and correctly re-triggers on scroll for
// below-the-fold content — plus a `--reveal-index` custom property that
// styles.css (`.reveal-group > .reveal`) turns into an incremental
// transition-delay. Exposed on window so page-specific scripts (services.html,
// work.html) can re-run it after Supabase swaps in dynamically-loaded cards.
function initRevealGroup(container) {
  if (!container) return;
  Array.from(container.children).forEach((child, i) => {
    child.classList.add('reveal');
    child.style.setProperty('--reveal-index', i);
    observer.observe(child);
  });
}
window.initRevealGroup = initRevealGroup;

document.querySelectorAll('.reveal-group').forEach(initRevealGroup);

// ============ TEXT SCRAMBLE ============
const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%!?';
const PRESERVE = new Set([' ', ' ', '—', '/', '.', '-', '·']);

function scramble(el, duration = 1200) {
  const original = el.textContent;
  let start = null;
  function frame(ts) {
    if (!start) start = ts;
    const progress = Math.min((ts - start) / duration, 1);
    const resolved = Math.floor(progress * original.length);
    el.textContent = original.split('').map((char, i) => {
      if (PRESERVE.has(char) || i < resolved) return char;
      return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    }).join('');
    if (progress < 1) requestAnimationFrame(frame);
    else el.textContent = original;
  }
  requestAnimationFrame(frame);
}

const scrambleObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      scramble(entry.target);
      scrambleObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.8 });

document.querySelectorAll('.section-label').forEach(el => scrambleObserver.observe(el));

setTimeout(() => {
  const heroTagText = document.querySelector('.hero-tag span:last-child');
  if (heroTagText) scramble(heroTagText, 1500);
}, 900);

// ============ MAGNETIC BUTTONS ============
if (hasFinePointer) {
  document.querySelectorAll('.btn').forEach(btn => {
    let magnetPending = false;
    let lastEvent = null;

    btn.addEventListener('mousemove', (e) => {
      lastEvent = e;
      btn.classList.add('is-dragging');
      if (magnetPending) return;
      magnetPending = true;
      requestAnimationFrame(() => {
        magnetPending = false;
        const rect = btn.getBoundingClientRect();
        const x = (lastEvent.clientX - rect.left - rect.width / 2) * 0.3;
        const y = (lastEvent.clientY - rect.top - rect.height / 2) * 0.3;
        btn.style.transform = `translate(${x}px, ${y}px)`;
      });
    }, { passive: true });

    btn.addEventListener('mouseleave', () => {
      btn.classList.remove('is-dragging');
      btn.style.transform = '';
    });
  });
}

// ============ THEME SWITCHER LOGIC ============
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme');
  const targetTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', targetTheme);
  localStorage.setItem('theme', targetTheme);
  updateThemeToggleIcons();
}

function updateThemeToggleIcons() {
  const theme = document.documentElement.getAttribute('data-theme');
  const toggleBtn = document.getElementById('themeToggleBtn');
  if (!toggleBtn) return;
  const sunIcon = toggleBtn.querySelector('.sun-icon');
  const moonIcon = toggleBtn.querySelector('.moon-icon');
  if (theme === 'light') {
    if (sunIcon) sunIcon.style.display = 'none';
    if (moonIcon) moonIcon.style.display = 'block';
  } else {
    if (sunIcon) sunIcon.style.display = 'block';
    if (moonIcon) moonIcon.style.display = 'none';
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  updateThemeToggleIcons();
});
