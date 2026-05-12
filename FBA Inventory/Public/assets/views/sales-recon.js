/* ====================================================
   Sales Recon View
   API: /api/sales-recon/settlement-rollup
   ==================================================== */
(function () {
  const API = location.origin + '/api';
  // -- Tooltip / escape helpers --
  function escH(s)    { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function escAttr(s) { return String(s||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
  function fmtDate(d) { if(!d)return null; var dt=new Date(d); if(isNaN(dt))return null; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}); }
  function fmtDateShort(d) { if(!d)return null; var dt=new Date(d); if(isNaN(dt))return null; return dt.toLocaleDateString('en-US',{month:'short',day:'numeric',year:'2-digit'}); }
  function dataTip(html, innerHtml, style) {
    var tip = escAttr(html);
    var st  = style ? ';' + style : '';
    return '<span data-tip="' + tip + '" onmouseover="showTip(event,this)" onmousemove="moveTip(event)" onmouseout="hideTip()" style="cursor:help' + st + '">' + innerHtml + '</span>';
  }
  function htip(visibleHtml, tooltipHtml) {
    return '<div class="htip">' + visibleHtml + '<div class="htip-box">' + tooltipHtml + '</div></div>';
  }

  let ordersData = [], refundsData = [];
  let ordersFiltered = [], refundsFiltered = [];
  let activeTab = 'orders';
  let searchQ = '';

  const _timers = {};
  function debounce(fn, ms) {
    return function () { clearTimeout(_timers[fn]); _timers[fn] = setTimeout(fn, ms); };
  }

  function fn(v) { const n = parseInt(v); return isNaN(n) ? '—' : n.toLocaleString(); }
  function fm(v) { const n = parseFloat(v); return isNaN(n) || n === 0 ? '—' : '$' + n.toFixed(2); }
  function fmSigned(v) {
    const n = parseFloat(v || 0);
    if (!n) return '<span style="color:var(--text3)">—</span>';
    const color = n < 0 ? 'var(--red)' : 'var(--green)';
    return '<span style="color:' + color + ';font-weight:600">$' + Math.abs(n).toFixed(2) + '</span>';
  }

  function skuRender(v, r) {
    const via       = r.via || r.shipment_id || '';
    const shipDate  = r.ship_date ? fmtDate(r.ship_date) : null;
    const settIds   = Array.isArray(r.settlement_ids)
                        ? r.settlement_ids.filter(Boolean).join(', ')
                        : (r.settlement_ids || '');
    const tip = (via      ? '<b>Shipment:</b> '    + escH(via) + '<br>'    : '')
              + (shipDate ? '<b>Ship Date:</b> '   + shipDate  + '<br>'    : '')
              + (settIds  ? '<b>Settlements:</b> ' + escH(settIds)         : '');
    const inner =
      '<div style="font-weight:600;font-size:12px;color:var(--accent);font-family:monospace">' + escH(v || '—') + '</div>'
      + (r.title
          ? '<div style="font-size:10px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(r.title) + '">' + escH(r.title) + '</div>'
          : '');
    return tip ? dataTip(tip, inner, 'cursor:help;display:block') : inner;
  }

  const COLUMNS = [
    { key: 'order_id',      label: 'Order ID',      width: 160 },
    { key: 'sku_norm',      label: 'SKU',            width: 160, render: skuRender },
    { key: 'qty',           label: 'Qty',            width: 60,  numeric: true, render: v => fn(v) },
    { key: 'sales_amount',  label: 'Sales',          width: 90,  numeric: true, render: fmSigned },
    { key: 'fba_fees',      label: 'FBA Fees',       width: 90,  numeric: true, render: fmSigned },
    { key: 'fba_commission',label: 'Commission',     width: 100, numeric: true, render: fmSigned },
    { key: 'variable_fee',  label: 'Variable Fee',   width: 100, numeric: true, render: fmSigned },
    { key: 'other_charges', label: 'Other',          width: 80,  numeric: true, render: fmSigned },
    { key: 'total_amount',  label: 'Net Total',      width: 100, numeric: true,
      render: v => {
        const n = parseFloat(v || 0);
        if (!n) return '<span style="color:var(--text3)">—</span>';
        const color = n < 0 ? 'var(--red)' : 'var(--green)';
        return '<b style="color:' + color + '">$' + Math.abs(n).toFixed(2) + '</b>';
      }
    },
    { key: 'settlement_ids', label: 'Settlements', width: 160,
      render: v => {
        const ids = Array.isArray(v) ? v.filter(Boolean) : (v ? String(v).split(',').map(s => s.trim()) : []);
        if (!ids.length) return '<span style="color:var(--text3)">—</span>';
        return '<span style="font-size:10px;font-family:monospace;color:var(--text2)">' + escH(ids.join(', ')) + '</span>';
      }
    },
  ];

  function applySearch(data) {
    if (!searchQ) return data;
    const q = searchQ.toLowerCase();
    return data.filter(r =>
      (r.order_id  || '').toLowerCase().includes(q) ||
      (r.sku_norm  || '').toLowerCase().includes(q)
    );
  }

  function updateKPIs(data, prefix) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    const totalQty   = data.reduce((s, r) => s + (parseInt(r.qty)            || 0), 0);
    const totalSales = data.reduce((s, r) => s + (parseFloat(r.sales_amount) || 0), 0);
    const totalNet   = data.reduce((s, r) => s + (parseFloat(r.total_amount) || 0), 0);
    const totalFees  = data.reduce((s, r) => s + (parseFloat(r.fba_fees)     || 0), 0);
    set(prefix + 'rows',  data.length.toLocaleString());
    set(prefix + 'qty',   totalQty.toLocaleString());
    set(prefix + 'sales', '$' + totalSales.toFixed(2));
    set(prefix + 'fees',  '$' + Math.abs(totalFees).toFixed(2));
    set(prefix + 'net',   '$' + totalNet.toFixed(2));
  }

  function renderTable(elId, data) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    if (!data.length) {
      el.innerHTML = '<div style="padding:48px;text-align:center;color:var(--text3)">No data found — <a href="#/upload?t=sales" style="color:var(--accent)">upload Settlement Report</a> to get started</div>';
      return;
    }
    window.VTable.create(el, {
      columns: COLUMNS,
      data,
      rowHeight: 44,
      exportable: true,
      columnToggle: true,
    });
  }

  async function loadData() {
    const el = document.getElementById('sr-orders-table');
    const el2 = document.getElementById('sr-refunds-table');
    if (el)  el.innerHTML  = '<div class="skeleton" style="height:200px;border-radius:8px"></div>';
    if (el2) el2.innerHTML = '<div class="skeleton" style="height:200px;border-radius:8px"></div>';

    try {
      const d = await fetch(`${API}/sales-recon/settlement-rollup`).then(r => r.json());
      ordersData  = d.orders  || [];
      refundsData = d.refunds || [];
      applyAndRender();
    } catch (e) {
      window.Toast?.show('Failed to load sales recon: ' + e.message, 'error');
      if (el)  el.innerHTML  = '<div style="padding:40px;text-align:center;color:var(--red)">' + e.message + '</div>';
      if (el2) el2.innerHTML = '';
    }
  }

  function applyAndRender() {
    ordersFiltered  = applySearch(ordersData);
    refundsFiltered = applySearch(refundsData);
    updateKPIs(ordersFiltered,  'k-ord-');
    updateKPIs(refundsFiltered, 'k-ref-');
    renderTable('sr-orders-table',  ordersFiltered);
    renderTable('sr-refunds-table', refundsFiltered);
  }

  function switchTab(t) {
    activeTab = t;
    document.getElementById('sr-pane-orders').style.display  = t === 'orders'  ? '' : 'none';
    document.getElementById('sr-pane-refunds').style.display = t === 'refunds' ? '' : 'none';
    document.querySelectorAll('.sr-tab').forEach(b => b.classList.remove('active'));
    document.getElementById('sr-tab-' + t)?.classList.add('active');
  }

  function kpiCard(idPrefix, label, color) {
    return `
      <div class="stat-card">
        <div class="stat-label">${label}</div>
        <div class="stat-value" id="${idPrefix}rows" style="color:${color}">—</div>
        <div class="stat-sub">
          <span id="${idPrefix}qty">—</span> units ·
          <b id="${idPrefix}sales">—</b> sales ·
          Net <b id="${idPrefix}net" style="color:var(--green)">—</b>
        </div>
      </div>`;
  }

  function render(container) {
    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Sales Recon</div>
          <div class="page-sub">Settlement-level order and refund reconciliation</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__srReconRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI row -->
      <div class="stat-grid" style="margin-bottom:16px">
        ${kpiCard('k-ord-',  'Orders',  'var(--green)')}
        ${kpiCard('k-ref-',  'Refunds', 'var(--red)')}
      </div>

      <!-- Search + tabs -->
      <div style="display:flex;gap:10px;align-items:flex-end;margin-bottom:14px">
        <div style="flex:1;min-width:220px">
          <div class="text-sm text-muted" style="margin-bottom:3px">Search Order ID / SKU</div>
          <input id="sr-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__srReconDb()">
        </div>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-outline sr-tab active" id="sr-tab-orders"  onclick="window.__srReconSwitch('orders')">Orders</button>
          <button class="btn btn-sm btn-outline sr-tab"        id="sr-tab-refunds" onclick="window.__srReconSwitch('refunds')">Refunds</button>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__srReconClear()">✕ Clear</button>
      </div>

      <!-- ORDERS pane -->
      <div id="sr-pane-orders">
        <div class="card">
          <div class="card-header"><span>Orders — by Order ID + SKU</span></div>
          <div style="padding:12px" id="sr-orders-table">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- REFUNDS pane -->
      <div id="sr-pane-refunds" style="display:none">
        <div class="card">
          <div class="card-header"><span>Refunds — by Order ID + SKU</span></div>
          <div style="padding:12px" id="sr-refunds-table">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    window.__srReconRefresh = loadData;
    window.__srReconSwitch  = switchTab;
    window.__srReconDb      = debounce(() => {
      searchQ = (document.getElementById('sr-search')?.value || '').trim();
      applyAndRender();
    }, 350);
    window.__srReconClear = () => {
      const el = document.getElementById('sr-search');
      if (el) el.value = '';
      searchQ = '';
      applyAndRender();
    };

    loadData();
  }

  function refresh() { loadData(); }

  window.__viewExport = { render, refresh };
})();
