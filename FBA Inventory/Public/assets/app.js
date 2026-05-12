/* ====================================================
   InvenSync ERP — Hash Router
   ==================================================== */

(function () {

  // ── Route map: hash → view module path ──
  const ROUTES = {
    '#/dashboard':            '/assets/views/dashboard.js',
    '#/upload':               '/assets/views/upload.js',
    '#/reports':              '/assets/views/reports.js',
    '#/shipment-recon':       '/assets/views/shipment-recon.js',
    '#/removal-recon':        '/assets/views/removal-recon.js',
    '#/returns-recon':        '/assets/views/returns-recon.js',
    '#/replacement-recon':    '/assets/views/replacement-recon.js',
    '#/fc-transfer-recon':    '/assets/views/fc-transfer-recon.js',
    '#/grade-resell':         '/assets/views/grade-resell.js',
    '#/gnr-recon':            '/assets/views/gnr-recon.js',
    '#/full-recon':           '/assets/views/full-recon.js',
    '#/sales-recon':          '/assets/views/sales-recon.js',
    '#/sales-orders':         '/assets/views/sales-orders.js',
    '#/sales-again-purchase': '/assets/views/sales-again-purchase.js',
    '#/sales-analysis':       '/assets/views/sales-analysis.js',
    '#/return-analysis':      '/assets/views/return-analysis.js',
    '#/profit-analysis':      '/assets/views/profit-analysis.js',
    '#/cases-adjustments':    '/assets/views/cases-adjustments.js',
  };

  // Pretty labels for topbar breadcrumb
  const ROUTE_LABELS = {
    '#/dashboard':            'Dashboard',
    '#/upload':               'Upload Reports',
    '#/reports':              'Reports',
    '#/shipment-recon':       'Shipment Recon',
    '#/removal-recon':        'Removal Recon',
    '#/returns-recon':        'Returns Recon',
    '#/replacement-recon':    'Replacement Recon',
    '#/fc-transfer-recon':    'FC Transfer Recon',
    '#/grade-resell':         'Grade & Resell',
    '#/gnr-recon':            'GNR Recon',
    '#/full-recon':           'Full Inventory Recon',
    '#/sales-recon':          'Sales Recon',
    '#/sales-orders':         'Sales Orders',
    '#/sales-again-purchase': 'Sales Again Purchase',
    '#/sales-analysis':       'Sales Analysis',
    '#/return-analysis':      'Return Analysis',
    '#/profit-analysis':      'Profit Analysis',
    '#/cases-adjustments':    'Cases & Adjustments',
  };

  // Cache of loaded view modules { path -> module }
  const viewCache = {};

  // ── Navigate to a route ──
  async function navigate() {
    const rawHash = window.location.hash || '#/';
    const hashBase = rawHash.split('?')[0]; // strip query params for routing

    // Redirect empty / root to dashboard
    if (!hashBase || hashBase === '#' || hashBase === '#/') {
      window.location.hash = '#/dashboard';
      return;
    }

    const modulePath = ROUTES[hashBase];
    if (!modulePath) {
      // Unknown route — redirect home
      window.location.hash = '#/dashboard';
      return;
    }

    // Update page title / breadcrumb
    const title = ROUTE_LABELS[hashBase] || 'InvenSync';
    document.title = `${title} — InvenSync ERP`;
    window.Topbar?.setTitle(title, 'InvenSync');

    // Clear any page-specific topbar actions from the previous view
    window.Topbar?.clearPageActions();

    // Update sidebar active state
    window.Sidebar?.updateActive();

    // Render view into #app-view
    const container = document.getElementById('app-view');
    if (!container) return;

    // Show loading state
    container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:200px;color:var(--text3)">
        <div class="spinner"></div>
      </div>
    `;

    try {
      const view = await loadView(modulePath);
      window.currentView = view;
      container.innerHTML = '';
      view.render(container);
    } catch (err) {
      console.error('[Router] Failed to load view:', modulePath, err);
      container.innerHTML = `
        <div style="padding:40px;text-align:center;color:var(--red)">
          <p style="font-size:18px;font-weight:600">Failed to load view</p>
          <p style="font-size:13px;margin-top:8px;color:var(--text3)">${modulePath}</p>
        </div>
      `;
    }
  }

  // ── Dynamically load a view script ──
  function loadView(path) {
    if (viewCache[path]) {
      return Promise.resolve(viewCache[path]);
    }
    return new Promise((resolve, reject) => {
      // Remove old script with same src if any
      const existing = document.querySelector(`script[data-view="${path}"]`);
      if (existing) existing.remove();

      // Each view sets window.__viewExport before the script ends
      window.__viewExport = null;

      const script = document.createElement('script');
      script.src = path + '?v=' + Date.now(); // bust cache during dev
      script.dataset.view = path;
      script.onload = () => {
        const mod = window.__viewExport;
        if (mod && typeof mod.render === 'function') {
          viewCache[path] = mod;
          resolve(mod);
        } else {
          reject(new Error('View did not export { render }'));
        }
      };
      script.onerror = () => reject(new Error('Script load failed: ' + path));
      document.head.appendChild(script);
    });
  }

  // ── Global keyboard shortcuts ──
  document.addEventListener('keydown', (e) => {
    const mod = e.ctrlKey || e.metaKey;

    if (mod && e.key === 'k') {
      e.preventDefault();
      window.Topbar?.openPalette();
      return;
    }
    if (mod && e.key === 'u') {
      e.preventDefault();
      window.location.hash = '#/upload';
      return;
    }
    if (mod && e.key === 'd') {
      e.preventDefault();
      window.location.hash = '#/dashboard';
      return;
    }
    if (e.key === 'Escape') {
      window.Topbar?.closePalette?.();
      return;
    }
  });

  // ── Global drawer helpers ──
  window.openDrawer = function(title, sub, bodyHtml) {
    document.getElementById('drawer-title').textContent = title || '—';
    document.getElementById('drawer-sub').textContent   = sub   || '';
    document.getElementById('drawer-body').innerHTML    = bodyHtml || '';
    document.getElementById('app-drawer').classList.add('open');
    document.getElementById('drawer-overlay').classList.add('open');
  };
  window.closeDrawer = function() {
    document.getElementById('app-drawer').classList.remove('open');
    document.getElementById('drawer-overlay').classList.remove('open');
  };

  // ── Global tooltip (data-tip system) ──
  let _tip = null;
  window.showTip = function(e, el) {
    if (!_tip) _tip = document.getElementById('g-tip');
    const html = el.getAttribute('data-tip');
    if (!html) return;
    _tip.innerHTML = html;
    _tip.style.display = 'block';
    window.moveTip(e);
  };
  window.moveTip = function(e) {
    if (!_tip || _tip.style.display === 'none') return;
    let x = e.clientX + 14, y = e.clientY - 10;
    if (x + 270 > window.innerWidth)  x = e.clientX - 280;
    if (y + _tip.offsetHeight > window.innerHeight) y = e.clientY - _tip.offsetHeight - 6;
    _tip.style.left = x + 'px';
    _tip.style.top  = y + 'px';
  };
  window.hideTip = function() {
    if (_tip) _tip.style.display = 'none';
  };
  window.escAttr = function(s) {
    return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  window.escH = function(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  };

  // ── .htip tooltip system ──
  (function initHtip() {
    function place(tip, e) {
      const w = tip.offsetWidth || 230, h = tip.offsetHeight || 130;
      let x = e.clientX + 14, y = e.clientY - 10;
      if (x + w > window.innerWidth  - 8) x = e.clientX - w - 10;
      if (y + h > window.innerHeight - 8) y = e.clientY - h - 10;
      if (y < 4) y = 4;
      tip.style.left = x + 'px';
      tip.style.top  = y + 'px';
    }
    document.body.addEventListener('mouseenter', function(e) {
      const el = e.target && e.target.closest && e.target.closest('.htip');
      if (!el) return;
      const box = el.querySelector('.htip-box');
      if (!box || !box.innerHTML.trim()) return;
      const tip = document.getElementById('g-tip');
      if (!tip) return;
      tip.innerHTML = box.innerHTML;
      tip.style.display = 'block';
      place(tip, e);
    }, true);
    document.body.addEventListener('mousemove', function(e) {
      const tip = document.getElementById('g-tip');
      if (!tip || tip.style.display === 'none') return;
      place(tip, e);
    }, true);
    document.body.addEventListener('mouseleave', function(e) {
      const el = e.target && e.target.closest && e.target.closest('.htip');
      if (!el) return;
      if (!el.contains(e.relatedTarget)) {
        const tip = document.getElementById('g-tip');
        if (tip) tip.style.display = 'none';
      }
    }, true);
  })();

  // ── Router listeners ──
  window.addEventListener('hashchange', navigate);
  window.addEventListener('DOMContentLoaded', navigate);

  // ── Expose router ──
  window.Router = { navigate };

})();
