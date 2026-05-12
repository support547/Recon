/* ====================================================
   Replacement Recon View
   APIs: /replacement-analysis, /case-reimb-summary,
         /manual-adjustments, /replacements-log
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

  let data = [], filteredData = [], logData = [];
  let caseOverlayMap = {}, adjOverlayMap = {};
  let activeTab = 'summary';
  let colFilters = {};
  const COL_TOTALS = [
    { key: 'quantity'      },
    { key: 'return_qty'    },
    { key: 'reimb_qty'     },
    { key: 'reimb_amount',  currency: true },
    { key: 'refund_qty'    },
    { key: 'refund_amount', currency: true },
  ];

  function updateColTotals() {
    COL_TOTALS.forEach(col => {
      const el = document.getElementById('ct-' + col.key);
      if (!el) return;
      const total = filteredData.reduce((s, r) => s + (col.currency ? (parseFloat(r[col.key]) || 0) : (parseInt(r[col.key]) || 0)), 0);
      el.textContent = col.currency
        ? ((total >= 0 ? '+' : '') + '$' + total.toFixed(2))
        : ((total >= 0 ? '+' : '') + total.toLocaleString());
      el.classList.toggle('active', !!colFilters[col.key]);
      el.onclick = () => toggleColFilter(col.key);
    });
  }

  function toggleColFilter(key) {
    if (colFilters[key]) delete colFilters[key];
    else colFilters[key] = true;
    filterAndRender();
  }

  const _timers = {};
  function debounce(fn, ms) {
    return function () { clearTimeout(_timers[fn]); _timers[fn] = setTimeout(fn, ms); };
  }

  function fd(v) { return v ? String(v).split('T')[0] : '—'; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '—' : n.toLocaleString(); }
  function fm(v) { const n = parseFloat(v); return isNaN(n) || n === 0 ? '—' : '$' + n.toFixed(2); }

  // -- Overlays --
  async function loadCaseOverlay() {
    try {
      const d = await fetch(`${API}/case-reimb-summary?recon_type=replacement`).then(r => r.json());
      caseOverlayMap = {};
      (d.rows || []).forEach(c => {
        const k = (c.msku || '').trim(); if (!k) return;
        if (!caseOverlayMap[k]) caseOverlayMap[k] = { total_claimed: 0, total_approved: 0, total_amount: 0, case_count: 0, top_status: null };
        const ac = caseOverlayMap[k];
        ac.total_claimed  += parseInt(c.total_claimed) || 0;
        ac.total_approved += parseInt(c.total_approved) || 0;
        ac.total_amount   += parseFloat(c.total_amount) || 0;
        ac.case_count     += parseInt(c.case_count) || 0;
        const pri = { resolved: 5, approved: 4, raised: 3, pending: 2, rejected: 1, closed: 0 };
        if (!ac.top_status || (pri[c.top_status] || 0) > (pri[ac.top_status] || 0)) ac.top_status = c.top_status;
      });
    } catch (e) { console.warn('caseOverlay:', e); }
  }

  async function loadAdjOverlay() {
    try {
      const d = await fetch(`${API}/manual-adjustments?recon_type=replacement`).then(r => r.json());
      adjOverlayMap = {};
      (d.rows || []).forEach(a => {
        const k = (a.msku || '').trim(); if (!k) return;
        if (!adjOverlayMap[k]) adjOverlayMap[k] = { qty: 0, count: 0 };
        adjOverlayMap[k].qty   += parseInt(a.qty_adjusted) || 0;
        adjOverlayMap[k].count += 1;
      });
    } catch (e) { console.warn('adjOverlay:', e); }
  }

  function caseOverlayForRow(r) { return caseOverlayMap[(r.msku || '').trim()] || {}; }
  function adjOverlayForRow(r)  { return adjOverlayMap[(r.msku || '').trim()]  || {}; }

  function displayStatus(r) {
    const co = caseOverlayForRow(r);
    const ao = adjOverlayForRow(r);
    const qty    = parseInt(r.quantity || 0);
    const rQty   = parseInt(r.return_qty || 0);
    const riQty  = parseInt(r.reimb_qty  || 0);
    const riAmt  = parseFloat(r.reimb_amount || 0);
    const caseApprQty = parseInt(co.total_approved || 0);
    const caseAmt     = parseFloat(co.total_amount || 0);
    const adjCount    = parseInt((ao || {}).count || 0);
    if (rQty >= qty) return 'returned';
    if (riQty > 0 || riAmt > 0 || caseApprQty >= qty || caseAmt > 0) return 'reimbursed';
    if (adjCount > 0) return 'adjustment';
    if (co.case_count > 0) {
      const ts = String(co.top_status || '').toLowerCase();
      if (ts === 'resolved') return 'resolved';
      return 'case-raised';
    }
    return 'take-action';
  }

  function statusBadge(status) {
    const map = {
      'returned':   ['badge-green',  'Returned'],
      'reimbursed': ['badge-green',  'Reimbursed'],
      'resolved':   ['badge-blue',   'Resolved'],
      'partial':    ['badge-orange', 'Partial'],
      'case-raised':['badge-orange', 'Case Raised'],
      'adjustment': ['badge-blue',   'Adjustment'],
      'take-action':['badge-red',    'Take Action'],
    };
    const [cls, label] = map[status] || ['badge-gray', status || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  // -- Analysis --
  async function loadData() {
    const p = new URLSearchParams();
    const sr = document.getElementById('f-search')?.value; if (sr) p.set('search', sr);
    const fr = document.getElementById('f-from')?.value;   if (fr) p.set('from', fr);
    const to = document.getElementById('f-to')?.value;     if (to) p.set('to', to);

    const el = document.getElementById('repl-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;

    try {
      const [d] = await Promise.all([
        fetch(`${API}/replacement-analysis${p.toString() ? '?' + p : ''}`).then(r => r.json()),
        loadCaseOverlay(),
        loadAdjOverlay(),
      ]);
      data = d.rows || [];

      // KPI aggregation
      let totalQty = 0, retRows = 0, retQty = 0, reimbRows = 0, reimbQty = 0, reimbAmt = 0;
      let actionRows = 0, actionQty = 0, caseRows = 0, caseQty = 0;

      data.forEach(r => {
        const qty = parseInt(r.quantity || 0);
        const s   = displayStatus(r);
        const co  = caseOverlayForRow(r);
        totalQty += qty;
        if (s === 'returned')   { retRows++; retQty += parseInt(r.return_qty || 0); }
        if (s === 'reimbursed') { reimbRows++; reimbQty += Math.max(parseInt(r.reimb_qty || 0), parseInt(co.total_approved || 0)); reimbAmt += Math.max(parseFloat(r.reimb_amount || 0), parseFloat(co.total_amount || 0)); }
        if (s === 'take-action') { actionRows++; actionQty += qty; }
        if (s === 'case-raised') { caseRows++; caseQty += qty; }
      });

      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('k-total-rows',   data.length.toLocaleString());
      set('k-total-qty',    totalQty.toLocaleString());
      set('k-ret-rows',     retRows.toLocaleString());
      set('k-ret-qty',      retQty.toLocaleString());
      set('k-reimb-rows',   reimbRows.toLocaleString());
      set('k-reimb-qty',    reimbQty.toLocaleString());
      set('k-reimb-amt',    '$' + reimbAmt.toFixed(2));
      set('k-action-rows',  actionRows.toLocaleString());
      set('k-action-qty',   actionQty.toLocaleString());
      set('k-case-rows',    caseRows.toLocaleString());
      set('k-case-qty',     caseQty.toLocaleString());

      colFilters = {};
      filterAndRender();
    } catch (e) {
      window.Toast?.show('Failed to load replacements: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function filterAndRender() {
    const sf = document.getElementById('f-status')?.value || 'all';
    filteredData = sf === 'all' ? data.slice() : data.filter(r => displayStatus(r) === sf);
    Object.keys(colFilters).forEach(key => {
      const isAmt = key === 'reimb_amount' || key === 'refund_amount';
      filteredData = filteredData.filter(r =>
        (isAmt ? (parseFloat(r[key]) || 0) : (parseInt(r[key]) || 0)) !== 0
      );
    });
    renderTable();
  }

  function renderTable() {
    const el = document.getElementById('repl-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!filteredData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        <p>No replacement data — <a href="#/upload?t=replacements" style="color:var(--accent)">upload Replacements</a> to get started</p>
      </div>`;
      return;
    }
    const tableData = filteredData.map(r => ({
      ...r,
      _status: displayStatus(r),   // raw key — rendered via htip in column def
    }));
    window.VTable.create(el, {
      columns: [
        { key: 'sale_date',             label: 'Date',              width: 100, render: v => fd(v) },
        { key: 'msku',                  label: 'MSKU',              width: 140 },
        { key: 'asin',                  label: 'ASIN',              width: 110 },
        { key: 'quantity',              label: 'Repl. Qty',         width: 80, numeric: true, render: v => fn(v) },
        { key: 'reason_code',           label: 'Reason Code',       width: 130 },
        { key: 'replacement_order_id',  label: 'Repl. Order ID',    width: 150 },
        { key: 'original_order_id',     label: 'Orig. Order ID',    width: 150 },
        { key: 'return_qty', label: 'Return Qty', width: 80, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            if (!qty) return '<span style="color:var(--text3)">?</span>';
            let details = r.return_details;
            if (typeof details === 'string') { try { details = JSON.parse(details); } catch (e) { details = []; } }
            const tipRows = Array.isArray(details) ? details.map(d =>
              '<div class="htip-row"><span class="htip-lbl">' + escH(d.status || '?') + '</span>'
              + '<span class="htip-val">Qty ' + (d.qty || 0) + (d.reason ? ' � ' + escH(d.reason) : '') + '</span></div>'
            ).join('') : '';
            return htip(
              '<b style="color:#f59e0b">' + qty + '</b>',
              '<div class="htip-row"><span class="htip-lbl">Returns</span><span class="htip-val">' + qty + ' units</span></div>' + tipRows
            );
          }
        },
        { key: 'reimb_qty',    label: 'Reimb. Qty', width: 80, numeric: true, render: v => fn(v) },
        { key: 'reimb_amount', label: 'Reimb. $',   width: 80, numeric: true, render: v => fm(v) },
        { key: 'refund_qty',   label: 'Refund Qty', width: 80, numeric: true, render: v => fn(v) },
        { key: 'refund_amount',label: 'Refund $',   width: 80, numeric: true, render: v => fm(v) },
        { key: '_status', label: 'Status', width: 130, sortable: false,
          render: (v, r) => {
            const colorMap = {
              'returned':    '#10b981', 'reimbursed': '#10b981', 'resolved':   '#3b82f6',
              'adjustment':  '#3b82f6', 'partial':    '#f59e0b', 'case-raised':'#f59e0b',
              'take-action': '#ef4444',
            };
            const labelMap = {
              'returned':    'Returned',    'reimbursed': 'Reimbursed', 'resolved':   'Resolved',
              'adjustment':  'Adjustment',  'partial':    'Partial',    'case-raised':'Case Raised',
              'take-action': 'Take Action',
            };
            const color = colorMap[v] || '#94a3b8';
            const label = labelMap[v]  || escH(v || '?');
            const badge = '<span style="color:' + color + ';font-weight:700">' + label + '</span>';
            const tipHtml =
              '<div class="htip-row"><span class="htip-lbl">Status</span><span class="htip-val" style="color:' + color + '">' + label + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Replaced Out</span><span class="htip-val" style="color:#ef4444">'  + (r.quantity     || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Returns</span><span class="htip-val" style="color:#10b981">'       + (r.return_qty   || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Reimb Qty</span><span class="htip-val">'                          + (r.reimb_qty    || 0) + '</span></div>'
              + (parseFloat(r.reimb_amount || 0)
                  ? '<div class="htip-row"><span class="htip-lbl">Reimb Amt</span><span class="htip-val" style="color:#10b981">$' + parseFloat(r.reimb_amount).toFixed(2) + '</span></div>'
                  : '');
            return htip(badge, tipHtml);
          }
        },
      ],
      data: tableData,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Log --
  async function loadLog() {
    const p = new URLSearchParams();
    const sr = document.getElementById('fl-search')?.value; if (sr) p.set('search', sr);
    const fr = document.getElementById('fl-from')?.value;   if (fr) p.set('from', fr);
    const to = document.getElementById('fl-to')?.value;     if (to) p.set('to', to);
    const fc = document.getElementById('fl-fc')?.value;     if (fc) p.set('fc', fc);

    const el = document.getElementById('log-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/replacements-log${p.toString() ? '?' + p : ''}`).then(r => r.json());
      logData = d.rows || [];
      renderLogTable();
    } catch (e) {
      window.Toast?.show('Failed to load replacements log: ' + e.message, 'error');
    }
  }

  function renderLogTable() {
    const el = document.getElementById('log-vtable');
    if (!el) return;
    el.innerHTML = '';
    window.VTable.create(el, {
      columns: [
        { key: 'shipment_date',        label: 'Shipment Date',    width: 110, render: v => fd(v) },
        { key: 'msku',                 label: 'MSKU',             width: 140 },
        { key: 'asin',                 label: 'ASIN',             width: 110 },
        { key: 'quantity',             label: 'Qty',              width: 60, numeric: true, render: v => fn(v) },
        { key: 'fc',                   label: 'FC',               width: 70 },
        { key: 'original_fc',          label: 'Original FC',      width: 90 },
        { key: 'reason_code',          label: 'Reason Code',      width: 130 },
        { key: 'replacement_order_id', label: 'Repl. Order ID',   width: 150 },
        { key: 'original_order_id',    label: 'Orig. Order ID',   width: 150 },
      ],
      data: logData,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  function switchTab(t) {
    activeTab = t;
    document.getElementById('pane-summary').style.display = t === 'summary' ? '' : 'none';
    document.getElementById('pane-log').style.display     = t === 'log'     ? '' : 'none';
    document.querySelectorAll('.repl-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`rtab-${t}`)?.classList.add('active');
    if (t === 'log' && !logData.length) loadLog();
  }

  // -- Render --
  function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Replacement Recon</div>
          <div class="page-sub">Replacement order analysis ? tracking returned and reimbursed replacements</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__replRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI Stats -->
      <div class="stat-grid" style="margin-bottom:10px">
        <div class="stat-card">
          <div class="stat-label">Total Rows</div>
          <div class="stat-value" id="k-total-rows" style="color:var(--accent)">?</div>
          <div class="stat-sub"><span id="k-total-qty">?</span> units</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Returned</div>
          <div class="stat-value" id="k-ret-rows" style="color:var(--green)">?</div>
          <div class="stat-sub"><span id="k-ret-qty">?</span> units returned</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Reimbursed</div>
          <div class="stat-value" id="k-reimb-rows" style="color:var(--green)">?</div>
          <div class="stat-sub"><span id="k-reimb-qty">?</span> qty ? <b id="k-reimb-amt">?</b></div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Take Action</div>
          <div class="stat-value" id="k-action-rows" style="color:var(--red)">—</div>
          <div class="stat-sub"><span id="k-action-qty">—</span> units</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Case Raised</div>
          <div class="stat-value" id="k-case-rows" style="color:var(--orange)">—</div>
          <div class="stat-sub"><span id="k-case-qty">—</span> units</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-sm btn-outline repl-tab active" id="rtab-summary" onclick="window.__replSwitch('summary')">Replacement Analysis</button>
        <button class="btn btn-sm btn-outline repl-tab"        id="rtab-log"     onclick="window.__replSwitch('log')">Replacement Log</button>
      </div>

      <!-- ANALYSIS TAB -->
      <div id="pane-summary">
        <div class="filter-bar" style="margin-bottom:14px">
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / Order ID</div>
            <input id="f-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__replDbLoad()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="f-from" value="${d30}" style="height:32px" onchange="window.__replLoad()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="f-to" value="${today}" style="height:32px" onchange="window.__replLoad()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Status</div>
            <select id="f-status" style="height:32px;min-width:150px" onchange="window.__replFilter()">
              <option value="all">All Statuses</option>
              <option value="take-action">Take Action</option>
              <option value="case-raised">Case Raised</option>
              <option value="adjustment">Adjustment</option>
              <option value="partial">Partial</option>
              <option value="returned">Returned</option>
              <option value="reimbursed">Reimbursed</option>
              <option value="resolved">Resolved</option>
            </select>
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__replClear()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>Replacement Analysis — Order Level</span></div>
          <div style="padding:12px" id="repl-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- LOG TAB -->
      <div id="pane-log" style="display:none">
        <div class="filter-bar" style="margin-bottom:14px">
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / Order ID</div>
            <input id="fl-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__replDbLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="fl-from" value="${d30}" style="height:32px" onchange="window.__replLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="fl-to" value="${today}" style="height:32px" onchange="window.__replLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">FC</div>
            <input id="fl-fc" placeholder="e.g. RDG1" style="height:32px;width:80px" oninput="window.__replDbLog()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__replClearLog()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>All Replacement Records</span></div>
          <div style="padding:12px" id="log-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const replV = document.getElementById('repl-vtable');
    if (replV && !replV._replVtableTotalsBound) {
      replV._replVtableTotalsBound = true;
      replV.addEventListener('vtable:rendered', updateColTotals);
    }

    window.__replRefresh  = () => { loadData(); if (activeTab === 'log') loadLog(); };
    window.__replSwitch   = switchTab;
    window.__replLoad     = loadData;
    window.__replFilter   = filterAndRender;
    window.__replLoadLog  = loadLog;
    window.__replDbLoad   = debounce(loadData, 400);
    window.__replDbLog    = debounce(loadLog, 400);
    window.__replClear    = () => {
      ['f-search','f-status'].forEach(id => { const e = document.getElementById(id); if (e) e.value = id === 'f-status' ? 'all' : ''; });
      document.getElementById('f-from').value = d30;
      document.getElementById('f-to').value = today;
      loadData();
    };
    window.__replClearLog = () => {
      ['fl-search','fl-fc'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      document.getElementById('fl-from').value = d30;
      document.getElementById('fl-to').value = today;
      loadLog();
    };

    loadData();
  }

  function refresh() {
    if (activeTab === 'summary') loadData();
    else loadLog();
  }

  window.__viewExport = { render, refresh };
})();
