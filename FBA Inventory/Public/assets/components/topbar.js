/* ====================================================
   Topbar — renders into #app-topbar
   ==================================================== */

(function () {
  // All routes for command palette
  const ALL_ROUTES = [
    { label: 'Dashboard',           href: '#/dashboard',            icon: 'layout-dashboard' },
    { label: 'Upload Reports',      href: '#/upload',               icon: 'upload-cloud' },
    { label: 'Reports',             href: '#/reports',              icon: 'file-bar-chart' },
    { label: 'Shipment Recon',      href: '#/shipment-recon',       icon: 'ship' },
    { label: 'Removal Recon',       href: '#/removal-recon',        icon: 'trash-2' },
    { label: 'Returns Recon',       href: '#/returns-recon',        icon: 'corner-down-left' },
    { label: 'Replacement Recon',   href: '#/replacement-recon',    icon: 'refresh-cw' },
    { label: 'FC Transfer Recon',   href: '#/fc-transfer-recon',    icon: 'arrow-right-left' },
    { label: 'Grade & Resell',      href: '#/grade-resell',         icon: 'tag' },
    { label: 'GNR Recon',           href: '#/gnr-recon',            icon: 'clipboard-list' },
    { label: 'Full Inventory Recon',href: '#/full-recon',           icon: 'database' },
    { label: 'Sales Recon',         href: '#/sales-recon',          icon: 'bar-chart-2' },
    { label: 'Sales Orders',        href: '#/sales-orders',         icon: 'shopping-cart' },
    { label: 'Sales Again Purchase',href: '#/sales-again-purchase', icon: 'repeat' },
    { label: 'Sales Analysis',      href: '#/sales-analysis',       icon: 'pie-chart' },
    { label: 'Return Analysis',     href: '#/return-analysis',      icon: 'undo-2' },
    { label: 'Profit Analysis',     href: '#/profit-analysis',      icon: 'activity' },
    { label: 'Cases & Adjustments', href: '#/cases-adjustments',    icon: 'alert-circle' },
  ];

  let paletteOpen = false;

  // ── Init topbar DOM ──
  function init() {
    const bar = document.getElementById('app-topbar');
    if (!bar) return;

    // Apply saved theme before render
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    bar.innerHTML = `
      <div class="tb-breadcrumb" id="tb-breadcrumb">
        <strong id="tb-title">InvenSync</strong>
      </div>
      <div class="tb-actions" id="tb-actions">
        <div id="tb-page-actions" style="display:flex;align-items:center;gap:6px"></div>
      </div>
    `;

    // Ctrl+K still opens the command palette
    document.addEventListener('keydown', e => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); openPalette(); }
    });

    updateThemeIcon();
  }

  // ── Breadcrumb update ──
  function setTitle(title, crumbs) {
    const el = document.getElementById('tb-title');
    if (el) el.textContent = title;
    const bc = document.getElementById('tb-breadcrumb');
    if (bc && crumbs) {
      bc.innerHTML = `<span style="color:var(--text3)">${crumbs} / </span><strong>${title}</strong>`;
    } else if (bc) {
      bc.innerHTML = `<strong>${title}</strong>`;
    }
  }

  // ── Dark mode ──
  function toggleTheme() {
    const html = document.documentElement;
    const isDark = html.getAttribute('data-theme') === 'dark';
    if (isDark) {
      html.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    } else {
      html.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    }
    updateThemeIcon();
  }

  function updateThemeIcon() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const icon = document.getElementById('tb-theme-icon');
    if (!icon) return;
    // Sun = light mode, Moon = dark mode (clicking switches to dark/light)
    if (isDark) {
      // Show sun (currently dark, click will go light)
      icon.outerHTML = `<svg id="tb-theme-icon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`;
    } else {
      // Show moon (currently light, click will go dark)
      icon.outerHTML = `<svg id="tb-theme-icon" xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`;
    }
  }

  // ── Command palette ──
  function openPalette() {
    if (paletteOpen) return;
    paletteOpen = true;

    const bd = document.createElement('div');
    bd.className = 'cmd-backdrop';
    bd.id = 'cmd-palette';

    bd.innerHTML = `
      <div class="cmd-box">
        <div class="cmd-input-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--text3);flex-shrink:0"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" placeholder="Search pages…" id="cmd-search-input" autocomplete="off" />
        </div>
        <div class="cmd-results" id="cmd-results"></div>
      </div>
    `;

    document.body.appendChild(bd);

    const input = document.getElementById('cmd-search-input');
    input.focus();

    renderResults('');

    input.addEventListener('input', () => renderResults(input.value));

    bd.addEventListener('click', (e) => {
      if (e.target === bd) closePalette();
    });

    const escListener = (e) => {
      if (e.key === 'Escape') { closePalette(); document.removeEventListener('keydown', escListener); }
      if (e.key === 'Enter') {
        const focused = document.querySelector('.cmd-item.focused');
        focused?.click();
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        navigatePalette(e.key === 'ArrowDown' ? 1 : -1);
      }
    };
    document.addEventListener('keydown', escListener);
  }

  function renderResults(query) {
    const container = document.getElementById('cmd-results');
    if (!container) return;

    const q = query.toLowerCase();
    const filtered = ALL_ROUTES.filter(r => r.label.toLowerCase().includes(q));

    if (!filtered.length) {
      container.innerHTML = `<div class="cmd-empty">No pages found</div>`;
      return;
    }

    container.innerHTML = filtered.map((r, i) => `
      <div class="cmd-item ${i === 0 ? 'focused' : ''}" data-href="${r.href}">
        <span class="cmd-item-icon">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
        </span>
        <span class="cmd-item-label">${r.label}</span>
      </div>
    `).join('');

    container.querySelectorAll('.cmd-item').forEach(item => {
      item.addEventListener('click', () => {
        window.location.hash = item.dataset.href.replace(/^#/, '');
        closePalette();
      });
    });
  }

  function navigatePalette(dir) {
    const items = [...document.querySelectorAll('.cmd-item')];
    const idx = items.findIndex(i => i.classList.contains('focused'));
    items[idx]?.classList.remove('focused');
    const next = (idx + dir + items.length) % items.length;
    items[next]?.classList.add('focused');
    items[next]?.scrollIntoView({ block: 'nearest' });
  }

  function closePalette() {
    paletteOpen = false;
    document.getElementById('cmd-palette')?.remove();
  }

  // ── Public API ──
  window.Topbar = {
    init,
    setTitle,
    openPalette,
    closePalette,
    toggleTheme,

    /** Inject page-specific HTML into the topbar action slot */
    setPageActions(html) {
      const slot = document.getElementById('tb-page-actions');
      if (!slot) return;
      slot.innerHTML = typeof html === 'string' ? html : '';
      if (window.lucide) window.lucide.createIcons();
    },

    /** Append a DOM element to the topbar action slot */
    appendPageAction(el) {
      const slot = document.getElementById('tb-page-actions');
      if (slot && el) slot.appendChild(el);
    },

    /** Clear all page-specific actions (called on route change) */
    clearPageActions() {
      const slot = document.getElementById('tb-page-actions');
      if (slot) slot.innerHTML = '';
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
