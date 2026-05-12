/* ====================================================
   Returns Recon View
   APIs: /returns-recon, /case-reimb-summary, /manual-adjustments, /returns-log
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

  let analysisData = [], logData = [];
  let analysisFiltered = [];
  let caseOverlayMap = {}, adjOverlayMap = {};
  let activeTab = 'analysis';
  let colFilters = {};
  const COL_TOTALS = [
    { key: 'total_returned' },
    { key: 'event_count'    },
    { key: 'reimb_qty'      },
    { key: 'reimb_amount',   currency: true },
  ];

  function updateColTotals() {
    COL_TOTALS.forEach(col => {
      const el = document.getElementById('ct-' + col.key);
      if (!el) return;
      const total = analysisFiltered.reduce((s, r) => s + (col.currency ? (parseFloat(r[col.key]) || 0) : (parseInt(r[col.key]) || 0)), 0);
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
    renderAnalysisTable();
  }

  const _timers = {};
  function debounce(fn, ms) {
    return function () { clearTimeout(_timers[fn]); _timers[fn] = setTimeout(fn, ms); };
  }

  function fd(v) { return v ? String(v).split('T')[0] : '—'; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '—' : n.toLocaleString(); }
  function fm(v) { const n = parseFloat(v); return isNaN(n) || n === 0 ? '—' : '$' + n.toFixed(2); }

  function fnskuStatusBadge(s) {
    if (s === 'Matched FNSKU')   return `<span class="badge badge-green">Matched</span>`;
    if (s === 'FNSKU Mismatch')  return `<span class="badge badge-red">Mismatch</span>`;
    if (s === 'Order Not Found') return `<span class="badge badge-orange">Not Found</span>`;
    return `<span class="badge badge-gray">${s || '—'}</span>`;
  }

  function caseStatusBadge(s) {
    if (!s) return '—';
    const m = { resolved: 'badge-green', approved: 'badge-green', raised: 'badge-orange', pending: 'badge-orange', rejected: 'badge-red' };
    return `<span class="badge ${m[s.toLowerCase()] || 'badge-gray'}">${s}</span>`;
  }

  // -- Overlays --
  async function loadCaseOverlay() {
    try {
      const d = await fetch(`${API}/case-reimb-summary?recon_type=return`).then(r => r.json());
      caseOverlayMap = {};
      (d.rows || []).forEach(c => {
        const k = (c.msku || '').trim(); if (!k) return;
        if (!caseOverlayMap[k]) caseOverlayMap[k] = { total_claimed: 0, total_approved: 0, total_amount: 0, case_count: 0, top_status: null };
        const ac = caseOverlayMap[k];
        ac.total_claimed  += parseInt(c.total_claimed)  || 0;
        ac.total_approved += parseInt(c.total_approved) || 0;
        ac.total_amount   += parseFloat(c.total_amount) || 0;
        ac.case_count     += parseInt(c.case_count)     || 0;
        const pri = { resolved: 5, approved: 4, raised: 3, pending: 2, rejected: 1, closed: 0 };
        if (!ac.top_status || (pri[c.top_status] || 0) > (pri[ac.top_status] || 0)) ac.top_status = c.top_status;
      });
    } catch (e) { console.warn('caseOverlay:', e); }
  }

  async function loadAdjOverlay() {
    try {
      const d = await fetch(`${API}/manual-adjustments?recon_type=return`).then(r => r.json());
      adjOverlayMap = {};
      (d.rows || []).forEach(a => {
        const key = (a.order_id || '').trim() + '|' + (a.fnsku || '').trim();
        if (!adjOverlayMap[key]) adjOverlayMap[key] = { qty: 0, count: 0 };
        adjOverlayMap[key].qty   += parseInt(a.qty_adjusted) || 0;
        adjOverlayMap[key].count += 1;
      });
    } catch (e) { console.warn('adjOverlay:', e); }
  }

  // -- Analysis --
  async function loadAnalysis() {
    const p = new URLSearchParams();
    const fr = document.getElementById('a-from')?.value;
    const to = document.getElementById('a-to')?.value;
    const ds = document.getElementById('a-disp')?.value;
    const sr = document.getElementById('a-search')?.value;
    const fs = document.getElementById('a-fnsku-status')?.value;
    if (fr) p.set('from', fr); if (to) p.set('to', to);
    if (ds) p.set('disposition', ds); if (sr) p.set('search', sr); if (fs) p.set('fnsku_status', fs);

    const el = document.getElementById('ret-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;

    try {
      const d = await fetch(`${API}/returns-recon${p.toString() ? '?' + p : ''}`).then(r => r.json());
      analysisData = d.rows || [];
      const s = d.stats || {};

      // KPIs from server stats
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('k-total-skus', Number(s.total_rows || analysisData.length).toLocaleString());
      set('k-matched',    Number(s.matched  || 0).toLocaleString());
      set('k-mismatch',   Number(s.mismatch || 0).toLocaleString());
      set('k-not-found',  Number(s.not_found || 0).toLocaleString());
      set('k-reimb',      '$' + Number(s.total_reimb || 0).toFixed(2));
      set('k-cases',      Number(s.with_cases || 0).toLocaleString());

      // Per-row computed stats
      let matchedQty = 0, mismatchQty = 0, notFoundQty = 0, totalQty = 0;
      let reimbSkus = 0, reimbQty = 0, reimbAmtSkus = 0, sellableSkus = 0, sellableQty = 0;
      analysisData.forEach(r => {
        const qty = parseInt(r.total_returned || 0);
        totalQty += qty;
        if (r.fnsku_status === 'Matched FNSKU')   matchedQty  += qty;
        else if (r.fnsku_status === 'FNSKU Mismatch') mismatchQty += qty;
        else if (r.fnsku_status === 'Order Not Found') notFoundQty += qty;
        if (parseInt(r.reimb_qty || 0) > 0)  { reimbSkus++; reimbQty += parseInt(r.reimb_qty); }
        if (parseFloat(r.reimb_amount || 0) > 0) reimbAmtSkus++;
        if ((r.dispositions || '').toUpperCase().includes('SELLABLE')) { sellableSkus++; sellableQty += qty; }
      });
      set('k-qty',         totalQty.toLocaleString());
      set('k-matched-qty', matchedQty.toLocaleString());
      set('k-mismatch-qty', mismatchQty.toLocaleString());
      set('k-not-found-qty', notFoundQty.toLocaleString());
      set('k-reimb-skus',  reimbSkus.toLocaleString());
      set('k-reimb-qty',   reimbQty.toLocaleString());
      set('k-reimb-amt-skus', reimbAmtSkus.toLocaleString());
      set('k-sellable',    sellableSkus.toLocaleString());
      set('k-sellable-qty', sellableQty.toLocaleString());

      colFilters = {};
      renderAnalysisTable();
    } catch (e) {
      window.Toast?.show('Failed to load returns recon: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function renderAnalysisTable() {
    const el = document.getElementById('ret-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!analysisData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        <p>No returns data found — <a href="#/upload?t=returns" style="color:var(--accent)">upload Customer Returns</a> to get started</p>
      </div>`;
      return;
    }
    analysisFiltered = [...analysisData];
    Object.keys(colFilters).forEach(key => {
      const isAmt = key === 'reimb_amount';
      analysisFiltered = analysisFiltered.filter(r =>
        (isAmt ? (parseFloat(r[key]) || 0) : (parseInt(r[key]) || 0)) !== 0
      );
    });
    const data = analysisFiltered.map(r => {
      const co = caseOverlayMap[(r.msku || '').trim()] || {};
      return {
        ...r,
        _fnsku_badge: fnskuStatusBadge(r.fnsku_status),
        _case_badge:  caseStatusBadge(co.top_status || r.case_status),
        _date_range:  r.date_range || `${fd(r.min_date)} ? ${fd(r.max_date)}`,
      };
    });
    window.VTable.create(el, {
      columns: [
        { key: 'order_id',       label: 'Order ID',       width: 130 },
        { key: 'fnsku',          label: 'Return FNSKU',   width: 120 },
        { key: 'msku',           label: 'MSKU',           width: 140 },
        { key: 'asin',           label: 'ASIN',           width: 110 },
        { key: 'total_returned', label: 'Qty',            width: 60, numeric: true, render: v => fn(v) },
        { key: 'event_count',    label: 'Events',         width: 60, numeric: true, render: v => fn(v) },
        { key: 'dispositions',   label: 'Dispositions',   width: 130 },
        { key: 'return_reason',  label: 'Reasons',        width: 130 },
        { key: 'reimb_qty',    label: 'Reimb. Qty', width: 80, numeric: true, render: v => fn(v) },
        { key: 'reimb_amount', label: 'Reimb. $',   width: 90, numeric: true,
          render: (v, r) => {
            const amt = parseFloat(v || 0);
            if (!amt) return '<span style="color:var(--text3)">?</span>';
            const tipHtml =
              '<div class="htip-row"><span class="htip-lbl">Reimb Qty</span><span class="htip-val">'    + (r.reimb_qty || 0)                                          + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Reimb Amount</span><span class="htip-val" style="color:#10b981">$' + amt.toFixed(2) + '</span></div>';
            return htip('<span style="color:var(--green);font-weight:700;cursor:help">$' + amt.toFixed(2) + '</span>', tipHtml);
          }
        },
        { key: '_fnsku_badge',   label: 'FNSKU Status',   width: 130, sortable: false, render: v => v },
        { key: '_case_badge',    label: 'Case Status',    width: 110, sortable: false, render: v => v },
        { key: '_date_range',    label: 'Date Range',     width: 160 },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Log --
  async function loadLog() {
    const p = new URLSearchParams();
    const fr = document.getElementById('l-from')?.value;
    const to = document.getElementById('l-to')?.value;
    const ds = document.getElementById('l-disp')?.value;
    const sr = document.getElementById('l-search')?.value;
    if (fr) p.set('from', fr); if (to) p.set('to', to);
    if (ds) p.set('disposition', ds); if (sr) p.set('search', sr);

    const el = document.getElementById('log-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/returns-log${p.toString() ? '?' + p : ''}`).then(r => r.json());
      logData = d.rows || [];
      renderLogTable();
    } catch (e) {
      window.Toast?.show('Failed to load returns log: ' + e.message, 'error');
    }
  }

  function renderLogTable() {
    const el = document.getElementById('log-vtable');
    if (!el) return;
    el.innerHTML = '';
    window.VTable.create(el, {
      columns: [
        { key: 'return_date',   label: 'Return Date',  width: 100, render: v => fd(v) },
        { key: 'order_id',      label: 'Order ID',      width: 130 },
        { key: 'fnsku',         label: 'FNSKU',         width: 120 },
        { key: 'msku',          label: 'MSKU',          width: 140 },
        { key: 'asin',          label: 'ASIN',          width: 110 },
        { key: 'quantity',      label: 'Qty',           width: 60, numeric: true, render: v => fn(v) },
        { key: 'disposition',   label: 'Disposition',   width: 130 },
        { key: 'reason',        label: 'Reason',        width: 150 },
        { key: 'status',        label: 'Status',        width: 100,
          render: (v, r) => {
            const statColor = v === 'Reimbursed' ? '#10b981' : v === 'Pending' ? '#f59e0b' : v === 'Disposed' ? '#64748b' : '#94a3b8';
            const badge = '<span class="badge" style="background:' + statColor + '20;color:' + statColor + ';border:1px solid ' + statColor + '40">' + escH(v || '—') + '</span>';
            const tipHtml =
              '<div class="htip-row"><span class="htip-lbl">Status</span><span class="htip-val" style="color:' + statColor + '">' + escH(v || '—') + '</span></div>'
              + (r.disposition ? '<div class="htip-row"><span class="htip-lbl">Disposition</span><span class="htip-val">' + escH(r.disposition) + '</span></div>' : '')
              + (r.reason      ? '<div class="htip-row"><span class="htip-lbl">Reason</span><span class="htip-val">'      + escH(r.reason)      + '</span></div>' : '')
              + (r.order_id    ? '<div class="htip-sep"></div><div class="htip-row"><span class="htip-lbl">Order ID</span><span class="htip-val">' + escH(r.order_id) + '</span></div>' : '');
            return htip(badge, tipHtml);
          }
        },
      ],
      data: logData,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  function switchTab(t) {
    activeTab = t;
    document.getElementById('panel-analysis').style.display = t === 'analysis' ? '' : 'none';
    document.getElementById('panel-log').style.display      = t === 'log'      ? '' : 'none';
    document.querySelectorAll('.ret-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${t}`)?.classList.add('active');
    if (t === 'log' && !logData.length) loadLog();
  }

  // -- Render --
  function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Returns Recon</div>
          <div class="page-sub">Customer returns reconciliation — FNSKU matching and reimbursement tracking</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__retRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPIs Row 1: FNSKU matching -->
      <div class="stat-grid" style="margin-bottom:10px">
        <div class="stat-card">
          <div class="stat-label">Total Returns</div>
          <div class="stat-value" id="k-total-skus" style="color:var(--accent)">—</div>
          <div class="stat-sub"><span id="k-qty">—</span> units</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Matched FNSKU</div>
          <div class="stat-value" id="k-matched" style="color:var(--green)">—</div>
          <div class="stat-sub"><span id="k-matched-qty">—</span> units</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">FNSKU Mismatch</div>
          <div class="stat-value" id="k-mismatch" style="color:var(--red)">—</div>
          <div class="stat-sub"><span id="k-mismatch-qty">—</span> units</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Order Not Found</div>
          <div class="stat-value" id="k-not-found" style="color:var(--orange)">—</div>
          <div class="stat-sub"><span id="k-not-found-qty">—</span> units</div>
        </div>
      </div>
      <!-- KPIs Row 2: reimbursement -->
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Reimb. SKUs (qty)</div>
          <div class="stat-value" id="k-reimb-skus" style="color:var(--green)">—</div>
          <div class="stat-sub"><span id="k-reimb-qty">—</span> units</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Reimb. Amount</div>
          <div class="stat-value" id="k-reimb-amt-skus" style="color:var(--green)">—</div>
          <div class="stat-sub" id="k-reimb">— total</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">With Cases</div>
          <div class="stat-value" id="k-cases" style="color:var(--orange)">—</div>
          <div class="stat-sub">SKUs with open cases</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Sellable Returns</div>
          <div class="stat-value" id="k-sellable" style="color:var(--green)">—</div>
          <div class="stat-sub"><span id="k-sellable-qty">—</span> units</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-sm btn-outline ret-tab active" id="tab-analysis" onclick="window.__retSwitch('analysis')">Returns Analysis</button>
        <button class="btn btn-sm btn-outline ret-tab"        id="tab-log"      onclick="window.__retSwitch('log')">Returns Log</button>
      </div>

      <!-- ANALYSIS TAB -->
      <div id="panel-analysis">
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="a-from" value="${d30}" style="height:32px" onchange="window.__retLoadAnalysis()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="a-to" value="${today}" style="height:32px" onchange="window.__retLoadAnalysis()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Disposition</div>
            <select id="a-disp" style="height:32px" onchange="window.__retLoadAnalysis()">
              <option value="">All Dispositions</option>
              <option>SELLABLE</option><option>UNSELLABLE</option><option>DAMAGED</option>
              <option>CUSTOMER_DAMAGED</option><option>DEFECTIVE</option>
            </select>
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">FNSKU Status</div>
            <select id="a-fnsku-status" style="height:32px" onchange="window.__retLoadAnalysis()">
              <option value="">All Statuses</option>
              <option value="Matched FNSKU">Matched FNSKU</option>
              <option value="FNSKU Mismatch">FNSKU Mismatch</option>
              <option value="Order Not Found">Order Not Found</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / FNSKU / ASIN / Order ID</div>
            <input id="a-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__retDbAnalysis()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__retClearAnalysis()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>Returns — by Order ID + FNSKU</span></div>
          <div style="padding:12px" id="ret-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- LOG TAB -->
      <div id="panel-log" style="display:none">
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="l-from" value="${d30}" style="height:32px" onchange="window.__retLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="l-to" value="${today}" style="height:32px" onchange="window.__retLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Disposition</div>
            <select id="l-disp" style="height:32px" onchange="window.__retLoadLog()">
              <option value="">All</option>
              <option>SELLABLE</option><option>UNSELLABLE</option>
              <option>DAMAGED</option><option>CUSTOMER_DAMAGED</option><option>DEFECTIVE</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / FNSKU / Order ID</div>
            <input id="l-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__retDbLog()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__retClearLog()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>All Return Events</span></div>
          <div style="padding:12px" id="log-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const retV = document.getElementById('ret-vtable');
    if (retV && !retV._retVtableTotalsBound) {
      retV._retVtableTotalsBound = true;
      retV.addEventListener('vtable:rendered', updateColTotals);
    }

    window.__retRefresh       = () => Promise.all([loadAnalysis(), loadCaseOverlay(), loadAdjOverlay()]);
    window.__retSwitch        = switchTab;
    window.__retLoadAnalysis  = loadAnalysis;
    window.__retLoadLog       = loadLog;
    window.__retDbAnalysis    = debounce(loadAnalysis, 400);
    window.__retDbLog         = debounce(loadLog, 400);
    window.__retClearAnalysis = () => {
      ['a-from','a-to','a-disp','a-fnsku-status','a-search'].forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id === 'a-from') e.value = d30;
        else if (id === 'a-to') e.value = today;
        else e.value = '';
      });
      loadAnalysis();
    };
    window.__retClearLog = () => {
      ['l-from','l-to','l-disp','l-search'].forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id === 'l-from') e.value = d30;
        else if (id === 'l-to') e.value = today;
        else e.value = '';
      });
      loadLog();
    };

    Promise.all([loadAnalysis(), loadCaseOverlay(), loadAdjOverlay()]);
  }

  function refresh() {
    if (activeTab === 'analysis') loadAnalysis();
    else loadLog();
  }

  window.__viewExport = { render, refresh };
})();
