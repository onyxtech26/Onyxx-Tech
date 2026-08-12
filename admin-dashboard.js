/* Extracted from admin-dashboard.html so the browser can cache it
   separately from the markup.

   MUST stay a classic script — no type="module". Every inline onclick in
   the markup resolves function names against the global scope, and module
   scope would break all of them without a single error being raised.

   MUST stay at the end of <body>: it touches the DOM at load without
   waiting for DOMContentLoaded in several places. */

    // Initialize Supabase Client
    const supabaseUrl = 'https://whjstsgtximknicppllt.supabase.co';
    const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndoanN0c2d0eGlta25pY3BwbGx0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3OTc5NzgsImV4cCI6MjA5ODM3Mzk3OH0.I_GHJG8XcyFO_WamEwWnme_-l1ZPUCUCuZ7roOE-B2U';
    const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

    // Global Data Store
    let projectsData = [];
    let expensesData = [];
    let teamData = [];
    let servicesData = [];
    let showcaseData = [];
    let withdrawalsData = [];
    let paymentsData = [];        // project_payments — the installment schedule
    let addonsData = [];          // project_addons  — scope added after the quote
    let quotationsData = [];      // quotations      — header totals + the sent file
    let systemSettings = {
      company_profile: { name: "Onyxx Tech Hub", sst_rate: 8, currency: "MYR" },
      partner_split: { Kunacosta: 50, Rooben: 50 },
      financial_targets: { revenue_target: 15000, expense_target: 5000 }
    };

    // The two partners. Everything is bought with COMPANY money, so no expense
    // ever creates a reimbursement; `paid_by` on a personal expense says whose
    // share to charge it to, and on a company expense is just a record of who
    // made the purchase.
    const PARTNERS = ['Kunacosta', 'Rooben'];

    // Tables that failed to load on the last refresh. Non-empty means every
    // derived figure on screen is suspect — see the comment in loadAllData.
    let loadErrors = [];

    /**
     * Escape text before it goes into an innerHTML template.
     *
     * The dashboard builds almost all of its markup with template literals, and
     * the values come from the database — client names, project titles, expense
     * items, filenames. Without this an ampersand in a company name or an
     * apostrophe in a receipt filename corrupts the markup, and a value
     * containing a tag executes. Use it for every interpolated DB string,
     * including inside attributes.
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

    /**
     * Escape a value destined for a single-quoted inline handler argument,
     * i.e. onclick="fn('HERE')".
     *
     * ORDER IS THE WHOLE POINT, and getting it backwards is silently useless.
     * An attribute value is HTML-entity-decoded BEFORE it is parsed as JS. So
     * escaping to HTML first — esc() then backslashes — turns ' into &#39;,
     * which the parser decodes straight back into a live quote:
     *
     *   value    ');alert(1)//
     *   emitted  onclick="fn('&#39;);alert(1)//')"
     *   parsed   fn('');alert(1)//')      <-- breaks out and runs
     *
     * Escape for the JS string context FIRST, then for HTML. The backslash
     * survives the round trip because esc() does not touch it:
     *
     *   emitted  onclick="fn('\&#39;);alert(1)//')"
     *   parsed   fn('\');alert(1)//')     <-- one inert string argument
     *
     * The line terminators matter too: a raw newline inside a JS string literal
     * is a SyntaxError, and U+2028/U+2029 are line terminators to a JS parser
     * even though they survive HTML decoding untouched.
     *
     * Better still is not to need this at all — the data-id + addEventListener
     * pattern used for the project rows has no second escaping context.
     */
    function escArg(v) {
      if (v === null || v === undefined) return '';
      const js = String(v)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
      return esc(js);
    }

    /* ------------------------------------------------------------------
       DERIVED FINANCIALS — the single source of truth for every number
       ------------------------------------------------------------------
       Recomputed by computeFinancials() after each load, then read by Overview,
       Projects, Cash Flow, Partners and Reports.

       This exists because the money used to be summed independently in nine
       different places off `deposit_amount` / `final_payment_amount`. Nine
       hand-rolled sums over the same data drift apart the moment one is edited;
       several already disagreed. Everything now reads from here. */
    let fin = {
      byProject: {},   // project_id -> per-project totals
      collected: 0,    // received payments, i.e. cash that reached the account
      scheduled: 0,    // everything invoiced, received or not
      outstanding: 0,
      overdue: 0,
      contractTotal: 0,
      expenses: 0,
      netProfit: 0,
      withdrawn: {},   // partner -> cash they have taken out
      balance: {},     // partner -> what is still theirs to take
      companyExpenses: 0,
      personalSpend: {}, // partner -> own purchases on the company card, off their share
      distributablePool: 0,
      cashInAccount: 0,
      sstReserved: 0,   // permanently 0 — the studio does not charge SST
      distributable: 0, // equals cashInAccount
      reconciled: true
    };
    let categoryChartInstance = null;
    let flowLineChartInstance = null;
    let trendBarChartInstance = null;
    let coverageRadarChartInstance = null;
    let currentLineChartFilter = 'all';

    // Auth Guard
    async function initDashboard() {
      try {
        const { data, error } = await supabaseClient.auth.getSession();
        if (error || !data.session) { window.location.href = 'admin-login.html?v=' + Date.now(); return; }

        // A session proves you signed in, NOT that you are a partner. Once
        // migration 03 is applied, a non-admin passes this point and every
        // table returns 200 with zero rows — because that is how RLS denies,
        // it is not an error. Nothing would flag it: loadErrors stays empty,
        // and the reconciliation invariant holds identically at zero. The
        // result is a fully rendered dashboard reading RM 0.00 everywhere and
        // reporting "Balanced", which is worse than an error message.
        //
        // Skipped when is_admin() does not exist yet, so the dashboard keeps
        // working before migration 03 is run. Once it exists it is enforced.
        const { data: isAdmin, error: adminErr } = await supabaseClient.rpc('is_admin');
        const notMigratedYet = adminErr && /function|does not exist|not find/i.test(adminErr.message || '');
        if (adminErr && !notMigratedYet) throw adminErr;
        if (!adminErr && !isAdmin) {
          await supabaseClient.auth.signOut();
          document.getElementById('loadingOverlay').innerHTML =
            `<div style="text-align:center;max-width:32rem;padding:2rem;">
               <h2 style="font-family:var(--font-display);margin-bottom:0.75rem;">Not authorised</h2>
               <p style="color:var(--bone-dim);line-height:1.6;">
                 This account is signed in but is not on the Onyxx Tech admin list,
                 so it cannot see any data. You have been signed out.
               </p>
               <a href="admin-login.html" class="btn-primary"
                  style="display:inline-block;margin-top:1.25rem;width:auto;padding:0.6rem 1.4rem;">Back to login</a>
             </div>`;
          return;
        }
        if (notMigratedYet) {
          console.warn('is_admin() not found — running without an admin allowlist. Apply supabase_migration_03_admin_allowlist.sql.');
        }

        document.getElementById('userEmail').textContent = data.session.user.email;

        // Initial Data Fetch
        await loadAllData();
        updateThemeToggleIcons();
        
        // Restore active tab
        const savedTab = localStorage.getItem('activeTab') || 'overview';
        switchTab(savedTab);
        
        document.getElementById('loadingOverlay').classList.add('hidden');
      } catch (err) {
        console.error("Auth initialization failed:", err);
        window.location.href = 'admin-login.html?v=' + Date.now();
      }
    }

    initDashboard();

    /* The session was previously checked exactly once, at load. So signing out
       on one device left every other open tab fully rendered, with financial
       data on screen, indefinitely. This reacts to the change instead.

       Deliberately narrow: only SIGNED_OUT and a token refresh that came back
       without a session are treated as "you are done". Reacting to every event
       would bounce the user on ordinary token refreshes. */
    supabaseClient.auth.onAuthStateChange((event, session) => {
      const lost = event === 'SIGNED_OUT' || (event === 'TOKEN_REFRESHED' && !session);
      if (lost) window.location.href = 'admin-login.html?v=' + Date.now();
    });

    // Sign out
    document.getElementById('signOutBtn').addEventListener('click', async () => {
      // Check the result: on failure the token stays in localStorage, and
      // redirecting anyway made it look signed out while the session lived on.
      const { error } = await supabaseClient.auth.signOut();
      if (error) {
        showToast('Could not sign out: ' + error.message, 'error');
        return;
      }
      window.location.href = 'index.html';
    });
    
    // Tab Switching Logic
    function switchTab(tabId) {
      localStorage.setItem('activeTab', tabId);
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.submenu-item').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.tab-section').forEach(el => el.classList.remove('active'));
      document.querySelectorAll('.nav-group').forEach(el => el.classList.remove('active'));
      
      // Check if it's a direct nav-item click
      const navItems = Array.from(document.querySelectorAll('.sidebar nav .nav-item'));
      const activeNav = navItems.find(item => item.getAttribute('onclick')?.includes(`'${tabId}'`));
      if (activeNav) {
        activeNav.classList.add('active');
        const group = activeNav.closest('.nav-group');
        if (group) {
          group.classList.add('active');
        }
      }
      
      // Check if it's a submenu item click
      const subItems = Array.from(document.querySelectorAll('.submenu-item'));
      const activeSub = subItems.find(item => item.getAttribute('onclick')?.includes(`'${tabId}'`));
      if (activeSub) {
        activeSub.classList.add('active');
        const group = activeSub.closest('.nav-group');
        if (group) {
          group.classList.add('active');
          group.querySelector('.nav-item')?.classList.add('active');
        }
      }
      
      const tabEl = document.getElementById('tab-' + tabId);
      if (tabEl) {
        tabEl.classList.add('active');
      }

      if (tabId === 'project-showcase') {
        renderProjectShowcase();
      }
      
      if (tabId === 'settings') {
        populateSettingsFields();
      }

      // The phone bar only carries four tabs. When the current section is one
      // of the other seven, light up More instead — otherwise the bar claims
      // nothing is selected while you are plainly looking at Reports.
      syncMoreNavActive(tabId);
      closeMoreNav();
    }

    /* ==================================================================
       MOBILE NAV: FOUR TABS PLUS "MORE"
       ==================================================================
       Eleven items in a 390px bar was 3,703px of sideways strip showing one
       unlabelled icon at a time — the tabs were technically reachable and
       practically not. Four stay on the bar (data-primary in the markup);
       the rest are listed here.

       The sheet is CLONED from the real nav rather than written out again, so
       a tab added to the sidebar shows up automatically instead of quietly
       becoming unreachable on phones. */
    function moreNavItems() {
      return [...document.querySelectorAll('.sidebar nav .nav-item[data-tab]')]
        .filter(el => el.getAttribute('data-primary') !== '1');
    }

    function syncMoreNavActive(tabId) {
      const more = document.querySelector('.nav-more');
      if (!more) return;
      const inSheet = moreNavItems().some(el => el.getAttribute('data-tab') === tabId);
      more.classList.toggle('active', inSheet);
    }

    function buildMoreNav() {
      const grid = document.getElementById('moreNavGrid');
      if (!grid) return;
      const active = localStorage.getItem('activeTab');
      grid.innerHTML = '';
      moreNavItems().forEach(src => {
        const tab = src.getAttribute('data-tab');
        const label = (src.querySelector('span')?.textContent || tab).trim();
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'more-nav-item' + (tab === active ? ' active' : '');
        btn.setAttribute('data-tab', tab);
        // The icon is the nav's own SVG, so the two can never disagree.
        const icon = src.querySelector('svg');
        if (icon) btn.appendChild(icon.cloneNode(true));
        const text = document.createElement('span');
        text.textContent = label;
        btn.appendChild(text);
        // switchTab closes this sheet itself, so there is one code path for
        // "a section was chosen" no matter which control started it.
        btn.addEventListener('click', () => switchTab(tab));
        grid.appendChild(btn);
      });
    }

    function openMoreNav() {
      buildMoreNav();
      openModal('moreNavModal');
      document.querySelector('.nav-more')?.setAttribute('aria-expanded', 'true');
    }

    /**
     * Guarded because switchTab() calls this on EVERY tab change, including
     * ones with no sheet involved. closeModal() restores focus and clears
     * _lastFocusBeforeModal unconditionally, so calling it blind would steal
     * the focus restore belonging to whatever modal is genuinely open.
     */
    function closeMoreNav() {
      const sheet = document.getElementById('moreNavModal');
      document.querySelector('.nav-more')?.setAttribute('aria-expanded', 'false');
      if (sheet && sheet.classList.contains('active')) closeModal('moreNavModal');
    }

function getProjectImageUrl(p) {
  if (!p || !p.image_url) return '';
  const url = p.image_url;
  
  if (url.includes('1783223293991_9suav.png')) {
    return 'images/Policy_Snap.png';
  }
  if (url.includes('1783223786542_nzlr5n.png')) {
    return 'images/Carousel_Maker.png';
  }
  if (url.includes('1783223573215_jmhlwn.png')) {
    return 'images/xcraft.png';
  }
  if (url.includes('1783223485403_rkdjse.png')) {
    return 'images/Mpt.jpg';
  }
  if (url.includes('1783223367629_bkbf9k.png')) {
    return 'images/Watch_bot.png';
  }
  
  return url;
}

    /**
     * Make a stored URL safe to put in an href.
     *
     * Escaping alone is NOT enough here: `javascript:alert(1)` contains no
     * character esc() touches, so it survives intact and runs on click. Only
     * http and https are allowed through; anything else returns '' and the link
     * is dropped rather than rendered as a live trap.
     */
    function safeUrl(u) {
      const raw = String(u || '').trim();
      if (!raw) return '';
      try {
        const proto = new URL(raw, window.location.origin).protocol;
        return (proto === 'http:' || proto === 'https:') ? raw : '';
      } catch { return ''; }
    }

    // Render Project Showcase Portfolio cards
    function renderProjectShowcase() {
      const grid = document.getElementById('projectShowcaseGrid');
      if (!grid) return;
      grid.innerHTML = '';

      if (showcaseData.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--bone-dim);">No showcase projects added yet. Click "+ Add Showcase Project" to start.</div>`;
        return;
      }

      showcaseData.forEach(p => {
        const desc = p.description || '';
        const tags = Array.isArray(p.tech_stack) ? p.tech_stack : (p.tech_stack ? String(p.tech_stack).split(',').map(t => t.trim()) : []);
        const imgUrl = getProjectImageUrl(p);
        const imgMarkup = imgUrl ? `<div style="width: 100%; height: 160px; border-radius: 12px; overflow: hidden; margin-bottom: 1rem; border: 1px solid var(--glass-border);"><img src="${esc(imgUrl)}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.onerror=null; this.src='images/onyxx_logo_transparent.png';" /></div>` : '';
        const tagSpans = tags.map(t => `<span class="project-tag" style="background: rgba(56, 224, 255, 0.08); color: var(--accent); border: 1px solid rgba(56, 224, 255, 0.15); padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.72rem; font-family: var(--font-mono);">${esc(t)}</span>`).join(' ');

        const card = document.createElement('div');
        card.className = 'glass-card project-showcase-card';
        card.style.display = 'flex';
        card.style.flexDirection = 'column';
        card.style.justifyContent = 'space-between';
        card.style.minHeight = '320px';
        
        card.innerHTML = `
          <div>
            ${imgMarkup}
            <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.6rem;">
              <span class="status-badge" style="background: var(--nav-item-hover-bg); color: var(--bone-dim); border-color: var(--glass-border); font-size: 0.7rem; padding: 0.2rem 0.6rem;">${esc(p.category || 'Product')}</span>
              <span style="font-size: 0.75rem; color: var(--bone-dim); font-family: var(--font-mono);">${esc(p.client || 'Onyxx Tech Hub Product')}</span>
            </div>
            
            <h3 style="font-family: var(--font-display); font-size: 1.4rem; margin-bottom: 0.5rem; font-weight: 400; color: var(--bone);">${esc(p.title)}</h3>
            
            <p style="font-size: 0.85rem; color: var(--bone-dim); line-height: 1.5; margin-bottom: 1.2rem;">${esc(desc)}</p>
          </div>
          
          <div style="border-top: 1px solid var(--glass-border); padding-top: 1rem; margin-top: auto;">
            <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-bottom: 1rem;">
              ${tagSpans}
            </div>
            
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <div style="display: flex; gap: 0.5rem;">
                ${safeUrl(p.github_url) ? `<a href="${esc(safeUrl(p.github_url))}" target="_blank" rel="noopener noreferrer" style="color: var(--bone-dim); transition: color 0.3s;" title="GitHub"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; stroke-width: 2.5;"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"></path></svg></a>` : ''}
                ${safeUrl(p.live_url) ? `<a href="${esc(safeUrl(p.live_url))}" target="_blank" rel="noopener noreferrer" style="color: var(--bone-dim); transition: color 0.3s;" title="Live URL"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 16px; height: 16px; stroke-width: 2.5;"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg></a>` : ''}
              </div>
              <div class="actions-cell">
                <button class="action-btn edit-btn" title="Edit" onclick="openShowcaseModal('${escArg(p.id)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4z"></path></svg></button>
                <button class="action-btn delete-btn" title="Delete" onclick="deleteShowcaseProject('${escArg(p.id)}')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg></button>
              </div>
            </div>
          </div>
        `;
        grid.appendChild(card);
      });
    }

    function openShowcaseModal(id = null) {
      const form = document.getElementById('showcaseForm');
      form.reset();

      const previewEl = document.getElementById('showcaseImagePreviewContainer');
      previewEl.innerHTML = '';
      document.getElementById('showcaseImageFile').value = '';

      if (id) {
        document.getElementById('showcaseModalTitle').textContent = 'Edit Showcase Project';
        const p = showcaseData.find(item => item.id === id);
        if (p) {
          document.getElementById('showcaseId').value = p.id;
          document.getElementById('showcaseTitle').value = p.title;
          document.getElementById('showcaseCategory').value = p.category || '';
          document.getElementById('showcaseClient').value = p.client || '';
          document.getElementById('showcaseDescription').value = p.description || '';
          
          const tags = Array.isArray(p.tech_stack) ? p.tech_stack.join(', ') : (p.tech_stack || '');
          document.getElementById('showcaseTechStack').value = tags;
          document.getElementById('showcaseGithub').value = p.github_url || '';
          document.getElementById('showcaseLive').value = p.live_url || '';
          
          const imgUrl = getProjectImageUrl(p);
          document.getElementById('showcaseExistingImageUrl').value = p.image_url || '';
          if (imgUrl) {
            previewEl.innerHTML = `<img src="${imgUrl}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover;" onerror="this.onerror=null; this.src='images/onyxx_logo_transparent.png';" /> <span style="font-size: 0.8rem; color: var(--bone-dim);">Current Image</span>`;
          }
        }
      } else {
        document.getElementById('showcaseModalTitle').textContent = 'Add Showcase Project';
        document.getElementById('showcaseId').value = '';
        document.getElementById('showcaseExistingImageUrl').value = '';
      }
      openModal('showcaseModal');
    }

    // Resizes/re-encodes an image File in the browser before it's uploaded
    // to Supabase storage. Uploads here used to go straight from
    // <input type="file"> to storage.upload() with zero processing — some
    // showcase screenshots landed at 5-8MB for what only ever renders as a
    // ~400px-wide card thumbnail on the public site, which is why those
    // pages were slow to load. This runs client-side, before the network
    // request, so the upload itself is faster too.
    //
    // Non-image files (PDFs, docs) and animated GIFs pass through
    // untouched — canvas can't safely re-encode either (GIF animation would
    // collapse to a single frame). Already-small images are also skipped so
    // a sensible manual upload isn't needlessly reprocessed.
    async function compressImageFile(file, { maxDim = 1600, quality = 0.82, skipIfUnder = 400 * 1024 } = {}) {
      if (!file.type.startsWith('image/') || file.type === 'image/gif') return file;
      if (file.size <= skipIfUnder) return file;

      const bitmap = await createImageBitmap(file).catch(() => null);
      if (!bitmap) return file; // decode failed — fall back to the original rather than block the upload

      const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
      const w = Math.round(bitmap.width * scale);
      const h = Math.round(bitmap.height * scale);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d').drawImage(bitmap, 0, 0, w, h);
      bitmap.close?.();

      // Prefer WebP for the smaller file size, but canvas.toBlob() silently
      // falls back to PNG (large, no benefit here) in browsers that can't
      // encode WebP — check the actual returned type and re-encode as JPEG
      // instead when that happens, since JPEG has universal canvas support.
      const toBlob = (type) => new Promise(resolve => canvas.toBlob(resolve, type, quality));
      let blob = await toBlob('image/webp');
      let ext = 'webp';
      if (!blob || blob.type !== 'image/webp') {
        blob = await toBlob('image/jpeg');
        ext = 'jpg';
      }
      if (!blob || blob.size >= file.size) return file; // compression didn't actually help — keep the original

      const baseName = file.name.replace(/\.[^.]+$/, '');
      return new File([blob], `${baseName}.${ext}`, { type: blob.type });
    }

    async function saveShowcaseProject(e) {
      e.preventDefault();
      const id = document.getElementById('showcaseId').value;
      let image_url = document.getElementById('showcaseExistingImageUrl').value || null;
      const fileInput = document.getElementById('showcaseImageFile');

      if (fileInput.files.length > 0) {
        const file = await compressImageFile(fileInput.files[0]);
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        showToast('Uploading project image...', 'info');
        try {
          const { error } = await supabaseClient.storage.from('showcase').upload(fileName, file);
          if (error) throw error;

          const { data: publicUrlData } = supabaseClient.storage.from('showcase').getPublicUrl(fileName);
          image_url = publicUrlData.publicUrl;
        } catch (uploadErr) {
          showToast('Failed to upload image: ' + uploadErr.message, 'error');
          return;
        }
      }

      const tagsRaw = document.getElementById('showcaseTechStack').value || '';
      const techStackArray = tagsRaw.split(',').map(t => t.trim()).filter(t => t.length > 0);

      const row = {
        title: document.getElementById('showcaseTitle').value,
        category: document.getElementById('showcaseCategory').value,
        client: document.getElementById('showcaseClient').value,
        description: document.getElementById('showcaseDescription').value,
        tech_stack: techStackArray,
        github_url: document.getElementById('showcaseGithub').value || null,
        live_url: document.getElementById('showcaseLive').value || null,
        image_url: image_url
      };

      try {
        let res;
        if (id) {
          res = await supabaseClient.from('showcase_projects').update(row).eq('id', id);
        } else {
          res = await supabaseClient.from('showcase_projects').insert([row]);
        }

        if (res.error) throw res.error;
        closeModal('showcaseModal');
        showToast('Showcase project saved successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error saving showcase project: " + err.message, "error");
      }
    }

    async function deleteShowcaseProject(id) {
      if (!confirm("Are you sure you want to delete this showcase project?")) return;
      try {
        const { error } = await supabaseClient.from('showcase_projects').delete().eq('id', id);
        if (error) throw error;
        showToast('Showcase project deleted successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error deleting showcase project: " + err.message, "error");
      }
    }

    // Settings logic and handlers
    function populateSettingsFields() {
      // Company Profile
      document.getElementById('setCompanyName').value = systemSettings.company_profile?.name || 'Onyxx Tech Hub';
      document.getElementById('setTaxRate').value = systemSettings.company_profile?.sst_rate ?? 8;
      
      // Partner Split
      document.getElementById('splitKunaVal').value = systemSettings.partner_split?.Kunacosta ?? 50;
      document.getElementById('splitRoobenVal').value = systemSettings.partner_split?.Rooben ?? 50;
      
      // Financial Targets
      document.getElementById('targetMonthlyRev').value = systemSettings.financial_targets?.revenue_target ?? 15000;
      document.getElementById('targetMonthlyExp').value = systemSettings.financial_targets?.expense_target ?? 5000;
    }

    function syncPartnerSplit(changedPartner) {
      const kunaInput = document.getElementById('splitKunaVal');
      const roobenInput = document.getElementById('splitRoobenVal');
      const errorEl = document.getElementById('partnerSplitError');
      const saveBtn = document.getElementById('btnSavePartner');

      let val = 50;
      if (changedPartner === 'kuna') {
        val = parseInt(kunaInput.value) || 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;
        kunaInput.value = val;
        roobenInput.value = 100 - val;
      } else {
        val = parseInt(roobenInput.value) || 0;
        if (val < 0) val = 0;
        if (val > 100) val = 100;
        roobenInput.value = val;
        kunaInput.value = 100 - val;
      }

      const total = parseInt(kunaInput.value) + parseInt(roobenInput.value);
      if (total !== 100) {
        errorEl.style.display = 'block';
        saveBtn.disabled = true;
      } else {
        errorEl.style.display = 'none';
        saveBtn.disabled = false;
      }
    }

    async function saveCompanyProfileSettings(e) {
      e.preventDefault();
      const updatedProfile = {
        name: document.getElementById('setCompanyName').value,
        sst_rate: parseFloat(document.getElementById('setTaxRate').value) || 0,
        currency: "MYR"
      };

      try {
        const { error } = await supabaseClient.from('system_settings').upsert({
          key: 'company_profile',
          value: updatedProfile,
          updated_at: new Date()
        });
        if (error) throw error;
        
        systemSettings.company_profile = updatedProfile;
        showToast('Company profile settings saved', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Error saving profile settings: ' + err.message, 'error');
      }
    }

    async function savePartnerSplitSettings(e) {
      e.preventDefault();
      // `|| 50` turned a legitimate 0 into 50, so a 0/100 split was rejected as
      // 50 + 100 = 150 with a message about summing to 100. Fall back only when
      // the field is genuinely not a number.
      const readPct = id => {
        const v = parseInt(document.getElementById(id).value, 10);
        return Number.isFinite(v) ? v : NaN;
      };
      const splitKuna = readPct('splitKunaVal');
      const splitRooben = readPct('splitRoobenVal');

      if (!Number.isFinite(splitKuna) || !Number.isFinite(splitRooben)) {
        showToast('Enter a number for each partner’s share', 'error');
        return;
      }
      if (splitKuna < 0 || splitRooben < 0) {
        showToast('A share cannot be negative', 'error');
        return;
      }
      if (splitKuna + splitRooben !== 100) {
        showToast(`Partner split must sum to 100% — currently ${splitKuna + splitRooben}%`, 'error');
        return;
      }

      const updatedSplit = {
        Kunacosta: splitKuna,
        Rooben: splitRooben
      };

      try {
        const { error } = await supabaseClient.from('system_settings').upsert({
          key: 'partner_split',
          value: updatedSplit,
          updated_at: new Date()
        });
        if (error) throw error;

        systemSettings.partner_split = updatedSplit;
        showToast('Partner split settings saved', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Error saving partner splits: ' + err.message, 'error');
      }
    }

    async function saveFinancialTargets(e) {
      e.preventDefault();
      const updatedTargets = {
        revenue_target: parseFloat(document.getElementById('targetMonthlyRev').value) || 0,
        expense_target: parseFloat(document.getElementById('targetMonthlyExp').value) || 0
      };

      try {
        const { error } = await supabaseClient.from('system_settings').upsert({
          key: 'financial_targets',
          value: updatedTargets,
          updated_at: new Date()
        });
        if (error) throw error;

        systemSettings.financial_targets = updatedTargets;
        showToast('Financial targets saved', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Error saving targets: ' + err.message, 'error');
      }
    }

    /* ==================================================================
       MODAL CONTROL
       ==================================================================
       Previously `openModal` only added `.active`. That left three problems:

         * Tab walked straight out of the dialog into the page behind it, so a
           keyboard user could be typing into a form they could no longer see.
         * The background scrolled under the open modal (body overflow is auto
           at <=860px), which on a phone loses the modal entirely.
         * Nothing closed the others, so two modals could be open at once,
           stacked at the same z-index with their blurs compounding, and one
           Escape closed both.

       Focus is also returned to whatever opened the modal — without that,
       closing drops focus to <body> and the next Tab restarts from the top of
       the page. */

    let _lastFocusBeforeModal = null;

    function focusableIn(el) {
      return [...el.querySelectorAll(
        'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]),' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )].filter(n => n.offsetParent !== null);
    }

    function openModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) { console.warn(`openModal: #${modalId} does not exist`); return; }

      // Only one at a time.
      document.querySelectorAll('.modal-backdrop.active').forEach(m => {
        if (m !== modal) m.classList.remove('active');
      });

      _lastFocusBeforeModal = document.activeElement;
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';

      // Let the open transition start before moving focus, or the browser
      // scrolls the not-yet-positioned dialog into view.
      setTimeout(() => {
        const f = focusableIn(modal);
        if (f.length) f[0].focus();
      }, 50);
    }

    function closeModal(modalId) {
      const modal = document.getElementById(modalId);
      if (!modal) return;
      modal.classList.remove('active');

      // Escape, the backdrop and the × all land here, so the More button's
      // state is reset in one place rather than at each of those call sites.
      if (modalId === 'moreNavModal') {
        document.querySelector('.nav-more')?.setAttribute('aria-expanded', 'false');
      }

      if (!document.querySelector('.modal-backdrop.active')) {
        document.body.style.overflow = '';
      }
      if (_lastFocusBeforeModal && document.contains(_lastFocusBeforeModal)) {
        _lastFocusBeforeModal.focus();
      }
      _lastFocusBeforeModal = null;
    }

    // Close on backdrop click. The check is `e.target === backdrop`, so a click
    // inside the dialog does not bubble up and close it.
    document.addEventListener('click', function(e) {
      if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
        closeModal(e.target.id);
      }
    });

    document.addEventListener('keydown', function(e) {
      const open = document.querySelector('.modal-backdrop.active');
      if (!open) return;

      if (e.key === 'Escape') {
        closeModal(open.id);
        return;
      }

      // Focus trap: wrap Tab around the dialog's own controls.
      if (e.key === 'Tab') {
        const f = focusableIn(open);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!open.contains(document.activeElement)) {
          // Focus escaped some other way — pull it back.
          e.preventDefault();
          first.focus();
        }
      }
    });

    // Fetch All Data
    /* ==================================================================
       computeFinancials — run once per load, before anything renders
       ==================================================================
       PARTNER ACCOUNTING

       EVERYTHING IS PAID WITH COMPANY MONEY. Client money lands in one shared
       business account and every purchase — company or personal, either partner
       — comes straight out of it. Nobody ever fronts anything from their own
       pocket, so there is NO reimbursement anywhere in this model. If you find
       yourself adding a `+ paid(P)` term, the assumption behind it is wrong.

       THE RULE TURNS ON WHO THE PURCHASE WAS FOR:

         * FOR THE COMPANY  — cost shared 50/50, and the payer gets their money
                              back. A laptop for the studio is not one partner's
                              problem.
         * FOR THE PARTNER  — comes off that partner's share alone. Headphones
                              for yourself are yours, even though the company
                              card paid for them.

       That is `expenses.scope`, 'company' or 'personal'.

       Company spending shrinks the pot before it is divided. Personal spending
       does not touch the pot — it is deducted from the buyer's slice of it:

           pool       = collected - companyExpenses
           share(P)   = pct(P) x pool
           balance(P) = share(P) - personalSpend(P) - withdrawn(P)

       A personal expense is, in substance, that partner taking money out of the
       business — the same thing a withdrawal is. It is recorded as an expense
       rather than a withdrawal so it keeps its category, receipt and notes.

       Worked example. Collected RM10,000; Kunacosta buys a RM1,000 company
       laptop and RM300 of headphones for himself, BOTH ON THE COMPANY CARD:

           pool       10,000 - 1,000 = 9,000
           share      Kunacosta 4,500   Rooben 4,500
           personal   Kunacosta   300   Rooben 0
           balance    Kunacosta 4,200   Rooben 4,500

       The gap is exactly RM300, the headphones. The laptop cost them RM500
       each. Cash left in the account is 10,000 - 1,000 - 300 = 8,700, and
       4,200 + 4,500 = 8,700.

       WHAT THIS REPLACED, AND WHY
       An earlier version had a `reimbursable(P)` term and an "Owed Back" column,
       built on the assumption that partners paid out of their own pockets and
       the company settled up with them. That is not how this studio operates:
       everything goes on company money, so nothing is ever owed back. The term
       inflated the buyer's balance by the full amount they had spent.

       `netProfit` below is `collected - expenses` INCLUDING personal ones,
       and is a REPORTING figure only — never what shares derive from. Do not
       wire it into share().

       RECONCILIATION
       Every expense leaves the account, so cash on hand is collected minus ALL
       expenses minus withdrawals, and the balances have to add up to that, less
       anything owed to the tax authority:

           balance(A) + balance(B)
             === collected - all expenses - total withdrawn

       (companyExpenses reaches it through the pool; personalSpend through the
       per-partner deduction. Both are already netted off.)

       `fin.reconciled` reports that. It only goes false on bad data (an expense
       with no paid_by, a withdrawal by an unknown name), which is exactly when
       you want to be told. Note it CANNOT detect several classes of corruption
       where both sides move together — a cascade-deleted project, a duplicated
       expense, or a failed load all still balance. Do not treat a green tick as
       proof the data is right. */
    function computeFinancials() {
      const today = todayLocal();

      const byProject = {};
      projectsData.forEach(p => {
        byProject[p.id] = {
          id: p.id,
          name: p.name,
          value: parseFloat(p.value) || 0,
          addons: [], addonsTotal: 0, addonsUnbilled: 0,
          payments: [],
          scheduled: 0, collected: 0, outstanding: 0, overdue: 0,
          contractTotal: 0,
          quotations: []
        };
      });

      // `billed` separates work the client has agreed to from work you have
      // actually invoiced. Only billed add-ons count toward what they owe —
      // previously every add-on did, so logging RM2,000 of extra scope the
      // moment it was agreed immediately reported RM2,000 as outstanding
      // before an invoice existed.
      addonsData.forEach(a => {
        const t = byProject[a.project_id];
        if (!t) return;                       // orphan row; project was deleted
        t.addons.push(a);
        const amt = parseFloat(a.amount) || 0;
        if (a.billed) t.addonsTotal += amt;
        else t.addonsUnbilled += amt;
      });

      paymentsData.forEach(pay => {
        const t = byProject[pay.project_id];
        if (!t) return;
        t.payments.push(pay);
        const amt = parseFloat(pay.amount) || 0;
        t.scheduled += amt;
        if (pay.received) {
          t.collected += amt;
        } else if (pay.due_date && pay.due_date < today) {
          t.overdue += amt;
        }
      });

      quotationsData.forEach(q => {
        const t = byProject[q.project_id];
        if (t) t.quotations.push(q);
      });

      // Two different questions, deliberately kept as two numbers:
      //   outstanding      net position, overpayments allowed to offset debts
      //   outstandingOwed  what clients actually still owe, summed per project
      // They differ only when a project is overpaid. Previously three places
      // clamped at different levels — Overview clamped the TOTAL while Reports
      // and the chart clamped EACH project — so an overpaid project made the
      // tabs disagree with no indication which was right.
      let collected = 0, scheduled = 0, outstanding = 0, overdue = 0, contractTotal = 0;
      let outstandingOwed = 0, overpaidTotal = 0;
      Object.values(byProject).forEach(t => {
        // What the client owes in total is the agreed value plus anything added
        // afterwards — not the sum of the payment schedule, which may be
        // incomplete while installments are still being agreed.
        t.contractTotal = t.value + t.addonsTotal;
        t.outstanding = t.contractTotal - t.collected;
        t.payments.sort((a, b) =>
          (a.sort_order - b.sort_order) || String(a.due_date || '').localeCompare(String(b.due_date || '')));

        collected += t.collected;
        scheduled += t.scheduled;
        outstanding += t.outstanding;
        outstandingOwed += Math.max(0, t.outstanding);
        overpaidTotal += Math.max(0, -t.outstanding);
        overdue += t.overdue;
        contractTotal += t.contractTotal;
      });

      // ---- expenses, split by WHO THE PURCHASE WAS FOR ----
      //
      // Both kinds are paid with company money and leave the account.
      // company  -> shrinks the pool, so the cost is shared by the split
      // personal -> comes off the buyer's slice of the pool alone
      //
      // Rows written before `scope` existed have no value; they are treated as
      // 'company', which is what every expense meant at the time.
      let expenses = 0;             // everything, for reporting and for cash
      let companyExpenses = 0;      // shrinks the pool before it is divided
      const personalSpend = {};     // deducted from that partner's slice
      const unattributed = [];
      PARTNERS.forEach(p => { personalSpend[p] = 0; });

      expensesData.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        expenses += amt;
        const isPersonal = String(e.scope || 'company').trim().toLowerCase() === 'personal';

        if (!isPersonal) { companyExpenses += amt; return; }

        // Only PERSONAL expenses need to be charged to someone. A company
        // expense with a missing paid_by is untidy but harmless — the cost is
        // shared either way. A personal one with no owner cannot be charged at
        // all, so it is flagged rather than silently absorbed.
        const who = PARTNERS.find(p => p.toLowerCase() === String(e.paid_by || '').trim().toLowerCase());
        if (who) personalSpend[who] += amt;
        else unattributed.push(e);
      });

      const withdrawn = {};
      PARTNERS.forEach(p => { withdrawn[p] = 0; });
      let withdrawnTotal = 0;
      withdrawalsData.forEach(w => {
        const amt = parseFloat(w.amount) || 0;
        withdrawnTotal += amt;
        const who = PARTNERS.find(p => p.toLowerCase() === String(w.partner || '').trim().toLowerCase());
        if (who) withdrawn[who] += amt;
      });

      // NO SST. The studio does not charge it — money collected on a project
      // belongs to the partners in full. An earlier model held a portion back
      // for a tax authority that never bills them, which simply understated
      // both balances. `sstReserved` is kept as a permanent 0 so the identity
      // below still reads as a subtraction and nothing downstream breaks.
      //
      const sstReserved = 0;

      // Company profitability, for REPORTING only — includes personal spending,
      // which is why it is NOT what the shares derive from. See the header.
      const netProfit = collected - expenses;

      // The pot being divided. Company expenses come off it, because both
      // partners carry those. Personal spending does not appear at all.
      const distributablePool = collected - companyExpenses;

      const share = {};
      const balance = {};
      PARTNERS.forEach(p => {
        // Always 50/50, but read the setting so Settings still means something.
        const pct = (systemSettings.partner_split?.[p] ?? (100 / PARTNERS.length)) / 100;
        share[p] = distributablePool * pct;
        // Personal spending is money this partner has already taken out of the
        // business, so it reduces what is left for them exactly as a withdrawal
        // does. No reimbursement term: the company card paid, not the partner.
        balance[p] = share[p] - personalSpend[p] - withdrawn[p];
      });

      // EVERY expense leaves this account — company and personal alike — so
      // both come off the cash figure. The previous model excluded them on the
      // assumption that partners paid personally, which overstated the balance
      // by the full amount ever spent.
      const cashInAccount = collected - expenses - withdrawnTotal;
      const balanceSum = PARTNERS.reduce((s, p) => s + balance[p], 0);
      // Nothing is earmarked, so every ringgit in the account is distributable.
      const distributable = cashInAccount;

      fin = {
        byProject, collected, scheduled, outstanding, outstandingOwed, overpaidTotal,
        overdue, contractTotal,
        expenses, companyExpenses, netProfit, share, withdrawn, balance,
        personalSpend, distributablePool,
        withdrawnTotal, cashInAccount, sstReserved, distributable, unattributed,
        // `loadErrors.length` is part of this on purpose. The arithmetic
        // invariant cannot detect a table that failed to load — drop `expenses`
        // and it balances perfectly at the wrong numbers, because the missing
        // amount cancels on both sides. Incomplete input means "not reconciled",
        // regardless of what the sums say.
        //
        // Compare in cents; floats will not land on exact equality.
        //
        // Against `distributable`, which now equals cashInAccount — nothing is
        // held back:
        //   Σbalance = pool − Σpersonal − Σwithdrawn
        //            = (collected − companyExpenses) − personal − withdrawn
        //            = collected − allExpenses − withdrawn
        //            = distributable
        // Company spending reaches it through the pool, personal through the
        // per-partner deduction — so every ringgit that left the account is
        // accounted for exactly once on each side.
        reconciled: loadErrors.length === 0
                    && Math.abs(balanceSum - distributable) < 0.01
                    && unattributed.length === 0
      };
      return fin;
    }

    /**
     * Persistent banner when any table failed to load.
     *
     * Deliberately loud and not dismissible. The failure mode this guards
     * against is silent: the page renders complete, plausible, wrong numbers,
     * and every other indicator agrees with them.
     */
    function renderLoadErrorBanner() {
      const host = document.querySelector('.main-content');
      if (!host) return;
      let el = document.getElementById('loadErrorBanner');

      if (!loadErrors.length) {
        if (el) el.remove();
        return;
      }

      if (!el) {
        el = document.createElement('div');
        el.id = 'loadErrorBanner';
        el.setAttribute('role', 'alert');
        el.style.cssText =
          'background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.5);' +
          'border-radius: 12px; padding: 1rem 1.25rem; margin-bottom: 1.5rem;' +
          'font-size: 0.85rem; line-height: 1.6;';
        host.prepend(el);
      }

      const rows = loadErrors.map(e =>
        `<li><strong>${esc(e.table)}</strong> — ${esc(e.message)}${e.hint ? ` <em>(${esc(e.hint)})</em>` : ''}</li>`
      ).join('');

      el.innerHTML = `
        <div style="color:var(--neg);font-weight:600;margin-bottom:0.4rem;">
          &#9888; Some data could not be loaded — the figures below are incomplete
        </div>
        <div style="color:var(--bone-dim);margin-bottom:0.6rem;">
          Every total, balance and chart on this dashboard is derived from these tables.
          Do not settle up or make decisions from these numbers until this is resolved.
        </div>
        <ul style="color:var(--bone-dim);margin:0 0 0 1.1rem;">${rows}</ul>`;
    }

    /** Per-project totals, safe for a project with no payments yet. */
    function projectFin(id) {
      return fin.byProject[id] || {
        value: 0, addons: [], addonsTotal: 0, addonsUnbilled: 0, payments: [], quotations: [],
        scheduled: 0, collected: 0, outstanding: 0, overdue: 0, contractTotal: 0
      };
    }

    /**
     * Received payments bucketed by the month the money actually arrived.
     * Returns [['YYYY-MM', amount], …].
     *
     * One helper because the Overview chart, Cash Flow and Reports all needed
     * this and each used to hand-roll it off the deposit/final dates — three
     * copies of the same loop, which is how they ended up disagreeing.
     */
    function revenueByMonth() {
      const buckets = {};
      paymentsData.forEach(pay => {
        if (!pay.received || !pay.received_date) return;
        const key = String(pay.received_date).substring(0, 7);
        if (key.length !== 7) return;
        buckets[key] = (buckets[key] || 0) + (parseFloat(pay.amount) || 0);
      });
      return Object.entries(buckets).sort((a, b) => a[0].localeCompare(b[0]));
    }

    async function loadAllData() {
      try {
        // Parallel fetching
        const [projectsRes, expensesRes, teamRes, servicesRes, showcaseRes, settingsRes,
               withdrawalsRes, paymentsRes, addonsRes, quotationsRes] = await Promise.all([
          supabaseClient.from('projects').select('*').order('created_at', { ascending: false }),
          supabaseClient.from('expenses').select('*').order('date', { ascending: false }),
          supabaseClient.from('team_members').select('*').order('name'),
          supabaseClient.from('services').select('*').order('num'),
          supabaseClient.from('showcase_projects').select('*').order('created_at', { ascending: false }),
          supabaseClient.from('system_settings').select('*'),
          supabaseClient.from('partner_withdrawals').select('*').order('date', { ascending: false }),
          supabaseClient.from('project_payments').select('*').order('sort_order'),
          supabaseClient.from('project_addons').select('*').order('date', { ascending: false }),
          supabaseClient.from('quotations').select('*').order('quote_date', { ascending: false })
        ]);

        /* A failed fetch used to be console.error'd and then coerced to [] —
           which is far worse than it sounds. Lose the `expenses` request and the
           dashboard does not just under-report: the reconciliation panel keeps
           saying "Balanced", because the invariant
           balance(A)+balance(B) === collected − withdrawn holds *identically*
           when expenses is 0. The one element designed to catch bad data ends up
           vouching for it, and partners settle against numbers that are wrong.

           So a failed load is now recorded, surfaced as a banner, and forces
           `fin.reconciled` false. Anything missing means every derived figure is
           suspect, and the page has to say so. */
        loadErrors = [];
        const noteError = (label, res, hint) => {
          if (res && res.error) {
            console.error(`Error fetching ${label}:`, res.error);
            loadErrors.push({ table: label, message: res.error.message || String(res.error), hint: hint || '' });
          }
        };
        const MIGRATION_HINT = 'run supabase_migration_02_financials.sql';
        noteError('projects', projectsRes);
        noteError('expenses', expensesRes);
        noteError('team_members', teamRes);
        noteError('services', servicesRes);
        noteError('showcase_projects', showcaseRes);
        noteError('system_settings', settingsRes);
        noteError('partner_withdrawals', withdrawalsRes);
        noteError('project_payments', paymentsRes, MIGRATION_HINT);
        noteError('project_addons', addonsRes, MIGRATION_HINT);
        noteError('quotations', quotationsRes, MIGRATION_HINT);

        projectsData = projectsRes.data || [];
        expensesData = expensesRes.data || [];
        teamData = teamRes.data || [];
        servicesData = servicesRes.data || [];
        showcaseData = showcaseRes.data || [];
        withdrawalsData = withdrawalsRes.data || [];
        paymentsData = paymentsRes.data || [];
        addonsData = addonsRes.data || [];
        quotationsData = quotationsRes.data || [];

        if (settingsRes.data) {
          settingsRes.data.forEach(item => {
            systemSettings[item.key] = item.value;
          });
        }

        // Everything below reads `fin`, so this has to run before any render.
        computeFinancials();
        renderLoadErrorBanner();

        // Populate dropdowns first
        populateDropdowns();

        // Render UI parts
        renderOverview();
        renderProjects();
        renderPayments();
        renderQuotations();
        renderExpenses();
        renderCashflow();
        renderPartners();
        renderReports();
        renderTeam();
        renderServices();
        renderProjectShowcase();

        // Both need the rows to exist first.
        applyResponsiveTableLabels();
        markScrollableTables();

        // Every render above rebuilds the projects tbody from scratch, which
        // destroys the expanded detail rows. Nine handlers used to have to
        // remember to call this themselves and most did not, so editing a
        // payment label collapsed the panel you were working in. Doing it here
        // means it cannot be forgotten by the next handler either.
        refreshOpenDetails();
      } catch (err) {
        // The per-table error capture above only runs when Promise.all
        // RESOLVES. A network drop or an expired token makes it REJECT, so
        // none of it ran: no banner, no re-render, and the previous render
        // stays on screen looking complete and current. On first load it is
        // worse — the overlay is hidden anyway, showing RM 0.00 everywhere.
        // Push a synthetic error so the banner speaks for the whole load.
        console.error("Failed to load database content:", err);
        loadErrors.push({
          table: 'all tables',
          message: (err && err.message) || String(err),
          hint: 'The whole load failed, so every figure on screen is stale or zero. Check your connection and reload; if it persists, sign out and back in.'
        });
        try {
          renderLoadErrorBanner();
        } catch (bannerErr) {
          console.error("Could not render the load-error banner:", bannerErr);
        }
      }
    }

    /**
     * Today's date as YYYY-MM-DD in the LOCAL timezone.
     *
     * `new Date().toISOString().substring(0,10)` gives the UTC date, and the
     * studio runs at UTC+8. Between 00:00 and 08:00 MYT that is yesterday. A
     * RM5,000 deposit ticked off at 07:30 on 1 August was stamped 2026-07-31
     * and booked as JULY revenue everywhere — the Overview line chart, the Cash
     * Flow table, the Cash Position chart and the Reports bars all read from
     * received_date. Half an hour later "received this month" rolled over and
     * the payment vanished from the tab on the day it arrived.
     */
    function todayLocal() {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    // Formatter helpers
    function formatMYR(val) {
      const v = parseFloat(val) || 0;
      return new Intl.NumberFormat('en-MY', { style: 'currency', currency: 'MYR' }).format(v);
    }

    // Toast Notification System
    function showToast(message, type = 'success') {
      const container = document.getElementById('toastContainer');
      if (!container) return;
      
      const toast = document.createElement('div');
      toast.className = 'glass-card';
      toast.style.pointerEvents = 'all';
      toast.style.minWidth = '250px';
      toast.style.padding = '0.75rem 1.25rem';
      toast.style.borderRadius = '8px';
      toast.style.border = '1px solid var(--glass-border)';
      toast.style.boxShadow = '0 8px 32px rgba(0,0,0,0.2)';
      toast.style.transform = 'translateY(20px)';
      toast.style.opacity = '0';
      toast.style.transition = 'all 0.3s ease';
      toast.style.fontSize = '0.85rem';
      toast.style.fontFamily = 'var(--font-mono)';
      
      let color = 'var(--bone)';
      let accent = 'var(--accent)';
      if (type === 'error') {
        color = 'var(--neg)';
        accent = 'var(--neg)';
      } else if (type === 'warning') {
        color = 'var(--warn)';
        accent = 'var(--warn)';
      } else if (type === 'success') {
        color = 'var(--pos)';
        accent = 'var(--pos)';
      }
      
      toast.style.color = color;
      toast.style.borderLeft = `4px solid ${accent}`;
      toast.textContent = message;
      
      container.appendChild(toast);
      
      setTimeout(() => {
        toast.style.transform = 'translateY(0)';
        toast.style.opacity = '1';
      }, 10);
      
      setTimeout(() => {
        toast.style.transform = 'translateY(-20px)';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
      }, 3000);
    }
    
    function parseLocalDate(dateStr) {
      if (!dateStr) return null;
      if (dateStr instanceof Date) return dateStr;
      const parts = String(dateStr).split('-');
      if (parts.length === 3) {
        return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      }
      const d = new Date(dateStr);
      return isNaN(d) ? null : d;
    }

    function formatDate(dateStr) {
      if (!dateStr) return '';
      const d = parseLocalDate(dateStr);
      if (!d) return dateStr;
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${day}/${month}/${year}`;
    }

    /**
     * "02 Jul" — for the expense card's second line on a phone, where the full
     * dd/mm/yyyy squeezed the category badge down to "Software & Subscr…".
     * The year is dropped deliberately: these are this year's costs, and the
     * full date is one tap away in the editor.
     */
    function formatDateShort(dateStr) {
      if (!dateStr) return '';
      const d = parseLocalDate(dateStr);
      if (!d) return dateStr;
      return `${String(d.getDate()).padStart(2, '0')} ` +
             d.toLocaleString('en-US', { month: 'short' });
    }

    function clearProjectFilters() {
      const sClient = document.getElementById('projectSearchClient');
      const fStatus = document.getElementById('projectFilterStatus');
      const fDate = document.getElementById('projectFilterDate');
      if (sClient) sClient.value = '';
      if (fStatus) fStatus.value = '';
      if (fDate) fDate.value = '';
      renderProjects();
    }

    function clearExpenseFilters() {
      const fCat = document.getElementById('expenseFilterCategory');
      const fPaid = document.getElementById('expenseFilterPaidBy');
      const fRec = document.getElementById('expenseFilterRecurring');
      if (fCat) fCat.value = '';
      if (fPaid) fPaid.value = '';
      if (fRec) fRec.value = '';
      renderExpenses();
    }

    function populateDropdowns() {
      // Partners only — NOT the wider team. Two reasons: a personal expense is
      // charged against a partner's share, and a non-partner has no share to
      // charge; and the DB constrains paid_by to these two names, so offering a
      // team member here would fail on insert with a raw constraint error. Who
      // *does the work* is projectAssignedTo, below, which does still include
      // the team.
      const paidBySelect = document.getElementById('expensePaidBy');
      if (paidBySelect) {
        const prevVal = paidBySelect.value;
        paidBySelect.innerHTML = '<option value="">Select partner</option>' +
          PARTNERS.map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
        paidBySelect.value = PARTNERS.includes(prevVal) ? prevVal : '';
      }
      
      const assignSelect = document.getElementById('projectAssignedTo');
      if (assignSelect) {
        const prevVal = assignSelect.value;
        assignSelect.innerHTML = '<option value="">Unassigned</option>';
        const names = new Set(['Kunacosta', 'Rooben']);
        teamData.forEach(m => {
          if (m.name) names.add(m.name);
        });
        names.forEach(name => {
          assignSelect.innerHTML += `<option value="${esc(name)}">${esc(name)}</option>`;
        });
        assignSelect.value = prevVal;
      }
      
      const linkedProjSelect = document.getElementById('expenseLinkedProject');
      if (linkedProjSelect) {
        const prevVal = linkedProjSelect.value;
        linkedProjSelect.innerHTML = '<option value="">None</option>';
        projectsData.forEach(p => {
          linkedProjSelect.innerHTML += `<option value="${p.id}">${esc(p.name)} (${esc(p.client)})</option>`;
        });
        linkedProjSelect.value = prevVal;
      }
    }

    /* openDepositPrompt / closeDepositPrompt and the #depositPromptModal markup
       were removed here. They had zero callers and existed for the fixed
       deposit_amount / deposit_received_date columns that migration 02 dropped
       when payments became an arbitrary schedule in project_payments. The
       Escape and backdrop handlers used to special-case that modal id; those
       branches went with it. */

    /**
     * @param {string} field  currently always 'status' — the only caller passes
     *   that, and the body writes `status` unconditionally. Kept in the
     *   signature rather than silently ignored, so a second caller passing
     *   something else fails loudly instead of corrupting the status column.
     */
    async function handleInlineProjectUpdate(projectId, field, value, selectEl) {
      if (field !== 'status') {
        console.error(`handleInlineProjectUpdate only handles 'status', got '${field}'`);
        showToast('Internal error: unsupported field', 'error');
        return;
      }
      const p = projectsData.find(item => item.id === projectId);
      if (!p) { showToast('Project not found', 'error'); return; }


      // ── STATUS ──
      if (selectEl) selectEl.disabled = true;
      showToast('Saving changes...', 'info');
      try {
        const { error } = await supabaseClient.from('projects').update({ status: value }).eq('id', projectId);
        if (error) throw error;
        showToast('Status updated', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
        if (selectEl) { selectEl.disabled = false; selectEl.value = p.status; }
      }
    }

    // RENDER OVERVIEW
    // Redesigned Dashboard Overview Redraw
    /**
     * Swap the whole Overview for a "get started" card when there is nothing
     * to show.
     *
     * An empty database used to render five RM 0.00s, three 0% rings, a flat
     * line chart and a radar chart drawing a solid pentagon labelled
     * N/A N/A N/A N/A N/A. The problem is not that it looks unfinished — it is
     * that it is INDISTINGUISHABLE from an RLS denial, which produces exactly
     * the same screen (200 with zero rows, see the note in loadAllData). One of
     * those states means "add a project", the other means "your access is
     * broken", and the user could not tell them apart.
     *
     * Deliberately NOT shown when loadErrors is non-empty — that is the failure
     * case, and its banner must not be replaced by a cheerful onboarding card.
     */
    function renderOverviewEmptyState() {
      const layout = document.querySelector('.overview-layout');
      if (!layout) return false;

      const hasNothing = projectsData.length === 0
        && expensesData.length === 0
        && paymentsData.length === 0
        && !loadErrors.length;

      let card = document.getElementById('overviewEmptyState');
      if (!hasNothing) {
        if (card) card.remove();
        layout.style.display = '';
        return false;
      }

      layout.style.display = 'none';
      if (card) return true;

      card = document.createElement('div');
      card.id = 'overviewEmptyState';
      card.className = 'glass-card';
      card.style.cssText = 'padding: 3rem 2rem; text-align: center; max-width: 560px; margin: 2rem auto;';
      card.innerHTML = `
        <div style="font-size: 2rem; margin-bottom: 0.75rem;" aria-hidden="true">&#128203;</div>
        <h2 style="font-family: var(--font-display); font-size: 1.35rem; font-weight: 500; margin-bottom: 0.6rem;">
          Nothing tracked yet
        </h2>
        <p style="color: var(--bone-dim); font-size: 0.9rem; line-height: 1.6; margin-bottom: 1.5rem;">
          Add your first project and this page fills in on its own &mdash; value,
          what has been collected, what is still owed, and how it splits between
          the two of you.
        </p>
        <button class="btn-primary" style="width: auto; padding: 0.7rem 1.6rem;"
                onclick="switchTab('projects'); openProjectModal();">
          Add your first project
        </button>
        <p style="color: var(--bone-dim); font-size: 0.75rem; margin-top: 1.25rem; line-height: 1.5;">
          Seeing this when you know there is data? That points at a permissions
          problem rather than an empty database &mdash; check you are signed in as
          an admin.
        </p>`;
      layout.parentNode.insertBefore(card, layout);
      return true;
    }

    function renderOverview() {
      // Bail before drawing empty axes and an N/A pentagon.
      if (renderOverviewEmptyState()) return;

      let totalProjectValue = 0;
      let totalCollected = 0;
      let totalExpenses = 0;
      let activeProjects = 0;
      let nextDeadline = null;

      const now = new Date();
      now.setHours(0,0,0,0);

      // Money comes from computeFinancials(); this loop only handles the
      // non-financial bits (active count, next deadline).
      projectsData.forEach(p => {
        if (p.status === 'In Progress') {
          activeProjects++;

          if (p.deadline) {
            const deadlineDate = parseLocalDate(p.deadline);
            if (deadlineDate && deadlineDate >= now) {
              if (!nextDeadline || deadlineDate < nextDeadline) {
                nextDeadline = deadlineDate;
              }
            }
          }
        }
      });

      // Contract value = agreed value + approved add-ons, so an upsell shows up
      // in the pipeline instead of being invisible until it is invoiced.
      totalProjectValue = fin.contractTotal;
      totalCollected = fin.collected;
      totalExpenses = fin.expenses;

      // Read the shared figure rather than clamping the total here — clamping
      // the SUM lets an overpaid project cancel out another client's debt, and
      // Reports clamps per project, so the two tabs used to disagree.
      const totalOutstanding = fin.outstandingOwed;
      // Cash in the shared account: collected, less every expense (all paid
      // from this account), less what the partners have withdrawn.
      const cashBalance = fin.cashInAccount;
      const netProfitCollected = fin.netProfit;
      const expectedProfit = totalProjectValue - totalExpenses;
      const profitMargin = totalProjectValue > 0 ? (expectedProfit / totalProjectValue) * 100 : 0;

      // Update KPI text details
      document.getElementById('kpiTotalProjectValue').textContent = formatMYR(totalProjectValue);
      document.getElementById('kpiActiveProjects').textContent = `Active Projects: ${activeProjects}`;

      const cashEl = document.getElementById('kpiCashBalance');
      cashEl.textContent = formatMYR(cashBalance);
      cashEl.style.color = cashBalance >= 0 ? 'var(--pos)' : 'var(--neg)';
      document.getElementById('kpiNextDeadline').textContent = `Next Deadline: ${nextDeadline ? formatDate(nextDeadline) : 'N/A'}`;

      // ---- monthly targets ----
      // These were saved in Settings and read by nothing at all, so you could
      // set a revenue target, watch it persist, and never see it again.
      // Measured against THIS month, which is what a monthly target means.
      const targets = systemSettings.financial_targets || {};
      const revTarget = parseFloat(targets.revenue_target) || 0;
      const expTarget = parseFloat(targets.expense_target) || 0;
      const thisMonth = todayLocal().substring(0, 7);

      // revenueByMonth() returns SORTED [month, amount] PAIRS, not an object —
      // indexing it by month name silently yields undefined.
      const revEntry = revenueByMonth().find(([m]) => m === thisMonth);
      const revThisMonth = revEntry ? revEntry[1] : 0;
      const expThisMonth = expensesData.reduce((s, e) =>
        s + (String(e.date || '').substring(0, 7) === thisMonth ? (parseFloat(e.amount) || 0) : 0), 0);

      const renderTarget = (elId, actual, target, label, goodWhenUnder) => {
        const el = document.getElementById(elId);
        if (!el) return;
        if (!target) {
          el.innerHTML = `<span style="color:var(--bone-dim);">No ${label} target set &mdash; add one in Settings.</span>`;
          return;
        }
        const pctOf = Math.round((actual / target) * 100);
        const good = goodWhenUnder ? actual <= target : actual >= target;
        el.innerHTML =
          `<span style="color:${good ? 'var(--pos)' : 'var(--warn)'};font-weight:600;">${pctOf}%</span> ` +
          `<span style="color:var(--bone-dim);">of the ${formatMYR(target)} monthly ${label} target ` +
          `(${formatMYR(actual)} this month).</span>`;
      };
      renderTarget('targetRevenueProgress', revThisMonth, revTarget, 'revenue', false);
      renderTarget('targetExpenseProgress', expThisMonth, expTarget, 'expense', true);

      document.getElementById('kpiCollected').textContent = formatMYR(totalCollected);
      // Surface overpayment rather than letting it silently reduce the figure.
      document.getElementById('kpiOutstanding').textContent =
        `Outstanding: ${formatMYR(totalOutstanding)}` +
        (fin.overpaidTotal > 0.01 ? ` (${formatMYR(fin.overpaidTotal)} overpaid elsewhere)` : '');

      const netEl = document.getElementById('kpiNetProfitCollected');
      netEl.textContent = formatMYR(netProfitCollected);
      netEl.style.color = netProfitCollected >= 0 ? 'var(--pos)' : 'var(--neg)';
      document.getElementById('kpiTotalExpenses').textContent = `Expenses: ${formatMYR(totalExpenses)}`;

      // Update circular progress rings (Circumference = 138.23 for r=22)
      const ringCircumference = 138.23;

      const collectedPercent = totalProjectValue > 0 ? Math.min(100, Math.max(0, Math.round((totalCollected / totalProjectValue) * 100))) : 0;
      document.getElementById('collectedPercent').textContent = `${collectedPercent}%`;
      const collectedRing = document.getElementById('collectedRing');
      if (collectedRing) {
        const offset = ringCircumference - (collectedPercent / 100) * ringCircumference;
        collectedRing.style.strokeDashoffset = offset;
      }

      const marginPercent = Math.min(100, Math.max(0, Math.round(profitMargin)));
      document.getElementById('profitPercent').textContent = `${marginPercent}%`;
      const profitRing = document.getElementById('profitRing');
      if (profitRing) {
        const offset = ringCircumference - (marginPercent / 100) * ringCircumference;
        profitRing.style.strokeDashoffset = offset;
      }

      // Build Donut Allocation Legend
      const categories = {};
      expensesData.forEach(e => {
        const cat = e.category || 'Other';
        categories[cat] = (categories[cat] || 0) + (parseFloat(e.amount) || 0);
      });

      /* Top 6 by value, everything else rolled into "Other".
         There are only 7 colours, and the categories list runs to 19 — so with
         11 in play the palette wrapped and four legend rows shared a colour
         with a ring segment they had nothing to do with. Colour is the ONLY
         thing tying a legend row to its slice, so that made the chart
         misleading rather than merely crowded.
         Capping at 6 also happens to be better information design: a donut of
         19 near-identical slivers answers no question anyone actually has. */
      const CAT_LIMIT = 6;
      const ranked = Object.entries(categories).sort((a, b) => b[1] - a[1]);
      const head = ranked.slice(0, CAT_LIMIT);
      const tail = ranked.slice(CAT_LIMIT);
      const tailTotal = tail.reduce((s, [, v]) => s + v, 0);

      const labels = head.map(([k]) => k).concat(
        tail.length ? [`Other (${tail.length} categor${tail.length === 1 ? 'y' : 'ies'})`] : []);
      const data = head.map(([, v]) => v).concat(tail.length ? [tailTotal] : []);

      // 7 entries for at most 7 slices — the palette can no longer wrap.
      const chartColors = [
        'rgba(56, 224, 255, 0.8)',   // Cyan
        'rgba(244, 63, 94, 0.8)',    // Rose
        'rgba(167, 139, 250, 0.8)',  // Purple
        'rgba(251, 191, 36, 0.8)',   // Amber
        'rgba(74, 222, 128, 0.8)',   // Emerald Green
        'rgba(56, 130, 224, 0.8)',   // Blue
        'rgba(148, 163, 184, 0.8)'   // Slate — reads as "the rest", for Other
      ];

      const legendEl = document.getElementById('donutLegend');
      if (legendEl) {
        legendEl.innerHTML = '';
        labels.forEach((label, idx) => {
          const val = data[idx];
          const percent = totalExpenses > 0 ? Math.round((val / totalExpenses) * 100) : 0;
          const color = chartColors[idx % chartColors.length];
          legendEl.innerHTML += `
            <div class="legend-item">
              <div class="legend-dot-wrapper">
                <span class="legend-dot" style="background-color: ${color};"></span>
                <!-- No max-width: 110px truncated 6 of 11 labels even on a
                     ~760px card. Let flexbox decide, and only ellipsise when
                     the row genuinely runs out of room. -->
                <span style="min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"
                      title="${esc(label)}">${esc(label)}</span>
              </div>
              <span>${percent}%</span>
            </div>
          `;
        });
        if (labels.length === 0) {
          legendEl.innerHTML = `<div style="text-align: center; color: var(--bone-dim); font-size: 0.75rem; padding-top: 1rem;">No Expense Records</div>`;
        }
      }

      // Donut Center Text
      document.getElementById('donutCenterVal').textContent = `${marginPercent}%`;

      // Build Overview Charts
      initRedesignedCharts(labels, data, chartColors);
    }

    function initRedesignedCharts(catLabels, catData, chartColors) {
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const textColor = isLight ? '#1d1d1f' : '#ffffff';
      const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.05)';
      const chartBorderColor = isLight ? '#ffffff' : 'rgba(25, 25, 25, 1)';

      // 1. DOUGHNUT CHART (Expense Allocation)
      if (categoryChartInstance) {
        categoryChartInstance.destroy();
      }
      const ctxCat = document.getElementById('categoryChart').getContext('2d');
      categoryChartInstance = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: catLabels.length > 0 ? catLabels : ['No Expenses'],
          datasets: [{
            data: catData.length > 0 ? catData : [1],
            backgroundColor: catLabels.length > 0 ? chartColors.slice(0, catLabels.length) : ['rgba(255,255,255,0.05)'],
            borderColor: chartBorderColor,
            borderWidth: 2,
            hoverOffset: 4
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '72%',
          plugins: {
            legend: { display: false }
          }
        }
      });

      // Aggregate monthly cashflow data for Line Chart & Bar Chart
      const monthlyData = {};
      // Revenue is every received payment, bucketed by the month it arrived.
      // The DB constraint guarantees a received payment has a received_date, so
      // nothing can silently fall out of these buckets.
      revenueByMonth().forEach(([mKey, amt]) => {
        if (!monthlyData[mKey]) monthlyData[mKey] = { rev: 0, exp: 0 };
        monthlyData[mKey].rev += amt;
      });

      expensesData.forEach(e => {
        if (e.date) {
          const mKey = String(e.date).substring(0, 7);
          if (mKey.length === 7) {
            if (!monthlyData[mKey]) monthlyData[mKey] = { rev: 0, exp: 0 };
            monthlyData[mKey].exp += parseFloat(e.amount) || 0;
          }
        }
      });

      const sortedMonths = Object.keys(monthlyData).sort();
      const monthNames = sortedMonths.map(mKey => {
        const [year, month] = mKey.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('en-US', { month: 'short' });
      });

      const revData = sortedMonths.map(mKey => monthlyData[mKey].rev);
      const expData = sortedMonths.map(mKey => monthlyData[mKey].exp);
      const netProfitData = sortedMonths.map(mKey => monthlyData[mKey].rev - monthlyData[mKey].exp);

      // Default fallback labels if no data yet
      const fallbackMonths = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
      const displayMonths = monthNames.length > 0 ? monthNames : fallbackMonths;
      const displayRev = revData.length > 0 ? revData : [0, 0, 0, 0, 0, 0];
      const displayExp = expData.length > 0 ? expData : [0, 0, 0, 0, 0, 0];
      const displayNet = netProfitData.length > 0 ? netProfitData : [0, 0, 0, 0, 0, 0];

      // 2. FINANCIAL FLOW (Line Chart)
      if (flowLineChartInstance) {
        flowLineChartInstance.destroy();
      }
      
      const ctxLine = document.getElementById('flowLineChart').getContext('2d');
      flowLineChartInstance = new Chart(ctxLine, {
        type: 'line',
        data: {
          labels: displayMonths,
          datasets: [
            {
              label: 'Revenue',
              data: displayRev,
              borderColor: 'rgba(56, 224, 255, 1)',
              backgroundColor: 'rgba(56, 224, 255, 0.05)',
              tension: 0.4,
              borderWidth: 3,
              pointBackgroundColor: 'rgba(56, 224, 255, 1)',
              fill: true,
              hidden: currentLineChartFilter === 'expenses'
            },
            {
              label: 'Expenses',
              data: displayExp,
              borderColor: 'rgba(244, 63, 94, 1)',
              backgroundColor: 'rgba(244, 63, 94, 0.05)',
              tension: 0.4,
              borderWidth: 3,
              pointBackgroundColor: 'rgba(244, 63, 94, 1)',
              fill: true,
              hidden: currentLineChartFilter === 'revenue'
            },
            {
              label: 'Net Profit',
              data: displayNet,
              borderColor: 'rgba(167, 139, 250, 1)',
              backgroundColor: 'rgba(167, 139, 250, 0.05)',
              tension: 0.4,
              borderWidth: 3,
              pointBackgroundColor: 'rgba(167, 139, 250, 1)',
              fill: true,
              hidden: currentLineChartFilter !== 'all'
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
            }
          }
        }
      });

      // 3. MONTHLY TREND (Bar Chart)
      if (trendBarChartInstance) {
        trendBarChartInstance.destroy();
      }

      // Take last 4 months for clean bar layout
      const barMonths = displayMonths.slice(-4);
      const barNet = displayNet.slice(-4);

      const ctxBar = document.getElementById('trendBarChart').getContext('2d');
      // Create Gradient color for Bars (blue to purple)
      const barGradient = ctxBar.createLinearGradient(0, 0, 0, 200);
      barGradient.addColorStop(0, 'rgba(56, 224, 255, 0.95)');
      barGradient.addColorStop(1, 'rgba(167, 139, 250, 0.7)');

      trendBarChartInstance = new Chart(ctxBar, {
        type: 'bar',
        data: {
          labels: barMonths,
          datasets: [{
            label: 'Net Profit',
            data: barNet,
            backgroundColor: barGradient,
            borderRadius: 6,
            borderWidth: 0,
            barPercentage: 0.5
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            x: {
              grid: { display: false },
              ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
            },
            y: {
              grid: { color: gridColor },
              ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
            }
          }
        }
      });

      // 4. CATEGORY COVERAGE (Radar Chart)
      if (coverageRadarChartInstance) {
        coverageRadarChartInstance.destroy();
      }

      const radarLabels = catLabels.length > 0 ? catLabels : ['N/A', 'N/A', 'N/A', 'N/A', 'N/A'];
      const radarData = catData.length > 0 ? catData : [0, 0, 0, 0, 0];

      const ctxRadar = document.getElementById('coverageRadarChart').getContext('2d');
      coverageRadarChartInstance = new Chart(ctxRadar, {
        type: 'radar',
        data: {
          labels: radarLabels,
          datasets: [{
            label: 'Allocation',
            data: radarData,
            borderColor: 'rgba(56, 224, 255, 0.8)',
            backgroundColor: 'rgba(56, 224, 255, 0.2)',
            borderWidth: 2,
            pointBackgroundColor: 'rgba(56, 224, 255, 1)'
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { display: false }
          },
          scales: {
            r: {
              angleLines: { color: gridColor },
              grid: { color: gridColor },
              pointLabels: { color: textColor, font: { family: 'Outfit', size: 9 } },
              ticks: { display: false }
            }
          }
        }
      });
    }

    // Handle dataset toggles in redesigned Financial Flow chart
    function setLineChartFilter(filter) {
      currentLineChartFilter = filter;
      
      // Update active toggle button style
      const toggles = ['all', 'revenue', 'expenses'];
      const toggleIds = ['btnToggleAll', 'btnToggleRev', 'btnToggleExp'];
      
      toggles.forEach((t, i) => {
        const btn = document.getElementById(toggleIds[i]);
        if (btn) {
          if (t === filter) btn.classList.add('active');
          else btn.classList.remove('active');
        }
      });

      // Redraw overview to apply changes
      renderOverview();
    }

    // RENDER PROJECTS
    function renderProjects() {
      const tbody = document.getElementById('projectsTableBody');
      const tfoot = document.getElementById('projectsTableFooter');
      tbody.innerHTML = '';
      tfoot.innerHTML = '';
      
      const searchClient = document.getElementById('projectSearchClient')?.value.toLowerCase() || '';
      const filterStatus = document.getElementById('projectFilterStatus')?.value || '';
      const filterDate = document.getElementById('projectFilterDate')?.value || '';
      
      const filtered = projectsData.filter(p => {
        if (searchClient) {
          const clientName = (p.client || '').toLowerCase();
          const projName = (p.name || '').toLowerCase();
          if (!clientName.includes(searchClient) && !projName.includes(searchClient)) return false;
        }
        if (filterStatus && p.status !== filterStatus) return false;
        if (filterDate) {
          if (p.start_date !== filterDate && p.deadline !== filterDate) return false;
        }
        return true;
      });

      if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="10" style="text-align: center; color: var(--bone-dim);">No projects match the filters.</td></tr>`;
        return;
      }

      let totalVal = 0;
      let totalAddons = 0;
      let totalCol = 0;
      let totalOut = 0;

      filtered.forEach(p => {
        const t = projectFin(p.id);
        const val = t.value;
        const col = t.collected;
        const out = t.outstanding;

        totalVal += val;
        totalAddons += t.addonsTotal;
        totalCol += col;
        // Clamped per project, matching Overview and Reports. Summing the raw
        // value would let an overpaid project offset another client's debt.
        totalOut += Math.max(0, out);

        // Overcollected is worth flagging: usually a payment entered twice, or an
        // add-on that was billed but never recorded against the project.
        const warningMarkup = col > t.contractTotal + 0.01
          ? ' <span title="Collected more than the contract total \u2014 duplicated payment, or an unrecorded add-on?" style="color: var(--warn); cursor: help; font-weight: bold;">&#9888;</span>'
          : '';

        const paidCount = t.payments.filter(x => x.received).length;
        const overdueMark = t.overdue > 0
          ? ` <span title="${formatMYR(t.overdue)} overdue" style="color: var(--neg);">&#9679;</span>` : '';

        const statusSelect = `
          <select class="inline-select status-select" data-id="${p.id}">
            ${['Lead', 'Quotation Sent', 'Confirmed', 'In Progress', 'Waiting Client', 'Completed', 'On Hold', 'Cancelled'].map(st => `
              <option value="${st}" ${p.status === st ? 'selected' : ''}>${st}</option>
            `).join('')}
          </select>
        `;

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="text-align: center;">
            <button class="action-btn expand-btn" data-id="${p.id}" title="Payments, add-ons and quotation" style="width: 1.6rem; height: 1.6rem;">
              <svg viewBox="0 0 24 24" style="pointer-events:none;"><polyline points="6 9 12 15 18 9"/></svg>
            </button>
          </td>
          <td style="font-weight: 500; white-space: nowrap;">${esc(p.name)}</td>
          <td class="col-client" style="white-space: nowrap;">${esc(p.client || '-')}</td>
          <td class="col-deadline" style="white-space: nowrap;">${formatDate(p.deadline)}</td>
          <td>${statusSelect}</td>
          <td style="white-space: nowrap; font-weight: 500;">
            ${formatMYR(t.contractTotal)}
            ${t.addonsTotal ? `<div style="font-size:0.68rem;opacity:0.6;font-weight:400;">incl. ${formatMYR(t.addonsTotal)} add-ons</div>` : ''}
          </td>
          <td class="col-payments" style="white-space: nowrap; font-family: var(--font-mono); font-size: 0.78rem;">${paidCount}/${t.payments.length}${overdueMark}</td>
          <td style="color: var(--pos); font-weight: 500; white-space: nowrap;">${formatMYR(col)}${warningMarkup}</td>
          <td style="color: ${out > 0.01 ? 'var(--neg)' : 'var(--bone-dim)'}; font-weight: 500; white-space: nowrap;">${formatMYR(out)}</td>
          <td>
            <div class="actions-cell">
              <button class="action-btn edit-btn" title="Edit" onclick="openProjectModal('${escArg(p.id)}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="action-btn delete-btn" title="Delete" onclick="deleteProject('${escArg(p.id)}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);

        // Detail row, collapsed until the chevron is clicked. Rendered on demand
        // by toggleProjectDetail so a long project list stays cheap.
        const detail = document.createElement('tr');
        detail.className = 'project-detail-row';
        detail.dataset.detailFor = p.id;
        detail.style.display = 'none';
        detail.innerHTML = `<td colspan="10" style="padding: 0; background: rgba(0,0,0,0.18);">
          <div id="detail-${p.id}" style="padding: 1.25rem 1.5rem;"></div></td>`;
        tbody.appendChild(detail);
      });

      // Render totals footer
      tfoot.innerHTML = `
        <tr style="font-weight: bold; background: var(--table-header-bg);">
          <td>Total</td>
          <td></td>
          <td class="col-client"></td>
          <td class="col-deadline"></td>
          <td></td>
          <td>${formatMYR(totalVal + totalAddons)}</td>
          <td class="col-payments"></td>
          <td style="color: var(--pos);">${formatMYR(totalCol)}</td>
          <td style="color: var(--neg);">${formatMYR(totalOut)}</td>
          <td></td>
        </tr>
      `;

      // Attach inline select listeners
      tbody.querySelectorAll('.status-select').forEach(sel => {
        sel.addEventListener('change', (e) => {
          handleInlineProjectUpdate(sel.dataset.id, 'status', e.target.value, sel);
        });
      });
      // The deposit/final "Received?" dropdowns are gone. A project can now have
      // any number of payments, so each is ticked off individually in the detail
      // panel below rather than through two fixed columns.
      tbody.querySelectorAll('.expand-btn').forEach(btn => {
        btn.addEventListener('click', () => toggleProjectDetail(btn.dataset.id, btn));
      });
    }

    // RENDER EXPENSES
    /* ==================================================================
       EXPENSES — one block for the company, one per partner
       ==================================================================
       The split is not cosmetic: everything is paid with company money, and a
       company purchase is shared 50/50 while a personal one comes off the
       buyer's share alone. Those used to sit in one table separated only by a
       badge, which made it easy to mis-set and hard to answer "what have I
       spent on myself this month".

       Each block owns its Add button and pre-fills the type, so the section a
       row lives in is the answer rather than a dropdown to remember. */

    function expenseRowHTML(e) {
      const amt = parseFloat(e.amount) || 0;
      const proj = projectsData.find(p => p.id === e.linked_project_id);
      const projName = proj ? proj.name : 'None';
      // Routed through openReceiptFile rather than a bare href: the stored
      // value is an object path now, which only resolves via a signed URL.
      const invoiceLink = e.invoice_link
        ? `<button type="button" onclick="openReceiptFile('${escArg(e.invoice_link)}')"
                   style="background:none;border:none;padding:0;cursor:pointer;color: var(--accent); text-decoration: underline; font-weight: 500; font-size: 0.85rem;">View</button>`
        : '<span style="color: var(--bone-faint); font-size: 0.85rem;">None</span>';

      // On a phone the card collapses to Item/Amount over Date/Category and the
      // whole row becomes the tap target for editing — see .expense-table in
      // the <=860px block. openExpenseRow() no-ops above that width, where the
      // Edit button is visible and doing nothing surprising is the right call.
      return `
        <tr class="${e.recurring ? 'is-recurring' : ''}"
            onclick="openExpenseRow(event, '${escArg(e.id)}')">
          <td style="white-space: nowrap;"><span class="date-full">${formatDate(e.date)}</span><span class="date-short">${formatDateShort(e.date)}</span></td>
          <td style="font-weight: 500;">
            ${esc(e.item)}
            ${e.notes ? `<div style="font-size:0.75rem;color:var(--bone-dim);margin-top:0.15rem;">${esc(e.notes)}</div>` : ''}
          </td>
          <td style="white-space: nowrap;"><span class="status-badge status-badge--neutral">${esc(e.category)}</span></td>
          <td style="color: var(--warn); font-weight: 500;">${formatMYR(amt)}</td>
          <td style="white-space: nowrap;">${esc(e.paid_by)}</td>
          <td>${e.recurring ? 'Yes' : 'No'}</td>
          <td>${esc(e.recurring_type || 'None')}</td>
          <td>${esc(projName)}</td>
          <td style="text-align: center;">${invoiceLink}</td>
          <td>
            <div class="actions-cell">
              <button class="action-btn edit-btn" title="Edit" onclick="openExpenseModal('${escArg(e.id)}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="action-btn delete-btn" title="Delete" onclick="deleteExpense('${escArg(e.id)}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </td>
        </tr>`;
    }

    /**
     * @param {object} o
     *   title     heading shown on the block
     *   subtitle  one line explaining how this block's money behaves
     *   rows      already-filtered expenses
     *   addLabel  text for the block's Add button
     *   onAdd     inline handler string, pre-filling scope and payer
     *   accent    CSS colour for the subtotal
     *   empty     message when the block has no rows
     */
    function expenseSectionHTML(o) {
      const total = o.rows.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const open = openExpenseSections.has(o.key);
      return `
        <div class="glass-card expense-section ${open ? 'is-open' : ''}" data-key="${esc(o.key)}"
             style="padding: 1.25rem 1.5rem; margin-bottom: 1.5rem;">
          <div class="expense-section-head" style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem;flex-wrap:wrap;margin-bottom:0.9rem;">
            <div style="min-width:0;flex:1 1 auto;">
              <button type="button" class="expense-section-toggle"
                      onclick="toggleExpenseSection('${escArg(o.key)}')"
                      aria-expanded="${open}">
                <span class="chev" aria-hidden="true"></span>
                <h3 style="font-family: var(--font-display); font-size: 1.05rem; margin: 0 0 0.2rem;">${esc(o.title)}</h3>
                <span class="sr-only">${open ? 'Collapse' : 'Expand'} ${esc(o.title)}, ${o.rows.length} item${o.rows.length === 1 ? '' : 's'}</span>
              </button>
              <p class="expense-section-sub" style="font-size: 0.78rem; color: var(--bone-dim); margin: 0; line-height: 1.5;">${o.subtitle}</p>
            </div>
            <div style="display:flex;align-items:center;gap:1rem;">
              <div style="text-align:right;">
                <div style="font-family: var(--font-mono); font-size: 0.68rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--bone-dim);">Subtotal</div>
                <div style="font-size: 1.15rem; font-weight: 600; color: ${o.accent};">${formatMYR(total)}</div>
              </div>
              <button class="btn-primary" style="margin:0;width:auto;padding:0.5rem 1rem;white-space:nowrap;"
                      onclick="${o.onAdd}">+ ${esc(o.addLabel)}</button>
            </div>
          </div>

          <div class="table-container expense-section-body">
            <table class="expense-table">
              <thead>
                <tr>
                  <th>Date</th><th>Item / Description</th><th>Category</th>
                  <th style="color: var(--warn);">Amount</th><th>Paid By</th>
                  <th>Recurring?</th><th>Recurring Type</th><th>Linked Project</th>
                  <th style="text-align: center;">Invoice/Receipt</th><th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${o.rows.length
                  ? o.rows.map(expenseRowHTML).join('')
                  : `<tr><td colspan="10" style="text-align:center;color:var(--bone-dim);padding:1.5rem 0;">${o.empty}</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>`;
    }

    function renderExpenses() {
      const host = document.getElementById('expenseSections');
      if (!host) return;

      const filterCat = document.getElementById('expenseFilterCategory')?.value || '';
      const filterPaid = document.getElementById('expenseFilterPaidBy')?.value || '';
      const filterRec = document.getElementById('expenseFilterRecurring')?.value || '';

      const filtered = expensesData.filter(e => {
        if (filterCat && e.category !== filterCat) return false;
        if (filterPaid && String(e.paid_by).trim().toLowerCase() !== filterPaid.trim().toLowerCase()) return false;
        if (filterRec) {
          const isRec = e.recurring === true;
          if (filterRec === 'Yes' && !isRec) return false;
          if (filterRec === 'No' && isRec) return false;
        }
        return true;
      });

      const isPersonal = e => String(e.scope || 'company').trim().toLowerCase() === 'personal';
      const byPartner = p => e => String(e.paid_by || '').trim().toLowerCase() === p.toLowerCase();

      const blocks = [];

      const sections = [{
        key: 'company',
        title: 'Company Expenses',
        subtitle: 'Bought for the studio with company money. The cost is shared 50/50.',
        rows: filtered.filter(e => !isPersonal(e)),
        addLabel: 'Add company expense',
        onAdd: "openExpenseModal(null, 'company')",
        accent: 'var(--accent)',
        empty: 'No company expenses yet.'
      }];

      PARTNERS.forEach(p => {
        sections.push({
          key: `personal:${p}`,
          title: `${p} — Personal`,
          subtitle: `Bought by ${esc(p)} for themselves with company money. Comes off ${esc(p)}'s share alone.`,
          rows: filtered.filter(e => isPersonal(e) && byPartner(p)(e)),
          addLabel: `Add for ${p}`,
          onAdd: `openExpenseModal(null, 'personal', '${escArg(p)}')`,
          accent: 'var(--warn)',
          empty: `Nothing recorded for ${esc(p)}.`
        });
      });

      initExpenseSectionState(sections.map(s => s.key));
      sections.forEach(s => blocks.push(expenseSectionHTML(s)));

      // Personal rows whose paid_by matches no partner would otherwise vanish
      // from every block — surfaced rather than silently dropped.
      const orphans = filtered.filter(e => isPersonal(e) && !PARTNERS.some(p => byPartner(p)(e)));
      if (orphans.length) {
        // Always open: this block only exists when something is wrong, so
        // collapsing it by default would hide the very thing it is reporting.
        openExpenseSections.add('orphans');
        blocks.push(expenseSectionHTML({
          key: 'orphans',
          title: 'Unassigned personal expenses',
          subtitle: 'Marked personal but the Paid By value matches neither partner, so these are charged to nobody. Edit each one to fix it.',
          rows: orphans,
          addLabel: 'Add company expense',
          onAdd: "openExpenseModal(null, 'company')",
          accent: 'var(--neg)',
          empty: ''
        }));
      }

      host.innerHTML = blocks.join('');

      // renderExpenses() is wired straight to three filter dropdowns and runs
      // again after every save, so the rows it rebuilds are NOT the ones the
      // post-load pass labelled. Without this, changing a filter on a phone
      // left every card showing bare unlabelled values.
      applyResponsiveTableLabels(host);
      markScrollableTables();
      updateExpenseFilterCount();
    }

    /* Which expense blocks are expanded. Kept outside renderExpenses() because
       that function re-runs on every filter change and every save — rebuilding
       the markup must not silently re-collapse what the user just opened. */
    const openExpenseSections = new Set();
    let expenseSectionStateReady = false;

    /**
     * Phones start collapsed — three headers with their subtotals fit one
     * screen, where the expanded lists ran to nine. Desktop starts open,
     * because there the length was never the problem.
     */
    function initExpenseSectionState(keys) {
      if (expenseSectionStateReady) return;
      expenseSectionStateReady = true;
      if (!window.matchMedia('(max-width: 860px)').matches) {
        keys.forEach(k => openExpenseSections.add(k));
      }
    }

    function toggleExpenseFilters() {
      const bar = document.getElementById('expenseFilterBar');
      const btn = document.querySelector('.filter-toggle[aria-controls="expenseFilterBar"]');
      if (!bar) return;
      const open = !bar.classList.contains('is-open');
      bar.classList.toggle('is-open', open);
      if (btn) {
        btn.classList.toggle('is-open', open);
        btn.setAttribute('aria-expanded', String(open));
      }
    }

    /**
     * How many expense filters are actually narrowing the list. Shown beside
     * the collapsed Filters toggle so a hidden filter can never quietly explain
     * a short list.
     */
    function updateExpenseFilterCount() {
      const badge = document.getElementById('expenseFilterCount');
      if (!badge) return;
      const n = ['expenseFilterCategory', 'expenseFilterPaidBy', 'expenseFilterRecurring']
        .filter(id => (document.getElementById(id) || {}).value).length;
      badge.textContent = String(n);
      badge.hidden = n === 0;
    }

    function toggleExpenseSection(key) {
      const card = document.querySelector(`.expense-section[data-key="${CSS.escape(key)}"]`);
      if (!card) return;
      const open = !openExpenseSections.has(key);
      open ? openExpenseSections.add(key) : openExpenseSections.delete(key);
      card.classList.toggle('is-open', open);
      const btn = card.querySelector('.expense-section-toggle');
      if (btn) btn.setAttribute('aria-expanded', String(open));
    }

    /**
     * Tapping anywhere on an expense card opens it for editing — but only where
     * the card layout is actually in use. Above 860px the row is a normal table
     * row with its own Edit button, and a click that swallowed text selection
     * would be a surprise.
     */
    function openExpenseRow(event, id) {
      if (!window.matchMedia('(max-width: 860px)').matches) return;
      // Let the row's own buttons win — otherwise Delete would open the editor.
      if (event.target.closest('button, a')) return;
      openExpenseModal(id);
    }

    // RENDER CASH FLOW
    /* ==================================================================
       CASH FLOW CHARTS
       ==================================================================
       Three questions the table alone could not answer at a glance: where is
       the balance heading, what is still owed to us and when, and which client
       is sitting on the money. All three read the same derived figures as every
       other tab, so they cannot disagree with the numbers beside them. */
    let cashPositionChartInstance = null;
    let expectedIncomeChartInstance = null;
    let outstandingChartInstance = null;

    function monthLabel(key) {
      // 'No date' is a real bucket, not a month — parsing it yields Invalid Date.
      if (key === 'No date') return 'No date';
      const [y, m] = key.split('-');
      return new Date(parseInt(y), parseInt(m) - 1, 1)
        .toLocaleString('en-US', { month: 'short', year: '2-digit' });
    }

    /**
     * Chart colours resolved from the CSS custom properties, so canvas paint
     * follows the theme like everything else.
     *
     * Chart.js draws to a canvas, where `var(--pos)` is just an unparseable
     * string — so the value has to be read out of the computed style here
     * rather than referenced. That is why these charts were hardcoded, and why
     * they stayed dark-theme-only: on the light card the Cash Flow lines
     * measured 1.44:1 and 2.48:1, i.e. invisible.
     */
    function chartPalette() {
      const cs = getComputedStyle(document.documentElement);
      const v = (name, fallback) => (cs.getPropertyValue(name) || '').trim() || fallback;
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const alpha = (hex, a) => {
        const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
        return m ? `rgba(${parseInt(m[1],16)},${parseInt(m[2],16)},${parseInt(m[3],16)},${a})` : hex;
      };
      const pos = v('--pos', '#4ade80'), warn = v('--warn', '#fbbf24'),
            neg = v('--neg', '#f87171'), accent = v('--accent', '#38e0ff');
      return {
        isLight, pos, warn, neg, accent, alpha,
        grid:   isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)',
        tick:   isLight ? 'rgba(0,0,0,0.60)' : 'rgba(255,255,255,0.45)',
        legend: isLight ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.60)'
      };
    }

    function renderCashflowCharts(monthlyData, sortedMonths) {
      const pal = chartPalette();
      const gridColour = pal.grid;
      const tick = { color: pal.tick, font: { size: 10 } };
      const money = v => formatMYR(v);

      // Shared axis/legend styling; the money formatter on the tooltip is the
      // point of these charts, so it is applied everywhere.
      const baseOpts = (extra = {}) => ({
        responsive: true,
        maintainAspectRatio: false,
        interaction: { intersect: false, mode: 'index' },
        plugins: {
          legend: { labels: { color: pal.legend, boxWidth: 12, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.y ?? c.parsed.x)}` } }
        },
        scales: {
          x: { grid: { color: gridColour }, ticks: tick },
          y: { grid: { color: gridColour }, ticks: { ...tick, callback: v => 'RM ' + v.toLocaleString() } }
        },
        ...extra
      });

      // ---- 1. cash position: closing balance against in/out ----
      let running = 0;
      const closing = sortedMonths.map(k => {
        running += monthlyData[k].moneyIn - monthlyData[k].moneyOut;
        return running;
      });

      if (cashPositionChartInstance) cashPositionChartInstance.destroy();
      const cpEl = document.getElementById('cashPositionChart');
      if (cpEl) {
        cashPositionChartInstance = new Chart(cpEl.getContext('2d'), {
          data: {
            labels: sortedMonths.map(monthLabel),
            datasets: [
              { type: 'line', label: 'Closing balance', data: closing,
                borderColor: pal.accent, backgroundColor: pal.alpha(pal.accent, 0.12),
                fill: true, tension: 0.35, borderWidth: 2,
                pointBackgroundColor: pal.accent, pointRadius: 3, order: 0 },
              { type: 'bar', label: 'Collected', data: sortedMonths.map(k => monthlyData[k].moneyIn),
                backgroundColor: pal.alpha(pal.pos, 0.55), borderRadius: 4, order: 1 },
              // moneyOut includes expenses, so the two bars split it back
              // apart: withdrawals and purchases are both real money leaving
              // the account, and both are already inside the balance line.
              { type: 'bar', label: 'Withdrawn', data: sortedMonths.map(k => (monthlyData[k].moneyOut - (monthlyData[k].expenses || 0))),
                backgroundColor: pal.alpha(pal.warn, 0.55), borderRadius: 4, order: 2 },
              { type: 'bar', label: 'Expenses', data: sortedMonths.map(k => monthlyData[k].expenses || 0),
                backgroundColor: pal.alpha(pal.neg, 0.45), borderRadius: 4, order: 3 }
            ]
          },
          options: baseOpts()
        });
      }

      // ---- 2. expected income: unpaid scheduled payments, by due month ----
      // Overdue is split into its own series rather than coloured per-bar, so it
      // gets a legend entry and a separate tooltip line.
      const today = todayLocal();
      const dueBuckets = {};
      paymentsData.forEach(p => {
        if (p.received) return;
        const key = p.due_date ? String(p.due_date).substring(0, 7) : 'No date';
        if (!dueBuckets[key]) dueBuckets[key] = { due: 0, overdue: 0 };
        const amt = parseFloat(p.amount) || 0;
        if (p.due_date && p.due_date < today) dueBuckets[key].overdue += amt;
        else dueBuckets[key].due += amt;
      });
      const dueKeys = Object.keys(dueBuckets).sort();

      if (expectedIncomeChartInstance) expectedIncomeChartInstance.destroy();
      const eiEl = document.getElementById('expectedIncomeChart');
      if (eiEl) {
        expectedIncomeChartInstance = new Chart(eiEl.getContext('2d'), {
          type: 'bar',
          data: {
            labels: dueKeys.length ? dueKeys.map(k => k === 'No date' ? 'No date' : monthLabel(k)) : ['Nothing outstanding'],
            datasets: [
              { label: 'Due', data: dueKeys.length ? dueKeys.map(k => dueBuckets[k].due) : [0],
                backgroundColor: 'rgba(56,224,255,0.6)', borderRadius: 4 },
              { label: 'Overdue', data: dueKeys.length ? dueKeys.map(k => dueBuckets[k].overdue) : [0],
                backgroundColor: 'rgba(248,113,113,0.75)', borderRadius: 4 }
            ]
          },
          options: baseOpts({
            scales: {
              x: { stacked: true, grid: { color: gridColour }, ticks: tick },
              y: { stacked: true, grid: { color: gridColour },
                   ticks: { ...tick, callback: v => 'RM ' + v.toLocaleString() } }
            }
          })
        });
      }

      // ---- 3. outstanding by project ----
      const rows = Object.values(fin.byProject)
        .filter(t => t.contractTotal > 0)
        .sort((a, b) => b.outstanding - a.outstanding)
        .slice(0, 8);

      if (outstandingChartInstance) outstandingChartInstance.destroy();
      const osEl = document.getElementById('outstandingChart');
      if (osEl) {
        outstandingChartInstance = new Chart(osEl.getContext('2d'), {
          type: 'bar',
          data: {
            labels: rows.length ? rows.map(t => t.name) : ['No projects'],
            datasets: [
              { label: 'Collected', data: rows.length ? rows.map(t => t.collected) : [0],
                backgroundColor: 'rgba(74,222,128,0.65)', borderRadius: 4 },
              { label: 'Outstanding', data: rows.length ? rows.map(t => Math.max(0, t.outstanding)) : [0],
                backgroundColor: 'rgba(248,113,113,0.6)', borderRadius: 4 }
            ]
          },
          options: baseOpts({
            indexAxis: 'y',    // horizontal: project names need the room
            plugins: {
              legend: { labels: { color: pal.legend, boxWidth: 12, font: { size: 11 } } },
              tooltip: { callbacks: { label: c => `${c.dataset.label}: ${money(c.parsed.x)}` } }
            },
            scales: {
              x: { stacked: true, grid: { color: gridColour },
                   ticks: { ...tick, callback: v => 'RM ' + v.toLocaleString() } },
              y: { stacked: true, grid: { display: false }, ticks: tick }
            }
          })
        });
      }
    }

    function renderCashflow() {
      const tbody = document.getElementById('cashflowTableBody');
      tbody.innerHTML = '';

      const monthlyData = {};

      const bucket = k => (monthlyData[k] = monthlyData[k] || { moneyIn: 0, moneyOut: 0, expenses: 0 });

      // IN: every received payment, by the month it arrived.
      revenueByMonth().forEach(([monthKey, amt]) => { bucket(monthKey).moneyIn += amt; });

      // OUT: withdrawals AND expenses. Every purchase — company or personal —
      // is made with company money, so both leave this account. (An earlier
      // model kept expenses out of money-out on the assumption partners paid
      // personally and were owed back; that assumption was wrong for this
      // studio and made the closing balance overstate cash by every ringgit
      // ever spent.) `expenses` is kept as its own bucket so the table can
      // still show the split.
      // Undated rows go in their own bucket rather than being skipped. Both
      // `expenses.date` and `partner_withdrawals.date` are nullable, and
      // dropping them made this tab's closing balance disagree with Overview's
      // cash figure by exactly the missing amount — silently, with the Partners
      // panel still reporting "Balanced". A visible "No date" row is worth more
      // than a tidy table that quietly loses money.
      const monthOf = d => {
        const k = String(d || '').substring(0, 7);
        return k.length === 7 ? k : 'No date';
      };

      withdrawalsData.forEach(w => {
        bucket(monthOf(w.date)).moneyOut += parseFloat(w.amount) || 0;
      });

      expensesData.forEach(e => {
        const amt = parseFloat(e.amount) || 0;
        const k = monthOf(e.date);
        bucket(k).moneyOut += amt;
        bucket(k).expenses += amt;
      });

      const sortedMonths = Object.keys(monthlyData).sort();

      // Before the early return below, so the charts are still cleared/emptied
      // when there is nothing to show rather than keeping stale bars on screen.
      renderCashflowCharts(monthlyData, sortedMonths);

      if (sortedMonths.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--bone-dim);">No transactions to show cash flow.</td></tr>`;
        return;
      }

      let runningBalance = 0;

      sortedMonths.forEach(mKey => {
        const row = monthlyData[mKey];
        const undated = mKey === 'No date';
        const monthName = undated
          ? 'No date set'
          : (([year, month]) => new Date(parseInt(year), parseInt(month) - 1, 1)
              .toLocaleString('en-US', { month: 'short', year: 'numeric' }))(mKey.split('-'));

        const openingBalance = runningBalance;
        const net = row.moneyIn - row.moneyOut;
        runningBalance += net;
        const closingBalance = runningBalance;

        const netColor = net >= 0 ? 'var(--pos)' : 'var(--neg)';
        const netPrefix = net >= 0 ? '+' : '';

        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 500;${undated ? 'color: var(--warn);' : ''}">
            ${monthName}
            ${undated ? `<div style="font-size:0.72rem;font-weight:400;color:var(--bone-dim);">Rows with no date &mdash; still counted, but not attributable to a month</div>` : ''}
          </td>
          <td>${formatMYR(openingBalance)}</td>
          <td style="color: var(--pos);">${formatMYR(row.moneyIn)}</td>
          <td style="color: var(--warn);">${formatMYR(row.moneyOut - row.expenses)}</td>
          <td style="color: var(--neg);">${formatMYR(row.expenses)}</td>
          <td style="color: ${netColor}; font-weight: 500;">${netPrefix}${formatMYR(net)}</td>
          <td style="font-weight: 500; color: ${closingBalance >= 0 ? 'var(--bone)' : 'var(--neg)'}">${formatMYR(closingBalance)}</td>
        `;
        tbody.appendChild(tr);
      });
    }

    // RENDER PARTNERS & SETTLEMENT

    /* ==================================================================
       PROJECT DETAIL PANEL — payments, add-ons and the quotation
       ==================================================================
       Rendered on demand into the collapsed row that renderProjects() puts
       after each project, so a long list stays cheap. This is where the money
       for a project is actually managed: the schedule can hold any number of
       installments, which is what replaced the old two fixed columns. */

    const openProjectDetails = new Set();

    function toggleProjectDetail(projectId, btn) {
      const row = document.querySelector(`tr.project-detail-row[data-detail-for="${projectId}"]`);
      if (!row) return;
      const isOpen = row.style.display !== 'none';
      if (isOpen) {
        row.style.display = 'none';
        openProjectDetails.delete(projectId);
      } else {
        renderProjectDetail(projectId);
        row.style.display = '';
        openProjectDetails.add(projectId);
      }
      if (btn) btn.style.transform = isOpen ? '' : 'rotate(180deg)';
    }

    function renderProjectDetail(projectId) {
      const host = document.getElementById(`detail-${projectId}`);
      if (!host) return;
      const t = projectFin(projectId);
      const today = todayLocal();

      // Does the schedule actually add up to what the client owes? Warning here
      // rather than blocking the project form, because this is the only place
      // the whole schedule is visible at once.
      const scheduleGap = t.contractTotal - t.scheduled;
      let gapNote = '';
      if (Math.abs(scheduleGap) > 0.01) {
        gapNote = scheduleGap > 0
          ? `<span style="color:var(--warn);">${formatMYR(scheduleGap)} of the contract is not scheduled yet</span>`
          : `<span style="color:var(--neg);">scheduled ${formatMYR(-scheduleGap)} more than the contract total</span>`;
      } else {
        gapNote = `<span style="color:var(--pos);">schedule matches the contract total</span>`;
      }

      const paymentRows = t.payments.length ? t.payments.map(pay => {
        const overdue = !pay.received && pay.due_date && pay.due_date < today;
        return `
          <tr>
            <td>
              <input class="inline-input pay-label" data-id="${pay.id}" value="${esc(pay.label)}"
                     style="background:transparent;border:1px solid transparent;color:inherit;font:inherit;padding:0.2rem 0.3rem;border-radius:4px;width:9rem;" />
              ${pay.notes ? `<div style="font-size:0.75rem;color:var(--bone-dim);margin-top:0.15rem;">${esc(pay.notes)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;font-weight:500;">
              ${formatMYR(pay.amount)}
              ${pay.method ? `<div style="font-size:0.72rem;color:var(--bone-dim);font-weight:400;">${esc(pay.method)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;color:${overdue ? 'var(--neg)' : 'inherit'};">
              ${pay.due_date ? formatDate(pay.due_date) : '<span style="opacity:0.4;">&mdash;</span>'}
              ${overdue ? ' <strong>overdue</strong>' : ''}
            </td>
            <td>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;cursor:pointer;">
                <input type="checkbox" class="pay-received" data-id="${pay.id}" ${pay.received ? 'checked' : ''} />
                <span style="color:${pay.received ? 'var(--pos)' : 'var(--bone-dim)'};font-size:0.8rem;">
                  ${pay.received ? 'Received' : 'Not yet'}
                </span>
              </label>
              ${pay.received ? `
              <!-- Editable, because ticking the box stamps today and the money
                   often landed earlier. It was previously correctable only by
                   raw SQL, and it drives which month the revenue is booked to. -->
              <input type="date" class="inline-input pay-received-date" data-id="${pay.id}"
                     value="${pay.received_date || ''}" max="${todayLocal()}"
                     title="Date the money actually arrived"
                     style="background:transparent;border:1px solid var(--glass-border);color:inherit;font:inherit;font-size:0.75rem;padding:0.15rem 0.3rem;border-radius:4px;margin-top:0.25rem;" />`
              : ''}
            </td>
            <td style="text-align:right;">
              <button class="action-btn delete-btn" title="Delete payment" onclick="deletePayment('${escArg(pay.id)}')">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </td>
          </tr>`;
      }).join('') : `<tr><td colspan="5" style="color:var(--bone-dim);padding:0.75rem 0;">
            No payments scheduled. Add the deposit and any installments below.</td></tr>`;

      const addonRows = t.addons.length ? t.addons.map(a => `
          <tr>
            <td>
              ${esc(a.description)}
              ${a.notes ? `<div style="font-size:0.75rem;color:var(--bone-dim);margin-top:0.15rem;">${esc(a.notes)}</div>` : ''}
            </td>
            <td style="white-space:nowrap;font-weight:500;">${formatMYR(a.amount)}</td>
            <td style="white-space:nowrap;">${a.date ? formatDate(a.date) : '<span style="opacity:0.4;">&mdash;</span>'}</td>
            <td>
              <label style="display:inline-flex;align-items:center;gap:0.4rem;cursor:pointer;"
                     title="Until this is ticked the add-on is agreed but not yet invoiced, so it does not count toward what the client owes.">
                <input type="checkbox" class="addon-billed" data-id="${a.id}" ${a.billed ? 'checked' : ''} />
                <span style="color:${a.billed ? 'var(--pos)' : 'var(--warn)'};font-size:0.78rem;">
                  ${a.billed ? 'Billed' : 'Not billed'}
                </span>
              </label>
            </td>
            <td style="text-align:right;">
              <button class="action-btn delete-btn" title="Delete add-on" onclick="deleteAddon('${escArg(a.id)}')">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              </button>
            </td>
          </tr>`).join('') : `<tr><td colspan="5" style="color:var(--bone-dim);padding:0.75rem 0;">
            No add-ons. Add one when the client agrees extra scope after the quote.</td></tr>`;

      const quotes = t.quotations.length ? t.quotations.map(q => `
          <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;font-size:0.82rem;">
            <span style="font-family:var(--font-mono);">${esc(q.quote_number || 'no ref')}</span>
            <span>${formatMYR(q.total)}</span>
            <span style="opacity:0.7;">${q.quote_date ? formatDate(q.quote_date) : ''}</span>
            <span class="status-badge" style="font-size:0.7rem;">${esc(q.status)}</span>
            ${q.file_url ? `<button class="btn-outline" style="padding:0.15rem 0.6rem;font-size:0.72rem;margin:0;width:auto;" onclick="openQuotationFile('${escArg(q.file_url)}')">Open file</button>` : ''}
          </div>`).join('') : `<span style="color:var(--bone-dim);font-size:0.82rem;">
            No quotation linked. Add one from the Quotations tab.</span>`;

      host.innerHTML = `
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:1rem;margin-bottom:1.25rem;">
          ${[['Project value', formatMYR(t.value), 'inherit'],
             ['Add-ons', formatMYR(t.addonsTotal), 'inherit'],
             ['Contract total', formatMYR(t.contractTotal), 'var(--accent)'],
             ['Collected', formatMYR(t.collected), 'var(--pos)'],
             ['Outstanding', formatMYR(t.outstanding), t.outstanding > 0.01 ? 'var(--neg)' : 'var(--bone-dim)'],
             ['Overdue', formatMYR(t.overdue), t.overdue > 0.01 ? 'var(--neg)' : 'var(--bone-dim)']]
            .map(([lbl, val, col]) => `
              <div>
                <div style="font-size:0.68rem;text-transform:uppercase;letter-spacing:0.12em;color:var(--bone-dim);">${lbl}</div>
                <div style="font-weight:600;color:${col};font-family:var(--font-mono);">${val}</div>
              </div>`).join('')}
        </div>

        <div style="font-size:0.78rem;margin-bottom:1rem;">${gapNote}</div>

        <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.14em;color:var(--bone-dim);margin:0 0 0.5rem;">Payment schedule</h4>
        <table style="width:100%;font-size:0.85rem;margin-bottom:0.75rem;"><tbody>${paymentRows}</tbody></table>
        <form class="add-payment-form" data-project="${projectId}"
              style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-bottom:1.75rem;">
          <input name="label" class="form-control" placeholder="Label (e.g. Installment 2)" style="width:12rem;" required />
          <input name="amount" class="form-control" type="number" step="0.01" min="0.01" placeholder="Amount" style="width:8rem;" required />
          <input name="due" class="form-control" type="date" style="width:10rem;" />
          <select name="method" class="form-control" style="width:9rem;" title="How the client is paying">
            <option value="">Method…</option>
            <option>Bank transfer</option>
            <option>Cash</option>
            <option>Cheque</option>
            <option>Card</option>
            <option>Other</option>
          </select>
          <input name="notes" class="form-control" placeholder="Notes (optional)" style="width:12rem;" />
          <button type="submit" class="btn-primary" style="margin:0;width:auto;padding:0.5rem 1rem;">Add payment</button>
        </form>

        <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.14em;color:var(--bone-dim);margin:0 0 0.5rem;">Add-ons</h4>
        <table style="width:100%;font-size:0.85rem;margin-bottom:0.5rem;"><tbody>${addonRows}</tbody></table>
        ${t.addonsUnbilled > 0.01 ? `
        <p style="font-size:0.78rem;color:var(--warn);margin:0 0 0.75rem;">
          ${formatMYR(t.addonsUnbilled)} of add-ons agreed but not yet billed &mdash;
          not counted in the contract total or in what the client owes.
        </p>` : ''}
        <form class="add-addon-form" data-project="${projectId}"
              style="display:flex;gap:0.5rem;flex-wrap:wrap;align-items:flex-end;margin-bottom:1.75rem;">
          <input name="description" class="form-control" placeholder="What was added" style="width:16rem;" required />
          <input name="amount" class="form-control" type="number" step="0.01" min="0" placeholder="Amount" style="width:8rem;" required />
          <input name="date" class="form-control" type="date" style="width:10rem;" />
          <input name="notes" class="form-control" placeholder="Notes (optional)" style="width:12rem;" />
          <label style="display:inline-flex;align-items:center;gap:0.4rem;font-size:0.8rem;cursor:pointer;">
            <input type="checkbox" name="billed" /> Already billed
          </label>
          <button type="submit" class="btn-primary" style="margin:0;width:auto;padding:0.5rem 1rem;">Add add-on</button>
        </form>

        <h4 style="font-size:0.8rem;text-transform:uppercase;letter-spacing:0.14em;color:var(--bone-dim);margin:0 0 0.5rem;">Quotation</h4>
        <div style="display:flex;flex-direction:column;gap:0.4rem;">${quotes}</div>
      `;

      // ---- wire it up ----
      host.querySelectorAll('.pay-received').forEach(cb => {
        cb.addEventListener('change', () => setPaymentReceived(cb.dataset.id, cb.checked, cb));
      });
      host.querySelectorAll('.pay-label').forEach(inp => {
        inp.addEventListener('change', () => updatePaymentLabel(inp.dataset.id, inp.value, inp));
      });
      host.querySelectorAll('.pay-received-date').forEach(inp => {
        inp.addEventListener('change', () => updateReceivedDate(inp.dataset.id, inp.value, inp));
      });
      host.querySelectorAll('.addon-billed').forEach(cb => {
        cb.addEventListener('change', () => setAddonBilled(cb.dataset.id, cb.checked, cb));
      });
      host.querySelector('.add-payment-form')?.addEventListener('submit', e => {
        e.preventDefault();
        addPayment(projectId, e.target);
      });
      host.querySelector('.add-addon-form')?.addEventListener('submit', e => {
        e.preventDefault();
        addAddon(projectId, e.target);
      });
    }

    /** Re-render only the panels the user has open, after data changes. */
    function refreshOpenDetails() {
      openProjectDetails.forEach(id => {
        const row = document.querySelector(`tr.project-detail-row[data-detail-for="${id}"]`);
        if (row) {
          renderProjectDetail(id);
          row.style.display = '';
          const btn = document.querySelector(`.expand-btn[data-id="${id}"]`);
          if (btn) btn.style.transform = 'rotate(180deg)';
        }
      });
    }

    async function addPayment(projectId, form) {
      const label = form.label.value.trim() || 'Installment';
      const amount = parseFloat(form.amount.value);
      const due = form.due.value || null;
      const method = (form.method && form.method.value) || null;
      const notes = (form.notes && form.notes.value.trim()) || null;
      if (!(amount > 0)) { showToast('Amount must be greater than zero', 'error'); return; }

      // max+1, not length: deleting a middle row and adding another would
      // otherwise reuse an existing sort_order and leave the ordering to the
      // due_date tiebreak.
      const rows = projectFin(projectId).payments;
      const nextOrder = rows.reduce((m, p) => Math.max(m, (p.sort_order ?? 0) + 1), 0);
      try {
        const { error } = await supabaseClient.from('project_payments').insert([{
          project_id: projectId, label, amount, due_date: due,
          method, notes, sort_order: nextOrder
        }]);
        if (error) throw error;
        showToast('Payment added', 'success');
        form.reset();
        await loadAllData();
        refreshOpenDetails();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    async function setPaymentReceived(paymentId, received, cb) {
      if (cb) cb.disabled = true;
      // received_date is NOT NULL when received (DB constraint), because revenue
      // is reported by month and a dateless payment would vanish from the charts.
      const patch = received
        ? { received: true, received_date: todayLocal() }
        : { received: false, received_date: null };
      try {
        const { error } = await supabaseClient.from('project_payments').update(patch).eq('id', paymentId);
        if (error) throw error;
        showToast(received ? 'Payment marked received' : 'Payment marked unpaid', 'success');
        await loadAllData();
        refreshOpenDetails();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
        if (cb) { cb.disabled = false; cb.checked = !received; }
      }
    }

    /**
     * Mark an add-on as invoiced (or not).
     *
     * Only billed add-ons count toward the contract total and therefore toward
     * what the client owes, so this directly moves the Outstanding figure.
     */
    async function setAddonBilled(addonId, billed, cb) {
      if (cb) cb.disabled = true;
      try {
        const { error } = await supabaseClient.from('project_addons')
          .update({ billed }).eq('id', addonId);
        if (error) throw error;
        showToast(billed ? 'Add-on marked billed' : 'Add-on marked not billed', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
        if (cb) { cb.disabled = false; cb.checked = !billed; }
      }
    }

    /**
     * Correct the date a payment actually arrived.
     *
     * Ticking "received" stamps today, but money often landed days earlier —
     * and received_date decides which month the revenue is reported in, across
     * Overview, Cash Flow and Reports. Until now the only way to fix it was raw
     * SQL.
     */
    async function updateReceivedDate(paymentId, value, inp) {
      const prev = inp ? inp.defaultValue : '';
      // The DB constraint is `received = false OR received_date IS NOT NULL`,
      // so clearing the box on a received payment would violate it.
      if (!value) {
        showToast('A received payment needs a date — untick "received" instead', 'warning');
        if (inp) inp.value = prev;
        return;
      }
      if (value > todayLocal()) {
        showToast('That date is in the future', 'warning');
        if (inp) inp.value = prev;
        return;
      }
      if (inp) inp.disabled = true;
      try {
        const { error } = await supabaseClient.from('project_payments')
          .update({ received_date: value }).eq('id', paymentId);
        if (error) throw error;
        showToast('Received date updated', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
        if (inp) inp.value = prev;
      } finally {
        if (inp) inp.disabled = false;
      }
    }

    async function updatePaymentLabel(paymentId, label, inp) {
      const clean = (label || '').trim() || 'Installment';
      try {
        const { error } = await supabaseClient.from('project_payments')
          .update({ label: clean }).eq('id', paymentId);
        if (error) throw error;
        if (inp) inp.value = clean;
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    async function deletePayment(paymentId) {
      if (!confirm('Delete this payment from the schedule?')) return;
      try {
        const { error } = await supabaseClient.from('project_payments').delete().eq('id', paymentId);
        if (error) throw error;
        showToast('Payment deleted', 'success');
        await loadAllData();
        refreshOpenDetails();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    async function addAddon(projectId, form) {
      const description = form.description.value.trim();
      const amount = parseFloat(form.amount.value);
      const date = form.date.value || null;
      // Defaults to false: recording an add-on means it was agreed, not that it
      // has been invoiced. Only billed add-ons count toward what the client owes.
      const billed = !!(form.billed && form.billed.checked);
      const notes = (form.notes && form.notes.value.trim()) || null;
      if (!description) { showToast('Describe what was added', 'error'); return; }
      if (!(amount >= 0)) { showToast('Amount must be a number', 'error'); return; }
      try {
        const { error } = await supabaseClient.from('project_addons').insert([{
          project_id: projectId, description, amount, date, billed, notes
        }]);
        if (error) throw error;
        showToast('Add-on recorded', 'success');
        form.reset();
        await loadAllData();
        refreshOpenDetails();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    async function deleteAddon(addonId) {
      if (!confirm('Delete this add-on?')) return;
      try {
        const { error } = await supabaseClient.from('project_addons').delete().eq('id', addonId);
        if (error) throw error;
        showToast('Add-on deleted', 'success');
        await loadAllData();
        refreshOpenDetails();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    /**
     * Quotations live in a PRIVATE bucket, so they need a short-lived signed URL
     * rather than a public link — a quotation exposes what you charge a specific
     * client.
     */
    /**
     * Open a receipt. New rows store the object path in the private-capable
     * `receipts` bucket and get a short-lived signed URL; rows written before
     * that change stored a full public URL, so those are opened directly.
     *
     * The legacy branch is what makes the bucket safe to flip private without a
     * data migration — old links keep working as long as the bucket is still
     * public, and once it is closed only the path-based rows resolve, which is
     * the intended end state.
     */
    async function openReceiptFile(ref) {
      if (!ref) return;
      if (/^https?:\/\//i.test(ref)) {
        window.open(ref, '_blank', 'noopener');
        return;
      }
      try {
        const { data, error } = await supabaseClient.storage
          .from('receipts').createSignedUrl(ref, 60);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener');
      } catch (err) {
        showToast('Could not open receipt: ' + err.message, 'error');
      }
    }

    async function openQuotationFile(path) {
      try {
        const { data, error } = await supabaseClient.storage
          .from('quotations').createSignedUrl(path, 60);
        if (error) throw error;
        window.open(data.signedUrl, '_blank', 'noopener');
      } catch (err) {
        showToast('Could not open file: ' + err.message, 'error');
      }
    }

    /* ==================================================================
       PAYMENTS TAB — "who owes me money right now"
       ==================================================================
       One list across every project, sorted so the most overdue is first. This
       is the view the old two-column model could not produce at all. */
    function renderPayments() {
      const tbody = document.getElementById('paymentsTableBody');
      if (!tbody) return;
      const today = todayLocal();
      const thisMonth = today.substring(0, 7);

      const rows = paymentsData.map(pay => {
        const proj = projectsData.find(p => p.id === pay.project_id);
        return { pay, proj, overdue: !pay.received && pay.due_date && pay.due_date < today };
      });

      let due = 0, overdue = 0, receivedThisMonth = 0;
      rows.forEach(({ pay, overdue: od }) => {
        const amt = parseFloat(pay.amount) || 0;
        if (!pay.received) { due += amt; if (od) overdue += amt; }
        else if (String(pay.received_date || '').startsWith(thisMonth)) receivedThisMonth += amt;
      });

      const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      set('kpiPaymentsDue', formatMYR(due));
      set('kpiPaymentsOverdue', formatMYR(overdue));
      set('kpiPaymentsThisMonth', formatMYR(receivedThisMonth));

      // Unpaid first, most overdue at the top; then received, most recent first.
      rows.sort((a, b) => {
        if (a.pay.received !== b.pay.received) return a.pay.received ? 1 : -1;
        if (!a.pay.received) return String(a.pay.due_date || '9999').localeCompare(String(b.pay.due_date || '9999'));
        return String(b.pay.received_date || '').localeCompare(String(a.pay.received_date || ''));
      });

      tbody.innerHTML = rows.length ? '' :
        `<tr><td colspan="6" style="text-align:center;color:var(--bone-dim);padding:2rem;">
          No payments scheduled yet. Open a project's chevron on the Projects tab to add its schedule.</td></tr>`;

      rows.forEach(({ pay, proj, overdue: od }) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight:500;white-space:nowrap;">${proj ? esc(proj.name) : '<span style="opacity:0.5;">(deleted project)</span>'}</td>
          <td style="white-space:nowrap;">${proj ? esc(proj.client || '-') : '-'}</td>
          <td>${esc(pay.label || 'Installment')}</td>
          <td style="white-space:nowrap;font-weight:500;">${formatMYR(pay.amount)}</td>
          <td style="white-space:nowrap;color:${od ? 'var(--neg)' : 'inherit'};">
            ${pay.due_date ? formatDate(pay.due_date) : '<span style="opacity:0.4;">&mdash;</span>'}
            ${od ? ' <strong>overdue</strong>' : ''}
          </td>
          <td style="white-space:nowrap;">
            ${pay.received
              ? `<span style="color:var(--pos);">Received ${formatDate(pay.received_date)}</span>`
              : `<button class="btn-outline" style="padding:0.2rem 0.7rem;font-size:0.74rem;margin:0;width:auto;"
                    onclick="setPaymentReceived('${escArg(pay.id)}', true)">Mark received</button>`}
          </td>
        `;
        tbody.appendChild(tr);
      });
    }

    /* ==================================================================
       QUOTATIONS TAB
       ==================================================================
       Header totals plus the document that was actually sent. Accepting a quote
       can push its total onto the project's value, so the number the client
       agreed to and the number being tracked cannot drift apart. */
    function renderQuotations() {
      const tbody = document.getElementById('quotationsTableBody');
      if (!tbody) return;

      tbody.innerHTML = quotationsData.length ? '' :
        `<tr><td colspan="8" style="text-align:center;color:var(--bone-dim);padding:2rem;">
          No quotations yet.</td></tr>`;

      const statusColour = { Draft: 'var(--bone-dim)', Sent: 'var(--warn)', Accepted: 'var(--pos)', Declined: 'var(--neg)' };

      const today = todayLocal();
      quotationsData.forEach(q => {
        const proj = projectsData.find(p => p.id === q.project_id);
        // Only meaningful while the quote is still live — an accepted or
        // declined quote passing its validity date is not a problem.
        const expired = q.valid_until && q.valid_until < today
                        && (q.status === 'Draft' || q.status === 'Sent');
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-family:var(--font-mono);white-space:nowrap;">${esc(q.quote_number || '-')}</td>
          <td style="white-space:nowrap;">${esc(q.client || (proj ? proj.client : '') || '-')}</td>
          <td style="white-space:nowrap;">${proj ? esc(proj.name) : '<span style="opacity:0.5;">unlinked</span>'}</td>
          <td style="white-space:nowrap;">${q.quote_date ? formatDate(q.quote_date) : '-'}</td>
          <td style="white-space:nowrap;color:${expired ? 'var(--neg)' : 'inherit'};"
              title="${expired ? 'This quote has expired' : ''}">
            ${q.valid_until ? formatDate(q.valid_until) : '<span style="opacity:0.4;">&mdash;</span>'}
            ${expired ? ' <strong>expired</strong>' : ''}
          </td>
          <td style="white-space:nowrap;font-weight:500;">${formatMYR(q.total)}</td>
          <td>
            <select class="inline-select quote-status" data-id="${q.id}" style="color:${statusColour[q.status] || 'inherit'};">
              ${['Draft', 'Sent', 'Accepted', 'Declined'].map(s =>
                `<option value="${s}" ${q.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td>
            <div class="actions-cell">
              ${q.file_url ? `<button class="action-btn" title="Open file" onclick="openQuotationFile('${escArg(q.file_url)}')">
                <svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg></button>` : ''}
              ${(q.status === 'Accepted' && proj) ? `<button class="btn-outline" style="padding:0.2rem 0.6rem;font-size:0.72rem;margin:0;width:auto;"
                    onclick="applyQuoteToProject('${escArg(q.id)}')">Set project value</button>` : ''}
              <button class="action-btn edit-btn" title="Edit" onclick="openQuotationModal('${escArg(q.id)}')">
                <svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4z"/></svg></button>
              <button class="action-btn delete-btn" title="Delete" onclick="deleteQuotation('${escArg(q.id)}')">
                <svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg></button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });

      tbody.querySelectorAll('.quote-status').forEach(sel => {
        sel.addEventListener('change', () => updateQuotationStatus(sel.dataset.id, sel.value, sel));
      });

      // Project picker on the quotation form
      const sel = document.getElementById('quoteProject');
      if (sel) {
        const cur = sel.value;
        sel.innerHTML = '<option value="">Not linked to a project</option>' +
          projectsData.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
        sel.value = cur;
      }
    }

    /**
     * Open the quotation form, blank for a new one or populated for an edit.
     *
     * Quotations used to be insert-only with no edit button, so a wrong quote
     * number could only be fixed by deleting and re-entering — which also
     * orphaned the uploaded document in the bucket.
     */
    /* Subtotal and SST were removed from this form: the studio charges no tax,
       so the amount quoted IS the amount collected. The columns still exist and
       migration 04 constrains subtotal + sst_amount = total, so saveQuotation
       writes subtotal = total and sst_amount = 0. */

    function openQuotationForm(id = null) {
      const form = document.getElementById('quotationForm');
      if (!form) return;
      form.reset();
      const set = (elId, v) => { const el = document.getElementById(elId); if (el) el.value = v; };
      set('quoteId', '');

      const title = document.getElementById('quotationFormTitle');

      if (id) {
        const q = quotationsData.find(x => x.id === id);
        if (!q) { showToast('Quotation not found', 'error'); return; }
        set('quoteId', q.id);
        set('quoteNumber', q.quote_number || '');
        set('quoteClient', q.client || '');
        set('quoteProject', q.project_id || '');
        set('quoteDate', q.quote_date || '');
        set('quoteValidUntil', q.valid_until || '');
        set('quoteTotal', q.total ?? 0);
        set('quoteStatus', q.status || 'Draft');
        set('quoteNotes', q.notes || '');
        if (title) {
          title.textContent = `Editing ${q.quote_number || 'quotation'}`;
        }
      } else if (title) {
        title.textContent = 'New quotation';
      }

      openModal('quotationModal');
    }

    // Kept as an alias: the table's edit button reads better as "open the modal"
    // even though this form is inline on the tab.
    const openQuotationModal = openQuotationForm;

    function prefersReducedMotion() {
      return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }

    async function saveQuotation(e) {
      e.preventDefault();
      const f = e.target;
      const id = document.getElementById('quoteId').value;
      const file = document.getElementById('quoteFile').files[0];
      const total = parseFloat(document.getElementById('quoteTotal').value) || 0;

      const row = {
        project_id: document.getElementById('quoteProject').value || null,
        client: document.getElementById('quoteClient').value.trim() || null,
        quote_number: document.getElementById('quoteNumber').value.trim() || null,
        quote_date: document.getElementById('quoteDate').value || null,
        valid_until: document.getElementById('quoteValidUntil').value || null,
        // No tax is charged, so the whole amount is the subtotal. Written
        // rather than left at 0 because migration 04 constrains
        // subtotal + sst_amount = total.
        subtotal: total,
        sst_amount: 0,
        total,
        status: document.getElementById('quoteStatus').value,
        notes: document.getElementById('quoteNotes').value.trim() || null
      };

      const btn = f.querySelector('button[type="submit"]');
      if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }

      try {
        if (file) {
          // Namespaced by timestamp so re-uploading the same filename doesn't
          // silently overwrite a previous client's quote.
          const path = `${Date.now()}_${file.name.replace(/[^\w.\-]/g, '_')}`;
          const { error: upErr } = await supabaseClient.storage.from('quotations').upload(path, file);
          if (upErr) throw upErr;
          row.file_url = path;
        }

        let error;
        if (id) {
          // No file chosen on an edit means keep the existing one — `file_url`
          // is simply absent from `row`, so the column is left untouched.
          ({ error } = await supabaseClient.from('quotations').update(row).eq('id', id));
        } else {
          ({ error } = await supabaseClient.from('quotations').insert([row]));
        }
        if (error) throw error;

        showToast(id ? 'Quotation updated' : 'Quotation saved', 'success');
        // Close rather than re-open: openQuotationForm() would reset the fields
        // AND immediately show the modal again, which reads as a failed save.
        f.reset();
        document.getElementById('quoteId').value = '';
        closeModal('quotationModal');
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Save quotation'; }
      }
    }

    async function updateQuotationStatus(id, status, sel) {
      if (sel) sel.disabled = true;
      try {
        const { error } = await supabaseClient.from('quotations').update({ status }).eq('id', id);
        if (error) throw error;
        showToast(`Quotation marked ${status}`, 'success');
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
        if (sel) sel.disabled = false;
      }
    }

    /** Accepted quote -> the project's value, so the two cannot disagree. */
    async function applyQuoteToProject(id) {
      const q = quotationsData.find(x => x.id === id);
      if (!q || !q.project_id) return;
      const proj = projectsData.find(p => p.id === q.project_id);
      if (!proj) return;
      // No esc(): confirm() renders plain text, so escaping showed the user
      // "Smith &amp;amp; Sons" instead of the project they actually picked.
      if (!confirm(`Set "${proj.name}" project value to ${formatMYR(q.total)} from quotation ${q.quote_number}?`)) return;
      try {
        const { error } = await supabaseClient.from('projects').update({ value: q.total }).eq('id', q.project_id);
        if (error) throw error;
        showToast('Project value updated from quotation', 'success');
        await loadAllData();
        refreshOpenDetails();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    async function deleteQuotation(id) {
      if (!confirm('Delete this quotation?')) return;
      const q = quotationsData.find(x => x.id === id);
      try {
        const { error } = await supabaseClient.from('quotations').delete().eq('id', id);
        if (error) throw error;
        // Best effort: an orphaned object in the bucket is untidy but harmless,
        // so a storage failure must not block the row being removed.
        if (q && q.file_url) {
          await supabaseClient.storage.from('quotations').remove([q.file_url]).catch(() => {});
        }
        showToast('Quotation deleted', 'success');
        await loadAllData();
      } catch (err) {
        showToast('Failed: ' + err.message, 'error');
      }
    }

    function renderPartners() {
      const tbody = document.getElementById('partnersTableBody');
      tbody.innerHTML = '';

      // Every figure comes from computeFinancials(). Company purchases are
      // shared by the split, personal ones come off the buyer's share, and
      // nothing is ever reimbursed — see the comment on that function.
      const { collected, expenses, companyExpenses, netProfit, share, withdrawn, balance,
              personalSpend, withdrawnTotal, cashInAccount,
              sstReserved, distributable, reconciled, unattributed } = fin;

      const pct = p => (systemSettings.partner_split?.[p] ?? 50);

      document.getElementById('partnerNetProfit').textContent = formatMYR(netProfit);

      // ---- headline cards ----
      const cards = {
        Kunacosta: { label: 'kunaProfitShareLabel', bal: 'kunaRemainingBalance',
                     share: 'kunaTotalShare', drawn: 'kunaTotalWithdrawn' },
        Rooben:    { label: 'roobenProfitShareLabel', bal: 'roobenRemainingBalance',
                     share: 'roobenTotalShare', drawn: 'roobenTotalWithdrawn' }
      };
      PARTNERS.forEach(p => {
        const ids = cards[p];
        if (!ids) return;
        const set = (id, txt) => { const el = document.getElementById(id); if (el) el.textContent = txt; };
        set(ids.label, `${p} Balance (${pct(p)}%)`);
        set(ids.bal, formatMYR(balance[p]));
        set(ids.share, formatMYR(share[p]));
        set(ids.drawn, formatMYR(withdrawn[p]));
        const balEl = document.getElementById(ids.bal);
        // Negative means they have drawn more than they are owed.
        if (balEl) balEl.style.color = balance[p] < 0 ? 'var(--neg)' : 'var(--accent)';
      });

      // ---- per-partner table ----
      PARTNERS.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 500;">${p}</td>
          <td>${pct(p)}%</td>
          <td>${formatMYR(share[p])}</td>
          <td style="color: ${personalSpend[p] > 0.01 ? 'var(--warn)' : 'var(--bone-dim)'};"
              title="Bought for themselves on the company card. Comes off their share alone.">
            ${personalSpend[p] > 0.01 ? '&minus;' : ''}${formatMYR(personalSpend[p])}
          </td>
          <td style="color: ${withdrawn[p] > 0.01 ? 'var(--warn)' : 'var(--bone-dim)'};">
            ${withdrawn[p] > 0.01 ? '&minus;' : ''}${formatMYR(withdrawn[p])}
          </td>
          <td style="font-weight: bold; color: ${balance[p] < 0 ? 'var(--neg)' : 'var(--accent)'};">${formatMYR(balance[p])}</td>
        `;
        tbody.appendChild(tr);
      });

      const trTotal = document.createElement('tr');
      trTotal.style.fontWeight = 'bold';
      trTotal.style.background = 'var(--table-header-bg)';
      const sumOop = PARTNERS.reduce((s, p) => s + personalSpend[p], 0);
      const sumShare = PARTNERS.reduce((s, p) => s + share[p], 0);
      const sumBal = PARTNERS.reduce((s, p) => s + balance[p], 0);
      const sumDrawn = PARTNERS.reduce((s, p) => s + withdrawn[p], 0);
      // Deductions carry the same minus sign and colour as the rows above them —
      // showing "RM 300.00" in the total under a column of "−RM 300.00" reads as
      // a different quantity.
      // Sum the real percentages instead of asserting 100. A corrupt split
      // (50 + 30) used to show rows of 50%/30% under a Total claiming 100%,
      // which reads as a rounding quirk rather than the data problem it is.
      const sumPct = PARTNERS.reduce((s, p) => s + pct(p), 0);
      trTotal.innerHTML = `
        <td>Total</td>
        <td style="color: ${Math.abs(sumPct - 100) > 0.01 ? 'var(--neg)' : 'inherit'};"
            ${Math.abs(sumPct - 100) > 0.01 ? 'title="The partner split does not add up to 100% — fix it in Settings."' : ''}>
          ${sumPct}%
        </td>
        <td>${formatMYR(sumShare)}</td>
        <td style="color: ${sumOop > 0.01 ? 'var(--warn)' : 'inherit'};">
          ${sumOop > 0.01 ? '&minus;' : ''}${formatMYR(sumOop)}
        </td>
        <td style="color: ${sumDrawn > 0.01 ? 'var(--warn)' : 'inherit'};">
          ${sumDrawn > 0.01 ? '&minus;' : ''}${formatMYR(sumDrawn)}
        </td>
        <td style="color: var(--accent);">${formatMYR(sumBal)}</td>
      `;
      tbody.appendChild(trTotal);

      // ---- who has taken what ----
      // Nobody owes anybody anything: every purchase used company money, so
      // there is no cross-settlement to compute. What is worth stating is how
      // much of the account each partner has already consumed personally.
      const settleEl = document.getElementById('partnerSettleUp');
      if (settleEl) {
        if (sumOop < 0.01) {
          settleEl.innerHTML = `<span style="color: var(--bone-dim);">` +
            `No personal spending recorded. Every expense so far was for the company, ` +
            `so the cost is split evenly.</span>`;
        } else {
          const who = PARTNERS.filter(p => personalSpend[p] > 0.01)
            .map(p => `<strong>${esc(p)}</strong> ${formatMYR(personalSpend[p])}`).join(' &middot; ');
          settleEl.innerHTML = `<span style="color: var(--bone-dim);">` +
            `Spent on themselves &mdash; ${who}. Already deducted from that partner's Balance, ` +
            `so there is nothing to settle between you.</span>`;
        }
      }

      // ---- reconciliation ----
      // The partners' balances must equal the cash actually in the account. If
      // they don't, something was entered wrong; say so rather than quietly
      // reporting numbers that don't add up.
      const recEl = document.getElementById('partnerReconcile');
      if (recEl) {

        if (reconciled) {
          recEl.innerHTML =
            `<span style="color: var(--pos);">&#10003; Balanced</span> ` +
            `<span style="color: var(--bone-dim);">&mdash; partner balances (${formatMYR(sumBal)}) ` +
            `match the cash in the account (collected ${formatMYR(collected)} ` +
            `&minus; expenses ${formatMYR(expenses)} ` +
            `&minus; withdrawn ${formatMYR(withdrawnTotal)} = ${formatMYR(distributable)}).</span>`;
          recEl.style.borderColor = 'rgba(74, 222, 128, 0.3)';
        } else {
          const reasons = [];
          // `reconciled` is also false when a table failed to load, and that
          // case had no branch here — so a load error produced the literal
          // text "Does not balance — ." with no reason at all.
          if (loadErrors.length) {
            reasons.push(`${loadErrors.length} table(s) failed to load, so these figures are incomplete`);
          }
          if (unattributed && unattributed.length) {
            reasons.push(`${unattributed.length} personal expense(s) have no valid "Paid By", so they cannot be charged to anyone's share`);
          }
          if (Math.abs(sumBal - distributable) >= 0.01) {
            reasons.push(`balances total ${formatMYR(sumBal)} but ${formatMYR(distributable)} is distributable (out by ${formatMYR(sumBal - distributable)})`);
          }
          // Never render a bare "— ." if some future condition slips through.
          if (!reasons.length) reasons.push('the figures could not be verified');
          recEl.innerHTML =
            `<span style="color: var(--neg); font-weight: 600;">&#9888; Does not balance</span> ` +
            `<span style="color: var(--bone-dim);">&mdash; ${reasons.join('; ')}.</span>`;
          recEl.style.borderColor = 'rgba(248, 113, 113, 0.4)';
        }
      }

      // Render withdrawals history table
      const wTbody = document.getElementById('withdrawalsTableBody');
      wTbody.innerHTML = '';
      if (withdrawalsData.length === 0) {
        wTbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--bone-dim);">No withdrawals recorded yet.</td></tr>';
      } else {
        withdrawalsData.forEach(w => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="white-space: nowrap;">${w.date ? formatDate(w.date) : '<span style="opacity:0.4;">&mdash;</span>'}</td>
            <td style="font-weight: 500;">${esc(w.partner)}</td>
            <td style="color: var(--warn); font-weight: 500;">${formatMYR(w.amount)}</td>
            <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${esc(w.notes)}">${esc(w.notes || '-')}</td>
            <td>
              <div style="display: flex; gap: 0.5rem;">
                <button class="btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; margin: 0; width: auto;" onclick="editWithdrawal('${escArg(w.id)}')">Edit</button>
                <button class="btn-outline" style="padding: 0.25rem 0.5rem; font-size: 0.75rem; color: var(--neg); border-color: rgba(248,113,113,0.3); margin: 0; width: auto;" onclick="deleteWithdrawal('${escArg(w.id)}')">Delete</button>
              </div>
            </td>
          `;
          wTbody.appendChild(tr);
        });
      }
    }

    let reportCharts = {};
    
    function renderReports() {
      let topCategory = 'N/A';
      let highestProj = 'N/A';
      let deadlinesCount = 0;
      
      const categories = {};
      expensesData.forEach(e => {
        const cat = e.category || 'Other';
        categories[cat] = (categories[cat] || 0) + (parseFloat(e.amount) || 0);
      });
      
      let maxSpent = 0;
      Object.keys(categories).forEach(cat => {
        if (categories[cat] > maxSpent) {
          maxSpent = categories[cat];
          topCategory = cat;
        }
      });
      
      let maxProjVal = 0;
      projectsData.forEach(p => {
        const val = parseFloat(p.value) || 0;
        if (val > maxProjVal) {
          maxProjVal = val;
          // No esc(): this lands in .textContent, which does not parse HTML.
          // Escaping first made "Alpha & Co" display as "Alpha &amp; Co".
          highestProj = `${p.name} (${formatMYR(val)})`;
        }
      });
      
      const now = new Date();
      now.setHours(0,0,0,0);
      const limitDate = new Date();
      limitDate.setDate(now.getDate() + 14);
      limitDate.setHours(23,59,59,999);
      
      projectsData.forEach(p => {
        if (p.deadline) {
          const dDate = parseLocalDate(p.deadline);
          if (dDate && dDate >= now && dDate <= limitDate && p.status !== 'Completed' && p.status !== 'Cancelled') {
            deadlinesCount++;
          }
        }
      });
      
      document.getElementById('repTopCategory').textContent = topCategory;
      document.getElementById('repTopProject').textContent = highestProj;
      document.getElementById('repDeadlinesCount').textContent = deadlinesCount;
      
      const oBody = document.getElementById('repOutstandingTableBody');
      oBody.innerHTML = '';
      let oCount = 0;
      projectsData.forEach(p => {
        const t = projectFin(p.id);
        const val = t.contractTotal;
        const col = t.collected;
        const out = Math.max(0, t.outstanding);
        if (out > 0) {
          oCount++;
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td style="font-weight: 500;">${esc(p.name)}</td>
            <td>${esc(p.client)}</td>
            <td style="color: var(--neg); font-weight: 500;">${formatMYR(out)}</td>
          `;
          oBody.appendChild(tr);
        }
      });
      if (oCount === 0) {
        oBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--bone-dim);">No outstanding payments.</td></tr>`;
      }
      
      const dBody = document.getElementById('repDeadlinesTableBody');
      dBody.innerHTML = '';
      let dCount = 0;
      projectsData.forEach(p => {
        if (p.deadline) {
          const dDate = parseLocalDate(p.deadline);
          if (dDate && dDate >= now && dDate <= limitDate && p.status !== 'Completed' && p.status !== 'Cancelled') {
            dCount++;
            const tr = document.createElement('tr');
            tr.innerHTML = `
              <td style="font-weight: 500;">${esc(p.name)}</td>
              <td>${formatDate(p.deadline)}</td>
              <td><span class="status-badge status-badge--neutral">${esc(p.status)}</span></td>
            `;
            dBody.appendChild(tr);
          }
        }
      });
      if (dCount === 0) {
        dBody.innerHTML = `<tr><td colspan="3" style="text-align: center; color: var(--bone-dim);">No deadlines in the next 14 days.</td></tr>`;
      }
      
      renderReportsCharts();
    }
    
    function renderReportsCharts() {
      const monthlyFin = {};
      revenueByMonth().forEach(([monthKey, amt]) => {
        if (!monthlyFin[monthKey]) monthlyFin[monthKey] = { revenue: 0, expenses: 0 };
        monthlyFin[monthKey].revenue += amt;
      });
      
      expensesData.forEach(e => {
        if (e.date) {
          const monthKey = String(e.date).substring(0, 7);
          if (monthKey.length === 7) {
            if (!monthlyFin[monthKey]) monthlyFin[monthKey] = { revenue: 0, expenses: 0 };
            monthlyFin[monthKey].expenses += parseFloat(e.amount) || 0;
          }
        }
      });
      
      const sortedMonths = Object.keys(monthlyFin).sort();
      const labels = sortedMonths.map(m => {
        const [year, month] = m.split('-');
        return new Date(parseInt(year), parseInt(month) - 1, 1).toLocaleString('en-US', { month: 'short', year: '2-digit' });
      });
      
      const revData = sortedMonths.map(m => monthlyFin[m].revenue);
      const expData = sortedMonths.map(m => monthlyFin[m].expenses);
      const netData = sortedMonths.map(m => monthlyFin[m].revenue - monthlyFin[m].expenses);
      
      const isLight = document.documentElement.getAttribute('data-theme') === 'light';
      const textColor = isLight ? '#1d1d1f' : '#ffffff';
      const gridColor = isLight ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.06)';
      
      if (reportCharts.finance) reportCharts.finance.destroy();
      
      const ctxFin = document.getElementById('monthlyFinanceChart').getContext('2d');
      reportCharts.finance = new Chart(ctxFin, {
        type: 'bar',
        data: {
          labels: labels.length > 0 ? labels : ['No Data'],
          datasets: [
            {
              label: 'Collected (Money In)',
              data: revData.length > 0 ? revData : [0],
              backgroundColor: 'rgba(74, 222, 128, 0.75)',
              borderColor: '#4ade80',
              borderWidth: 1
            },
            {
              label: 'Expenses (Money Out)',
              data: expData.length > 0 ? expData : [0],
              backgroundColor: 'rgba(248, 113, 113, 0.75)',
              borderColor: '#f87171',
              borderWidth: 1
            },
            {
              label: 'Net Profit',
              data: netData.length > 0 ? netData : [0],
              type: 'line',
              borderColor: 'rgba(56, 224, 255, 0.85)',
              backgroundColor: 'rgba(56, 224, 255, 0.15)',
              borderWidth: 2,
              tension: 0.3,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: textColor, font: { family: 'JetBrains Mono', size: 10 } } }
          },
          scales: {
            x: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } } },
            y: { grid: { color: gridColor }, ticks: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } } }
          }
        }
      });
      
      const catMap = {};
      expensesData.forEach(e => {
        const cat = e.category || 'Other';
        catMap[cat] = (catMap[cat] || 0) + (parseFloat(e.amount) || 0);
      });
      
      const catLabels = Object.keys(catMap);
      const catValues = Object.values(catMap);
      
      const chartColors = [
        'rgba(217, 70, 70, 0.8)',
        'rgba(56, 130, 224, 0.8)',
        'rgba(251, 191, 36, 0.8)',
        'rgba(74, 222, 128, 0.8)',
        'rgba(167, 139, 250, 0.8)',
        'rgba(244, 63, 94, 0.8)',
        'rgba(20, 184, 166, 0.8)'
      ];
      
      if (reportCharts.category) reportCharts.category.destroy();
      
      const ctxCat = document.getElementById('expenseCategoryChart').getContext('2d');
      reportCharts.category = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
          labels: catLabels.length > 0 ? catLabels : ['No Expenses'],
          datasets: [{
            data: catValues.length > 0 ? catValues : [1],
            backgroundColor: catLabels.length > 0 ? chartColors.slice(0, catLabels.length) : ['rgba(255,255,255,0.1)'],
            borderColor: isLight ? '#ffffff' : 'rgba(25, 25, 25, 1)',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: {
              position: 'right',
              labels: { color: textColor, font: { family: 'JetBrains Mono', size: 9 } }
            }
          }
        }
      });
    }

    // RENDER TEAM
    function renderTeam() {
      const grid = document.getElementById('teamGrid');
      grid.innerHTML = '';

      if (teamData.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--bone-dim); padding: 2rem;">No team members found. Add one above!</div>`;
        return;
      }

      teamData.forEach(t => {
        const card = document.createElement('div');
        card.className = 'team-card glass-card';
        const avatar = t.avatar_url || 'images/kunacosta.jpg'; // fallback to standard static project assets
        
        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <img src="${esc(avatar)}" alt="${esc(t.name)}" class="team-avatar-preview" onerror="this.src='images/onyxx_logo_transparent.png'" />
            <div class="actions-cell">
              <button class="action-btn edit-btn" title="Edit" onclick="openTeamModal('${escArg(t.id)}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="action-btn delete-btn" title="Delete" onclick="deleteTeamMember('${escArg(t.id)}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </div>
          <h3 style="font-family: var(--font-display); font-size: 1.3rem; margin-bottom: 0.2rem; font-weight: 400;">${esc(t.name)}</h3>
          <p style="font-family: var(--font-mono); font-size: 0.75rem; text-transform: uppercase; color: var(--accent); margin-bottom: 1rem;">${esc(t.role)}</p>
          
          <div style="font-size: 0.85rem; color: var(--bone-dim);">
            ${t.whatsapp ? `<div style="margin-bottom: 0.3rem;"><strong>WA:</strong> ${esc(t.whatsapp)}</div>` : ''}
            ${t.email ? `<div><strong>Email:</strong> ${esc(t.email)}</div>` : ''}
          </div>
        `;
        grid.appendChild(card);
      });
    }

    // RENDER SERVICES
    function renderServices() {
      const grid = document.getElementById('servicesGrid');
      grid.innerHTML = '';

      if (servicesData.length === 0) {
        grid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--bone-dim); padding: 2rem;">No services configured. Add one above!</div>`;
        return;
      }

      servicesData.forEach(s => {
        const card = document.createElement('div');
        card.className = 'service-detail-card glass-card';
        
        const tagBadges = Array.isArray(s.tags) 
          ? s.tags.map(tag => `<span class="status-badge" style="margin-right: 0.4rem; font-size: 0.65rem; border-color: rgba(255,255,255,0.15); color: var(--bone-dim);">${esc(tag)}</span>`).join('')
          : '';

        card.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1rem;">
            <div style="font-family: var(--font-mono); font-size: 0.8rem; color: var(--accent);">${esc(s.num || '/00')}</div>
            <div class="actions-cell">
              <button class="action-btn edit-btn" title="Edit" onclick="openServiceModal('${escArg(s.id)}')"><svg viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>
              <button class="action-btn delete-btn" title="Delete" onclick="deleteService('${escArg(s.id)}')"><svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg></button>
            </div>
          </div>
          <h3 style="font-family: var(--font-display); font-size: 1.4rem; margin-bottom: 0.5rem; font-weight: 400;">${esc(s.name)}</h3>
          <p style="font-size: 0.9rem; color: var(--bone-dim); line-height: 1.5; margin-bottom: 1rem;">${esc(s.description)}</p>
          <div style="margin-top: auto; display: flex; flex-wrap: wrap;">
            ${tagBadges}
          </div>
        `;
        grid.appendChild(card);
      });
    }

    // PROJECT CRUD ACTIONS
    function openProjectModal(id = null) {
      const form = document.getElementById('projectForm');
      form.reset();
      
      populateDropdowns();

      if (id) {
        document.getElementById('projectModalTitle').textContent = 'Edit Project';
        const p = projectsData.find(item => item.id === id);
        if (p) {
          document.getElementById('projectId').value = p.id;
          document.getElementById('projectName').value = p.name || '';
          document.getElementById('projectClient').value = p.client || '';
          document.getElementById('projectStartDate').value = p.start_date || '';
          document.getElementById('projectDeadline').value = p.deadline || '';
          document.getElementById('projectStatus').value = p.status || 'In Progress';
          document.getElementById('projectValue').value = p.value || 0;
          
          
          
          document.getElementById('projectAssignedTo').value = p.assigned_to || '';
          document.getElementById('projectNotes').value = p.notes || '';
        }
      } else {
        document.getElementById('projectModalTitle').textContent = 'Add Project';
        document.getElementById('projectId').value = '';
      }
      openModal('projectModal');
    }

    async function saveProject(e) {
      e.preventDefault();
      
      const id = document.getElementById('projectId').value;
      const name = document.getElementById('projectName').value;
      const client = document.getElementById('projectClient').value;
      const start_date = document.getElementById('projectStartDate').value;
      const deadline = document.getElementById('projectDeadline').value;
      const status = document.getElementById('projectStatus').value;
      
      const value = parseFloat(document.getElementById('projectValue').value) || 0;
      const assigned_to = document.getElementById('projectAssignedTo').value || null;
      const notes = document.getElementById('projectNotes').value || null;

      // VALIDATIONS
      if (value < 0) {
        showToast("Project value cannot be negative", "error");
        return;
      }
      if (deadline && start_date && new Date(deadline) < new Date(start_date)) {
        showToast("Deadline cannot be before start date", "error");
        return;
      }

      // The old "deposit + final must not exceed project value" check is gone:
      // installments live in project_payments now, and the detail panel warns
      // when the schedule and the contract total disagree, where the whole
      // schedule is actually visible.

      const row = {
        name,
        client,
        start_date,
        deadline,
        status,
        value,
        assigned_to,
        notes
      };

      try {
        let res;
        if (id) {
          res = await supabaseClient.from('projects').update(row).eq('id', id);
        } else {
          res = await supabaseClient.from('projects').insert([row]);
        }

        if (res.error) throw res.error;
        closeModal('projectModal');
        showToast('Project saved successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error saving project: " + err.message, "error");
      }
    }

    async function deleteProject(id) {
      // project_payments and project_addons are ON DELETE CASCADE, so this one
      // click can destroy months of banked revenue. The old prompt said none of
      // that — and because collected and cashInAccount fall by the same amount,
      // the reconciliation invariant still holds afterwards, so the Partners tab
      // prints "Balanced" over the loss. Nothing else would ever surface it.
      const t = projectFin(id);
      const proj = projectsData.find(p => p.id === id);
      const name = proj ? proj.name : 'this project';

      let warning = `Delete "${name}"?`;
      if (t.payments.length || t.addons.length || t.collected > 0.01) {
        const received = t.payments.filter(p => p.received);
        const bits = [];
        if (t.payments.length) {
          bits.push(`${t.payments.length} payment${t.payments.length === 1 ? '' : 's'}` +
            (received.length ? ` (${received.length} already received, ${formatMYR(t.collected)})` : ''));
        }
        if (t.addons.length) bits.push(`${t.addons.length} add-on${t.addons.length === 1 ? '' : 's'} worth ${formatMYR(t.addonsTotal)}`);
        warning += `\n\nThis permanently deletes ${bits.join(' and ')}.`;
        if (t.collected > 0.01) {
          const perPartner = (t.collected * 0.5);
          warning += `\n\n${formatMYR(t.collected)} of RECEIVED money will disappear from ` +
            `Overview, Cash Flow and Reports, reducing each partner's share by about ` +
            `${formatMYR(perPartner)}. Reconciliation will still read "Balanced" afterwards, ` +
            `so this will not show up as an error anywhere.`;
        }
        warning += `\n\nConsider setting the status to Cancelled instead. Continue?`;
      }
      if (!confirm(warning)) return;

      // Second gate, only when real money is involved — a single OK on a long
      // dialog is too easy to click through.
      if (t.collected > 0.01) {
        const typed = prompt(`This will erase ${formatMYR(t.collected)} of received payments.\n\nType the project name to confirm:`);
        if (typed === null) return;
        if (typed.trim() !== String(name).trim()) {
          showToast('Name did not match — nothing was deleted', 'warning');
          return;
        }
      }
      try {
        const { error } = await supabaseClient.from('projects').delete().eq('id', id);
        if (error) throw error;
        showToast('Project deleted successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error deleting project: " + err.message, "error");
      }
    }

    // EXPENSE CRUD ACTIONS
    /**
     * @param {string|null} id            existing expense to edit
     * @param {string} presetScope        'company' | 'personal' — from the block
     *                                    whose Add button was pressed
     * @param {string|null} presetPayer   for a personal block, who it belongs to
     *
     * On edit both presets are ignored and the row's own values win.
     */
    function openExpenseModal(id = null, presetScope = 'company', presetPayer = null) {
      const form = document.getElementById('expenseForm');
      form.reset();

      populateDropdowns();
      document.getElementById('expenseScope').value = presetScope;
      if (presetPayer) document.getElementById('expensePaidBy').value = presetPayer;

      if (id) {
        document.getElementById('expenseModalTitle').textContent = 'Edit Expense';
        const exp = expensesData.find(item => item.id === id);
        if (exp) {
          document.getElementById('expenseId').value = exp.id;
          document.getElementById('expenseDate').value = exp.date;
          document.getElementById('expenseCategory').value = exp.category;
          document.getElementById('expenseItem').value = exp.item;
          document.getElementById('expenseAmount').value = exp.amount;
          document.getElementById('expensePaidBy').value = exp.paid_by;
          document.getElementById('expenseRecurring').value = exp.recurring ? 'Yes' : 'No';
          document.getElementById('expenseRecurringType').value = exp.recurring_type || 'None';
          // Rows predating this field were all company expenses.
          const scopeEl = document.getElementById('expenseScope');
          if (scopeEl) scopeEl.value = exp.scope || 'company';
          document.getElementById('expenseLinkedProject').value = exp.linked_project_id || '';
          document.getElementById('expenseExistingInvoiceLink').value = exp.invoice_link || '';
          const notesEl = document.getElementById('expenseNotes');
          if (notesEl) notesEl.value = exp.notes || '';
          
          const previewEl = document.getElementById('expenseInvoicePreview');
          if (exp.invoice_link) {
            previewEl.innerHTML = `<button type="button" onclick="openReceiptFile('${escArg(exp.invoice_link)}')"
                     style="background:none;border:none;padding:0;cursor:pointer;color: var(--accent); text-decoration: underline;">View Current File</button>`;
          } else {
            previewEl.innerHTML = '';
          }
        }
      } else {
        const forWhom = presetScope === 'personal'
          ? `Personal Expense${presetPayer ? ' — ' + presetPayer : ''}`
          : 'Company Expense';
        document.getElementById('expenseModalTitle').textContent = `Add ${forWhom}`;
        document.getElementById('expenseId').value = '';
        document.getElementById('expenseRecurring').value = 'No';
        document.getElementById('expenseRecurringType').value = 'None';
        document.getElementById('expenseLinkedProject').value = '';
        document.getElementById('expenseDate').value = todayLocal();
      }

      // A personal expense belongs to exactly one partner — the block it was
      // added from. Locking the field stops it being changed here and silently
      // moving the row to the other partner's section.
      //
      // UNLESS the current value is not a valid partner. Such a row shows up in
      // the "Unassigned" block telling the user to edit it, and locking a blank
      // select made that impossible: no partner could be chosen, the save was
      // rejected for a missing Paid By, and the row was stuck unattributed —
      // holding `reconciled` false forever with no way out but delete-and-re-add.
      const paidBy = document.getElementById('expensePaidBy');
      const scope = document.getElementById('expenseScope').value;
      if (paidBy) {
        const valid = PARTNERS.some(p => p.toLowerCase() === String(paidBy.value).trim().toLowerCase());
        paidBy.disabled = (scope === 'personal') && valid;
        paidBy.title = paidBy.disabled
          ? 'Fixed by the section this was added from. To move it, delete and re-add under the other partner.'
          : (scope === 'personal' ? 'This expense is not charged to anyone yet — pick who it was for.' : '');
      }

      updateExpenseScopeHint();
      openModal('expenseModal');
    }

    /**
     * State in the form what this expense will actually do to the books.
     *
     * The scope is no longer a control the user sets here — it comes from the
     * section they pressed Add in — so this is confirmation rather than a
     * prompt. Quoting real ringgit as the amount is typed is the point: which
     * partner ends up carrying the money is not obvious from a heading alone.
     */
    function updateExpenseScopeHint() {
      const hint = document.getElementById('expenseScopeHint');
      const scopeEl = document.getElementById('expenseScope');
      if (!hint || !scopeEl) return;
      const amt = parseFloat(document.getElementById('expenseAmount')?.value) || 0;
      const rawWho = document.getElementById('expensePaidBy')?.value;
      // Only treat it as a payer if it really is one. With a blank value,
      // `PARTNERS.find(p => p !== who)` happily returns the FIRST partner, so
      // the hint used to name someone at random as "unaffected".
      const who = PARTNERS.find(p => p.toLowerCase() === String(rawWho || '').trim().toLowerCase()) || '';
      const other = who ? PARTNERS.find(p => p !== who) : null;

      if (scopeEl.value === 'personal') {
        hint.style.background = 'rgba(251, 191, 36, 0.08)';
        hint.style.border = '1px solid rgba(251, 191, 36, 0.3)';
        hint.style.color = 'var(--bone)';
        hint.innerHTML = amt
          ? `<strong>Personal.</strong> The full ${formatMYR(amt)} comes off `
            + `${esc(who || 'the buyer')}'s share${other ? ` — ${esc(other)}'s figures do not move` : ''}.`
          : `<strong>Personal.</strong> Paid with company money, and the whole amount `
            + `comes off ${esc(who || 'the buyer')}'s share. The other partner is unaffected.`;
      } else {
        hint.style.background = 'rgba(56, 224, 255, 0.07)';
        hint.style.border = '1px solid var(--accent-faint)';
        hint.style.color = 'var(--bone)';
        // Read the real split rather than assuming halves — this was the one
        // place money was computed outside computeFinancials(), and under a
        // 60/40 split it quoted both partners the wrong number.
        const parts = PARTNERS.map(p => {
          const pct = systemSettings.partner_split?.[p] ?? (100 / PARTNERS.length);
          return `${esc(p)} ${formatMYR(amt * (pct / 100))}`;
        }).join(' &middot; ');
        const splitLabel = PARTNERS
          .map(p => `${systemSettings.partner_split?.[p] ?? (100 / PARTNERS.length)}%`).join('/');

        hint.innerHTML = amt
          ? `<strong>Company.</strong> Paid from the account — the cost lands on both of you: ${parts}.`
          : `<strong>Company.</strong> Paid from the account, cost shared ${splitLabel}.`;
      }
    }

    async function saveExpense(e) {
      e.preventDefault();
      
      const id = document.getElementById('expenseId').value;
      const date = document.getElementById('expenseDate').value;
      const category = document.getElementById('expenseCategory').value;
      const item = document.getElementById('expenseItem').value;
      const amount = parseFloat(document.getElementById('expenseAmount').value) || 0;
      const paid_by = document.getElementById('expensePaidBy').value;
      // 'company' shares the cost by the partner split; 'personal'
      // leaves it entirely with whoever bought it.
      const scope = document.getElementById('expenseScope')?.value || 'company';
      const recurring = document.getElementById('expenseRecurring').value === 'Yes';
      const recurring_type = document.getElementById('expenseRecurringType').value || 'None';
      const linked_project_id = document.getElementById('expenseLinkedProject').value || null;
      let invoice_link = document.getElementById('expenseExistingInvoiceLink').value || null;
      const notes = document.getElementById('expenseNotes')?.value || null;

      const fileInput = document.getElementById('expenseInvoiceLink');

      // VALIDATIONS
      if (amount < 0) {
        showToast("Expense amount cannot be negative", "error");
        return;
      }
      if (!paid_by) {
        showToast("Please select who paid the expense", "error");
        return;
      }
      
      // Handle file upload
      if (fileInput.files.length > 0) {
        const file = fileInput.files[0];
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
        
        showToast('Uploading file...', 'info');
        try {
          const { error } = await supabaseClient.storage.from('receipts').upload(fileName, file);
          if (error) throw error;

          // Store the OBJECT PATH, not a public URL. Receipts are financial
          // paperwork; a public URL is readable by anyone who has or guesses it,
          // and it also pins the bucket open forever — you cannot make the
          // bucket private later without breaking every stored link. The path is
          // resolved to a short-lived signed URL at click time instead
          // (openReceiptFile below), the same as quotations.
          invoice_link = fileName;
        } catch (uploadErr) {
          showToast('Failed to upload file: ' + uploadErr.message, 'error');
          return; // Stop saving expense if file upload fails
        }
      }

      const row = {
        date,
        category,
        item,
        amount,
        paid_by,
        recurring,
        recurring_type,
        scope,
        linked_project_id,
        invoice_link,
        notes
      };

      try {
        let res;
        if (id) {
          res = await supabaseClient.from('expenses').update(row).eq('id', id);
        } else {
          res = await supabaseClient.from('expenses').insert([row]);
        }

        if (res.error) throw res.error;
        closeModal('expenseModal');
        showToast('Expense saved successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error saving expense: " + err.message, "error");
      }
    }

    async function deleteExpense(id) {
      if (!confirm("Are you sure you want to delete this expense?")) return;
      try {
        const { error } = await supabaseClient.from('expenses').delete().eq('id', id);
        if (error) throw error;
        showToast('Expense deleted successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error deleting expense: " + err.message, "error");
      }
    }

    // TEAM MEMBER CRUD ACTIONS
    function openTeamModal(id = null) {
      const form = document.getElementById('teamForm');
      form.reset();

      const previewEl = document.getElementById('teamAvatarPreviewContainer');
      previewEl.innerHTML = '';
      document.getElementById('teamAvatarFile').value = '';

      if (id) {
        document.getElementById('teamModalTitle').textContent = 'Edit Team Member';
        const t = teamData.find(item => item.id === id);
        if (t) {
          document.getElementById('teamId').value = t.id;
          document.getElementById('teamName').value = t.name;
          document.getElementById('teamRole').value = t.role;
          document.getElementById('teamWhatsapp').value = t.whatsapp || '';
          document.getElementById('teamEmail').value = t.email || '';
          document.getElementById('teamExistingAvatarUrl').value = t.avatar_url || '';
          if (t.avatar_url) {
            previewEl.innerHTML = `<img src="${t.avatar_url}" style="width: 40px; height: 40px; border-radius: 50%; object-fit: cover; border: 1px solid var(--glass-border);" /> <span style="font-size: 0.8rem; color: var(--bone-dim);">Current Avatar</span>`;
          }
        }
      } else {
        document.getElementById('teamModalTitle').textContent = 'Add Team Member';
        document.getElementById('teamId').value = '';
        document.getElementById('teamExistingAvatarUrl').value = '';
      }
      openModal('teamModal');
    }

    async function saveTeamMember(e) {
      e.preventDefault();
      const id = document.getElementById('teamId').value;
      let avatar_url = document.getElementById('teamExistingAvatarUrl').value || null;
      const fileInput = document.getElementById('teamAvatarFile');

      if (fileInput.files.length > 0) {
        // Avatars only ever render at ~130px, so a smaller cap than the
        // showcase default (1600px) is plenty and compresses further.
        const file = await compressImageFile(fileInput.files[0], { maxDim: 500 });
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;

        showToast('Uploading avatar...', 'info');
        try {
          const { error } = await supabaseClient.storage.from('avatars').upload(fileName, file);
          if (error) throw error;

          const { data: publicUrlData } = supabaseClient.storage.from('avatars').getPublicUrl(fileName);
          avatar_url = publicUrlData.publicUrl;
        } catch (uploadErr) {
          showToast('Failed to upload avatar: ' + uploadErr.message, 'error');
          return;
        }
      }

      const row = {
        name: document.getElementById('teamName').value,
        role: document.getElementById('teamRole').value,
        whatsapp: document.getElementById('teamWhatsapp').value || null,
        email: document.getElementById('teamEmail').value || null,
        avatar_url: avatar_url
      };

      try {
        let res;
        if (id) {
          res = await supabaseClient.from('team_members').update(row).eq('id', id);
        } else {
          res = await supabaseClient.from('team_members').insert([row]);
        }

        if (res.error) throw res.error;
        closeModal('teamModal');
        showToast('Team member saved successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error saving team member: " + err.message, "error");
      }
    }

    async function deleteTeamMember(id) {
      if (!confirm("Are you sure you want to delete this team member?")) return;
      try {
        const { error } = await supabaseClient.from('team_members').delete().eq('id', id);
        if (error) throw error;
        showToast('Team member deleted successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error deleting team member: " + err.message, "error");
      }
    }

    // SERVICE CRUD ACTIONS
    function openServiceModal(id = null) {
      const form = document.getElementById('serviceForm');
      form.reset();

      if (id) {
        document.getElementById('serviceModalTitle').textContent = 'Edit Service';
        const s = servicesData.find(item => item.id === id);
        if (s) {
          document.getElementById('serviceId').value = s.id;
          document.getElementById('serviceNum').value = s.num;
          document.getElementById('serviceName').value = s.name;
          document.getElementById('serviceDescription').value = s.description;
          document.getElementById('serviceTags').value = Array.isArray(s.tags) ? s.tags.join(', ') : '';
        }
      } else {
        document.getElementById('serviceModalTitle').textContent = 'Add Service';
        document.getElementById('serviceId').value = '';
      }
      openModal('serviceModal');
    }

    async function saveService(e) {
      e.preventDefault();
      const id = document.getElementById('serviceId').value;
      
      const tagInput = document.getElementById('serviceTags').value;
      const tagsArray = tagInput ? tagInput.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0) : [];

      const row = {
        num: document.getElementById('serviceNum').value,
        name: document.getElementById('serviceName').value,
        description: document.getElementById('serviceDescription').value,
        tags: tagsArray
      };

      try {
        let res;
        if (id) {
          res = await supabaseClient.from('services').update(row).eq('id', id);
        } else {
          res = await supabaseClient.from('services').insert([row]);
        }

        if (res.error) throw res.error;
        closeModal('serviceModal');
        showToast('Service saved successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error saving service: " + err.message, "error");
      }
    }

    async function deleteService(id) {
      if (!confirm("Are you sure you want to delete this service?")) return;
      try {
        const { error } = await supabaseClient.from('services').delete().eq('id', id);
        if (error) throw error;
        showToast('Service deleted successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error deleting service: " + err.message, "error");
      }
    }

    // PARTNER WITHDRAWALS CRUD ACTIONS
    function openWithdrawalModal(id = null) {
      const form = document.getElementById('withdrawalForm');
      form.reset();

      // Default date to today
      const today = todayLocal();
      document.getElementById('withdrawalDate').value = today;

      if (id) {
        document.getElementById('withdrawalModalTitle').textContent = 'Edit Withdrawal';
        const w = withdrawalsData.find(item => item.id === id);
        if (w) {
          document.getElementById('withdrawalId').value = w.id;
          document.getElementById('withdrawalPartner').value = w.partner;
          document.getElementById('withdrawalAmount').value = w.amount;
          document.getElementById('withdrawalDate').value = w.date;
          document.getElementById('withdrawalNotes').value = w.notes || '';
        }
      } else {
        document.getElementById('withdrawalModalTitle').textContent = 'Log Withdrawal';
        document.getElementById('withdrawalId').value = '';
      }
      openModal('withdrawalModal');
    }

    async function saveWithdrawal(e) {
      e.preventDefault();
      const id = document.getElementById('withdrawalId').value;
      const partner = document.getElementById('withdrawalPartner').value;
      const amount = parseFloat(document.getElementById('withdrawalAmount').value);
      const date = document.getElementById('withdrawalDate').value;
      const notes = document.getElementById('withdrawalNotes').value || null;

      const row = {
        partner,
        amount,
        date,
        notes
      };

      try {
        let res;
        if (id) {
          res = await supabaseClient.from('partner_withdrawals').update(row).eq('id', id);
        } else {
          res = await supabaseClient.from('partner_withdrawals').insert([row]);
        }

        if (res.error) throw res.error;
        closeModal('withdrawalModal');
        showToast('Withdrawal saved successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error saving withdrawal: " + err.message, "error");
      }
    }

    async function deleteWithdrawal(id) {
      if (!confirm("Are you sure you want to delete this withdrawal record?")) return;
      try {
        const { error } = await supabaseClient.from('partner_withdrawals').delete().eq('id', id);
        if (error) throw error;
        showToast('Withdrawal deleted successfully', 'success');
        await loadAllData();
      } catch (err) {
        showToast("Error deleting withdrawal: " + err.message, "error");
      }
    }

    window.editWithdrawal = openWithdrawalModal;
    window.deleteWithdrawal = deleteWithdrawal;

    // ============ THEME SWITCHER LOGIC ============
    function toggleTheme() {
      const currentTheme = document.documentElement.getAttribute('data-theme');
      const targetTheme = currentTheme === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', targetTheme);
      localStorage.setItem('theme', targetTheme);
      
      updateThemeToggleIcons();

      // Redraw EVERY chart. Chart.js bakes colours in at construction, so any
      // renderer not called here keeps the previous theme's axis and legend
      // colours — Cash Flow was missing, which left all three of its charts
      // white-on-white after one click, unreadable until a full reload.
      // Listed in one place so the next chart added cannot repeat it.
      [renderOverview, renderReportsCharts, renderCashflow].forEach(fn => {
        try { fn(); } catch (err) { console.error('theme redraw failed:', err); }
      });
      markScrollableTables();
    }

    /**
     * Mark every table that is genuinely wider than its container.
     *
     * .table-container's comment has always claimed a right-edge fade signals
     * more content; no such rule existed, and the scrollbar renders 0-2px
     * against the card. So on an ordinary 1440px laptop the Projects table cut
     * its Outstanding value mid-digit and dropped Edit/Delete entirely, with
     * nothing on screen suggesting they were there.
     *
     * A class rather than an unconditional style, so tables that fit are not
     * given a pointlessly faded edge.
     */
    /**
     * Stamp each <td> with the text of its column header.
     *
     * Below 860px the CSS turns every row into a stacked card and prints these
     * as the label beside each value. Doing it here, from the table's own
     * <thead>, rather than hand-writing data-label into ~15 render functions:
     * there is one implementation to get right, and a column added or reordered
     * later cannot silently mislabel a row.
     *
     * Cells that span (empty states, the "Total" row) are skipped — they have
     * no single column to name.
     */
    function applyResponsiveTableLabels(root = document) {
      root.querySelectorAll('table').forEach(table => {
        const heads = [...table.querySelectorAll('thead th')].map(th =>
          (th.textContent || '').replace(/\s+/g, ' ').trim());
        if (!heads.length) return;
        table.querySelectorAll('tbody tr').forEach(tr => {
          [...tr.children].forEach((cell, i) => {
            if (cell.colSpan > 1) return;
            const label = heads[i];
            if (label) cell.setAttribute('data-label', label);
          });
        });
      });
    }

    function markScrollableTables() {
      document.querySelectorAll('.table-container').forEach(el => {
        // 2px tolerance: sub-pixel rounding otherwise flags tables that fit.
        const more = el.scrollWidth - el.clientWidth - el.scrollLeft;
        el.classList.toggle('is-scrollable', more > 2);
      });
    }

    let _scrollMarkTimer = null;
    window.addEventListener('resize', () => {
      clearTimeout(_scrollMarkTimer);
      _scrollMarkTimer = setTimeout(markScrollableTables, 120);
    });
    // Drop the fade once the user has scrolled to the end of a table.
    document.addEventListener('scroll', e => {
      const el = e.target;
      if (el instanceof HTMLElement && el.classList && el.classList.contains('table-container')) {
        el.classList.toggle('is-scrollable',
          el.scrollWidth - el.clientWidth - el.scrollLeft > 2);
      }
    }, true);

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

      /* The filter and search controls are NOT bound here. Every one of them
         already carries an inline oninput/onchange in the markup, and binding
         again made each keystroke in the client search rebuild the entire
         projects table and all its detail rows TWICE. One source of truth. */

      ['expenseScope', 'expenseAmount', 'expensePaidBy'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateExpenseScopeHint);
        if (el) el.addEventListener('change', updateExpenseScopeHint);
      });

    });

    /* ------------------------------------------------------------------
       DOUBLE-SUBMIT GUARD

       Every save handler is async and awaits Supabase before it re-renders.
       A double-click therefore fired the handler twice before the first
       insert resolved, writing two rows. On an expense that is not a cosmetic
       glitch: a duplicated RM1,000 expense paid by one partner moves that
       partner's balance RM500 up and the other's RM500 down — and because
       both sides of the reconciliation invariant shift together, the Partners
       tab still reports "Balanced". Nothing would ever surface it.

       Wrapping the globals rather than editing eight function bodies keeps
       this in one place, so a handler added later is covered by adding its
       name here. The functions are declared with `function`, so they are
       hoisted and already on `window` by the time this runs.
       ------------------------------------------------------------------ */
    (function installSubmitGuards() {
      const submitHandlers = [
        'saveProject', 'saveExpense', 'saveWithdrawal', 'saveShowcaseProject',
        'saveTeamMember', 'saveService', 'saveQuotation'
      ];

      function lock(form) {
        const btn = form ? form.querySelector('[type="submit"]') : null;
        const prev = btn ? btn.textContent : null;
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        return () => { if (btn) { btn.disabled = false; btn.textContent = prev; } };
      }

      submitHandlers.forEach(name => {
        const original = window[name];
        if (typeof original !== 'function') {
          console.warn(`[submit guard] ${name} is not defined — not guarded`);
          return;
        }
        let busy = false;
        window[name] = function (e) {
          if (busy) { if (e && e.preventDefault) e.preventDefault(); return; }
          busy = true;
          if (e && e.preventDefault) e.preventDefault();
          const unlock = lock(e && e.target);
          return Promise.resolve()
            .then(() => original.apply(this, arguments))
            .finally(() => { busy = false; unlock(); });
        };
      });

      // addPayment/addAddon take (projectId, form) instead of an event, and
      // several project panels can be open at once — so the lock is per form,
      // not one flag for the whole function.
      ['addPayment', 'addAddon'].forEach(name => {
        const original = window[name];
        if (typeof original !== 'function') {
          console.warn(`[submit guard] ${name} is not defined — not guarded`);
          return;
        }
        const inFlight = new WeakSet();
        window[name] = function (projectId, form) {
          if (form && inFlight.has(form)) return;
          if (form) inFlight.add(form);
          const unlock = lock(form);
          return Promise.resolve()
            .then(() => original.apply(this, arguments))
            .finally(() => { if (form) inFlight.delete(form); unlock(); });
        };
      });
    })();
