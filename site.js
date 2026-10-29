/* Onyxx Tech — public site behaviour (2026-10 redesign).

   Deliberately small. Every public page must read completely with this
   file blocked: it only adds the mobile menu, the header border on scroll,
   gentle reveals, the WhatsApp button, analytics and the contact form.

   Kept as an IIFE so nothing leaks into the global scope (see the
   PROJECT_STATUS note on the old common.js collision). Load with `defer`. */
(function () {
  'use strict';

  var WA = [
    { name: '+60 11-3988 4927', role: 'Quotes and new projects', number: '601139884927' },
    { name: '+60 19-468 8052', role: 'Quotes and new projects', number: '60194688052' }
  ];

  document.documentElement.classList.add('js');

  function initHeader() {
    var header = document.querySelector('.site-header');
    if (!header) return;
    var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 8); };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    var toggle = header.querySelector('.nav-toggle');
    if (!toggle) return;
    function setOpen(open) {
      header.classList.toggle('nav-open', open);
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    }
    toggle.addEventListener('click', function () { setOpen(!header.classList.contains('nav-open')); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
    header.querySelectorAll('.nav a').forEach(function (a) { a.addEventListener('click', function () { setOpen(false); }); });
  }

  function initReveals() {
    var els = document.querySelectorAll('.reveal');
    if (!els.length) return;
    if (!('IntersectionObserver' in window)) { els.forEach(function (el) { el.classList.add('is-in'); }); return; }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { rootMargin: '0px 0px -8% 0px' });
    els.forEach(function (el) { io.observe(el); });
  }

  function initWhatsApp() {
    if (document.body.hasAttribute('data-no-fab')) return;
    var wrap = document.createElement('div');
    wrap.className = 'wa-fab';
    wrap.innerHTML =
      '<div class="wa-fab-menu" id="waFabMenu" hidden><p>Chat with us on WhatsApp</p>' +
      WA.map(function (c) {
        return '<a href="https://wa.me/' + c.number + '" target="_blank" rel="noopener">' + c.name +
               '<small>' + c.role + '</small></a>';
      }).join('') +
      '</div><button type="button" class="wa-fab-btn" aria-expanded="false" aria-controls="waFabMenu" aria-label="Chat with us on WhatsApp">' +
      '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.76-1.66-2.06-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.53.15-.18.2-.3.3-.5.1-.2.05-.38-.02-.53-.08-.15-.67-1.61-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.38-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.22 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.7.63.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.41.25-.7.25-1.29.17-1.42-.07-.13-.27-.2-.57-.35zM12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2z"/></svg></button>';
    document.body.appendChild(wrap);
    var btn = wrap.querySelector('button');
    var menu = wrap.querySelector('.wa-fab-menu');
    function setOpen(open) { menu.hidden = !open; btn.setAttribute('aria-expanded', String(open)); }
    btn.addEventListener('click', function () { setOpen(menu.hidden); });
    document.addEventListener('click', function (e) { if (!wrap.contains(e.target)) setOpen(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') setOpen(false); });
  }

  /* Vercel Web Analytics — the path only exists on the deployed site. */
  function initAnalytics() {
    var h = location.hostname;
    if (h === 'localhost' || h === '127.0.0.1' || h === '') return;
    var s = document.createElement('script');
    s.defer = true;
    s.src = '/_vercel/insights/script.js';
    document.head.appendChild(s);
  }


  /* Contact form → Supabase `contact_messages`, read back in the admin
     dashboard's Messages tab. A plain PostgREST insert with the public anon
     key: RLS grants anon INSERT and nothing else, and the CHECK constraints
     cap every field (mirrored below so a long field is explained here rather
     than arriving as a raw Postgres error). Avoids loading supabase-js on a
     marketing page for one request. */
  var SUPABASE_URL = 'https://whjstsgtximknicppllt.supabase.co';
  var SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoanN0c2d0eGlta25pY3BwbGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTc5NzgsImV4cCI6MjA5ODM3Mzk3OH0.I_GHJG8XcyFO_WamEwWnme_-l1ZPUCUCuZ7roOE-B2U';
  var FORM_LIMITS = { name: 120, email: 200, phone: 40, company: 160, message: 5000 };

  function initContactForm() {
    var form = document.getElementById('contactForm');
    if (!form) return;
    var status = document.getElementById('formStatus');
    var submit = form.querySelector('[type="submit"]');
    var inFlight = false;

    function say(msg, kind) {
      if (!status) return;
      status.textContent = msg;
      status.className = 'form-status is-' + kind;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (inFlight) return;
      var fd = new FormData(form);
      var get = function (k) { return String(fd.get(k) || '').trim(); };

      // Honeypot: pretend it worked and send nothing.
      if (get('website')) { say('Thanks, we will be in touch shortly.', 'ok'); form.reset(); return; }

      var payload = {
        name: get('name'),
        email: get('email'),
        phone: get('phone') || null,
        company: get('company') || null,
        project_type: get('project_type') || null,
        message: get('message'),
        source_page: location.pathname
      };
      if (!payload.name || !payload.email || !payload.message) {
        say('Please fill in your name, email and a short message.', 'err');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email)) { say('That email address does not look right.', 'err'); return; }
      for (var k in FORM_LIMITS) {
        if (payload[k] && payload[k].length > FORM_LIMITS[k]) { say('That ' + k + ' is too long. Please shorten it.', 'err'); return; }
      }

      inFlight = true;
      if (submit) { submit.disabled = true; submit.dataset.label = submit.textContent; submit.textContent = 'Sending…'; }
      say('Sending…', 'pending');

      fetch(SUPABASE_URL + '/rest/v1/contact_messages', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_ANON_KEY,
          'Authorization': 'Bearer ' + SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify(payload)
      }).then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        form.reset();
        say('Thank you. We have your message and will reply within one working day.', 'ok');
      }).catch(function (err) {
        console.error('contact form:', err);
        say('Something went wrong sending that. Please WhatsApp us instead.', 'err');
      }).then(function () {
        inFlight = false;
        if (submit) { submit.disabled = false; submit.textContent = submit.dataset.label || 'Send message'; }
      });
    });
  }

  function initYear() {
    document.querySelectorAll('[data-year]').forEach(function (el) { el.textContent = String(new Date().getFullYear()); });
  }

  function init() {
    initHeader();
    initReveals();
    initWhatsApp();
    initAnalytics();
    initYear();
    initContactForm();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
