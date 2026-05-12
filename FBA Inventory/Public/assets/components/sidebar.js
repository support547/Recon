/* ====================================================
   Sidebar — renders into #app-sidebar
   ==================================================== */

(function () {
  const NAV = [
    {
      section: 'DATA',
      items: [
        {
          type: 'group',
          label: 'Upload Reports',
          icon: 'upload-cloud',
          key: 'upload-group',
          children: [
            { label: 'Shipped to FBA',       icon: 'truck',         href: '#/upload?t=shipped' },
            { label: 'Sales Data',            icon: 'bar-chart-2',   href: '#/upload?t=sales' },
            { label: 'FBA Receipts',          icon: 'package',       href: '#/upload?t=receipts' },
            { label: 'Customer Returns',      icon: 'rotate-ccw',    href: '#/upload?t=returns' },
            { label: 'Reimbursements',        icon: 'dollar-sign',   href: '#/upload?t=reimbursements' },
            { label: 'FC Transfers',          icon: 'arrow-right-left', href: '#/upload?t=fctransfer' },
            { label: 'Replacements',          icon: 'refresh-cw',    href: '#/upload?t=replacements' },
            { label: 'Grade & Resell',        icon: 'tag',           href: '#/upload?t=gnr' },
            { label: 'Removals',              icon: 'trash-2',       href: '#/upload?t=removals' },
            { label: 'Removal Shipments',     icon: 'send',          href: '#/upload?t=removal-shipments' },
            { label: 'Shipment Receiving',    icon: 'inbox',         href: '#/upload?t=shipment-receiving' },
            { label: 'FBA Summary',           icon: 'layout-grid',   href: '#/upload?t=fbasummary' },
            { label: 'Payment Repository',    icon: 'credit-card',   href: '#/upload?t=payment-repository' },
            { label: 'Settlement Report',     icon: 'file-text',     href: '#/upload?t=settlement-report' },
          ]
        }
      ]
    },
    {
      section: 'OVERVIEW',
      items: [
        { label: 'Dashboard', icon: 'layout-dashboard', href: '#/dashboard' }
      ]
    },
    {
      section: 'RECONCILIATION',
      items: [
        {
          type: 'group',
          label: 'Reconciliation',
          icon: 'git-compare',
          key: 'recon-group',
          children: [
            { label: 'Shipment Recon',       icon: 'ship',          href: '#/shipment-recon' },
            { label: 'Removal Recon',        icon: 'trash-2',       href: '#/removal-recon' },
            { label: 'Returns Recon',        icon: 'corner-down-left', href: '#/returns-recon' },
            { label: 'Replacement Recon',    icon: 'refresh-cw',    href: '#/replacement-recon' },
            { label: 'FC Transfer Recon',    icon: 'arrow-right-left', href: '#/fc-transfer-recon' },
            { label: 'Grade & Resell',       icon: 'tag',           href: '#/grade-resell' },
            { label: 'GNR Recon',            icon: 'clipboard-list', href: '#/gnr-recon' },
            { label: 'Full Inventory Recon', icon: 'database',      href: '#/full-recon' },
          ]
        }
      ]
    },
    {
      section: 'FINANCIAL ANALYSIS',
      items: [
        {
          type: 'group',
          label: 'Financial Analysis',
          icon: 'trending-up',
          key: 'finance-group',
          children: [
            { label: 'Sales Recon',          icon: 'bar-chart-2',   href: '#/sales-recon' },
            { label: 'Sales Orders',         icon: 'shopping-cart', href: '#/sales-orders' },
            { label: 'Sales Again Purchase', icon: 'repeat',        href: '#/sales-again-purchase' },
            { label: 'Sales Analysis',       icon: 'pie-chart',     href: '#/sales-analysis' },
            { label: 'Return Analysis',      icon: 'undo-2',        href: '#/return-analysis' },
            { label: 'Profit Analysis',      icon: 'activity',      href: '#/profit-analysis' },
          ]
        }
      ]
    },
    {
      section: null,
      items: [
        { type: 'sep' },
        { label: 'Cases & Adjustments', icon: 'alert-circle', href: '#/cases-adjustments' },
        { label: 'Reports',             icon: 'file-bar-chart', href: '#/reports' },
      ]
    }
  ];

  // ── State ──
  let collapsed = localStorage.getItem('sb_collapsed') === 'true';
  let groupStates = JSON.parse(localStorage.getItem('sb_groups') || '{}');
  let dbStatus = 'unknown'; // 'connected' | 'error' | 'unknown'

  function icon(name, size = 16) {
    // Lucide UMD: use data-lucide placeholders; createIcons() swaps to SVG
    const s = Number(size) || 16;
    return `<i data-lucide="${name}" class="sb-lucide" style="width:${s}px;height:${s}px" aria-hidden="true"></i>`;
  }

  function currentRoute() {
    return window.location.hash.split('?')[0] || '#/dashboard';
  }

  function isActive(href) {
    const route = currentRoute();
    const hrefBase = href.split('?')[0];
    if (href.includes('?')) {
      return window.location.hash === href;
    }
    return route === hrefBase;
  }

  function saveGroups() {
    localStorage.setItem('sb_groups', JSON.stringify(groupStates));
  }

  function buildSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;

    try {
    if (collapsed) sidebar.classList.add('collapsed');
    else sidebar.classList.remove('collapsed');

    sidebar.innerHTML = '';

    const inner = document.createElement('div');
    inner.className = 'sb-inner';

    // ── Brand ──
    const brand = document.createElement('div');
    brand.className = 'sb-brand';
    brand.innerHTML = `
      <div class="sb-brand-icon">${icon('box', 18)}</div>
      <div class="sb-brand-text">
        <div class="sb-brand-title">InvenSync</div>
        <div class="sb-brand-sub">Amazon ERP</div>
      </div>
      <button class="sb-collapse-btn" id="sb-collapse-btn" title="Collapse sidebar">
        ${icon('chevron-left', 16)}
      </button>
    `;
    inner.appendChild(brand);

    // ── Nav ──
    const nav = document.createElement('nav');
    nav.className = 'sb-nav';

    for (const section of NAV) {
      if (section.section) {
        const lbl = document.createElement('div');
        lbl.className = 'sb-section-label';
        lbl.textContent = section.section;
        nav.appendChild(lbl);
      }

      for (const item of section.items) {
        if (item.type === 'sep') {
          const sep = document.createElement('div');
          sep.className = 'sb-sep';
          nav.appendChild(sep);
          continue;
        }

        if (item.type === 'group') {
          // Group toggle
          const isOpen = groupStates[item.key] !== false; // default open
          const toggle = document.createElement('button');
          toggle.className = `sb-group-toggle ${isOpen ? 'open' : ''}`;
          toggle.dataset.key = item.key;
          toggle.innerHTML = `
            <span class="sb-icon">${icon(item.icon, 16)}</span>
            <span class="sb-label">${item.label}</span>
            <span class="sb-chevron">${icon('chevron-right', 14)}</span>
          `;

          const children = document.createElement('div');
          children.className = `sb-group-items ${isOpen ? 'open' : ''}`;

          for (const child of item.children) {
            const a = document.createElement('a');
            a.className = `sb-item ${isActive(child.href) ? 'active' : ''}`;
            a.href = child.href;
            a.innerHTML = `
              <span class="sb-icon">${icon(child.icon, 14)}</span>
              <span class="sb-label">${child.label}</span>
            `;
            a.addEventListener('click', () => {
              setTimeout(() => updateActive(), 50);
            });
            children.appendChild(a);
          }

          toggle.addEventListener('click', () => {
            const nowOpen = !toggle.classList.contains('open');
            groupStates[item.key] = nowOpen;
            saveGroups();
            toggle.classList.toggle('open', nowOpen);
            children.classList.toggle('open', nowOpen);
          });

          nav.appendChild(toggle);
          nav.appendChild(children);
        } else {
          // Regular nav item
          const a = document.createElement('a');
          a.className = `sb-item ${isActive(item.href) ? 'active' : ''}`;
          a.href = item.href;
          a.innerHTML = `
            <span class="sb-icon">${icon(item.icon, 16)}</span>
            <span class="sb-label">${item.label}</span>
          `;
          a.addEventListener('click', () => {
            setTimeout(() => updateActive(), 50);
          });
          nav.appendChild(a);
        }
      }
    }

    inner.appendChild(nav);

    // ── Footer ──
    const footer = document.createElement('div');
    footer.className = 'sb-footer';
    footer.id = 'sb-footer';
    footer.innerHTML = `
      <span class="sb-dot" id="sb-dot"></span>
      <span class="sb-footer-text" id="sb-status">Checking DB…</span>
    `;
    inner.appendChild(footer);

    sidebar.appendChild(inner);

    // ── Collapse button ──
    document.getElementById('sb-collapse-btn')?.addEventListener('click', toggleCollapse);

    // ── Lucide UMD: hydrate <i data-lucide="…"> (whole doc — safe after sidebar DOM exists) ──
    try {
      if (window.lucide && typeof window.lucide.createIcons === 'function') {
        window.lucide.createIcons();
      }
    } catch (e) {
      console.warn('[Sidebar] Lucide icons:', e);
    }

    // ── DB health check ──
    checkDbHealth();
    } catch (err) {
      console.error('[Sidebar] buildSidebar failed:', err);
      sidebar.innerHTML = `<div class="sb-inner" style="padding:16px;color:rgba(255,255,255,.85);font-size:12px">
        <strong>InvenSync</strong><p style="margin:8px 0 0;opacity:.8">Sidebar failed to load. Check the console.</p>
        <a href="#/dashboard" style="color:var(--accent,#60a5fa)">Dashboard</a>
      </div>`;
      checkDbHealth();
    }
  }

  function updateActive() {
    const sidebar = document.getElementById('app-sidebar');
    if (!sidebar) return;
    sidebar.querySelectorAll('.sb-item').forEach(a => {
      const href = a.getAttribute('href') || '';
      a.classList.toggle('active', isActive(href));
    });
  }

  function toggleCollapse() {
    collapsed = !collapsed;
    localStorage.setItem('sb_collapsed', collapsed);
    const sidebar = document.getElementById('app-sidebar');
    sidebar.classList.toggle('collapsed', collapsed);
  }

  async function checkDbHealth() {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      const ok = data.status === 'ok' || data.db === 'connected' || res.ok;
      dbStatus = ok ? 'connected' : 'error';
    } catch {
      dbStatus = 'error';
    }
    const dot = document.getElementById('sb-dot');
    const txt = document.getElementById('sb-status');
    if (dot && txt) {
      dot.className = `sb-dot ${dbStatus === 'connected' ? 'connected' : 'error'}`;
      txt.textContent = dbStatus === 'connected' ? 'DB Connected' : 'DB Error';
    }
  }

  // ── Public API ──
  window.Sidebar = {
    init: buildSidebar,
    updateActive,
  };

  // Auto-init on DOMContentLoaded
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', buildSidebar);
  } else {
    buildSidebar();
  }
})();
