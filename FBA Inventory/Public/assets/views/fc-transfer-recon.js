/* ====================================================
   FC Transfer Recon View
   APIs: /fc-transfer-recon, /fc-transfer-analysis,
         /fc-transfer-log, /case-reimb-summary,
         /manual-adjustments
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

  let summaryData = [], analysisData = [], filteredAnalysis = [], logData = [];
  let summaryFiltered = [], logFiltered = [];
  let caseOverlayMap = {}, adjOverlayMap = {};
  let activeTab = 'summary';

  let colFiltersSummary = {}, colFiltersAnalysis = {}, colFiltersLog = {};
  const COL_TOTALS_SUM = [
    { key: 'event_count' },
    { key: 'total_qty'  },
    { key: 'qty_in'     },
    { key: 'qty_out'    },
  ];
  const COL_TOTALS_ANA = [
    { key: 'net_qty'        },
    { key: 'qty_in'         },
    { key: 'qty_out'        },
    { key: 'event_count'    },
    { key: 'days_pending'   },
    { key: 'reimb_qty'      },
    { key: 'reimb_amount',   currency: true },
  ];
  const COL_TOTALS_LOG = [{ key: 'quantity' }];

  function updateColTotalsSum() {
    COL_TOTALS_SUM.forEach(col => {
      const el = document.getElementById('fct-sum-ct-' + col.key);
      if (!el) return;
      const total = summaryFiltered.reduce((s, r) => s + (parseInt(r[col.key]) || 0), 0);
      el.textContent = (total >= 0 ? '+' : '') + total.toLocaleString();
      el.classList.toggle('active', !!colFiltersSummary[col.key]);
      el.onclick = () => { if (colFiltersSummary[col.key]) delete colFiltersSummary[col.key]; else colFiltersSummary[col.key] = true; renderSummaryTable(); };
    });
  }
  function updateColTotalsAna() {
    COL_TOTALS_ANA.forEach(col => {
      const el = document.getElementById('fct-ana-ct-' + col.key);
      if (!el) return;
      const total = filteredAnalysis.reduce((s, r) => s + (col.currency ? (parseFloat(r[col.key]) || 0) : (parseInt(r[col.key]) || 0)), 0);
      el.textContent = col.currency
        ? ((total >= 0 ? '+' : '') + '$' + total.toFixed(2))
        : ((total >= 0 ? '+' : '') + total.toLocaleString());
      el.classList.toggle('active', !!colFiltersAnalysis[col.key]);
      el.onclick = () => { if (colFiltersAnalysis[col.key]) delete colFiltersAnalysis[col.key]; else colFiltersAnalysis[col.key] = true; filterAnalysis(); };
    });
  }
  function updateColTotalsLog() {
    COL_TOTALS_LOG.forEach(col => {
      const el = document.getElementById('fct-log-ct-' + col.key);
      if (!el) return;
      const total = logFiltered.reduce((s, r) => s + (parseInt(r[col.key]) || 0), 0);
      el.textContent = (total >= 0 ? '+' : '') + total.toLocaleString();
      el.classList.toggle('active', !!colFiltersLog[col.key]);
      el.onclick = () => { if (colFiltersLog[col.key]) delete colFiltersLog[col.key]; else colFiltersLog[col.key] = true; renderLogTable(); };
    });
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
      const d = await fetch(`${API}/case-reimb-summary?recon_type=fc_transfer`).then(r => r.json());
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
      const d = await fetch(`${API}/manual-adjustments?recon_type=fc_transfer`).then(r => r.json());
      adjOverlayMap = {};
      (d.rows || []).forEach(a => {
        const k = (a.msku || '').trim(); if (!k) return;
        if (!adjOverlayMap[k]) adjOverlayMap[k] = { qty: 0, count: 0 };
        adjOverlayMap[k].qty   += parseInt(a.qty_adjusted) || 0;
        adjOverlayMap[k].count += 1;
      });
    } catch (e) { console.warn('adjOverlay:', e); }
  }

  function displayStatus(r) {
    const k  = (r.msku || '').trim();
    const ao = adjOverlayMap[k] || { qty: 0, count: 0 };
    const co = caseOverlayMap[k] || {};
    if (parseInt(ao.count) > 0) return 'adjustment';
    if (parseInt(co.case_count) > 0) {
      const ts = String(co.top_status || '').toLowerCase();
      if (ts === 'resolved')  return 'resolved';
      if (ts === 'approved')  return 'reimbursed';
      return 'case-raised';
    }
    const base = String(r.action_status || '').trim();
    if (base === 'excess')  return 'excess';
    if (base === 'waiting') return 'waiting';
    return 'take-action';
  }

  function statusBadge(s) {
    const map = {
      'waiting':    ['badge-orange', 'Waiting'],
      'excess':     ['badge-blue',   'Excess Stock'],
      'adjustment': ['badge-blue',   'Adjustment'],
      'case-raised':['badge-orange', 'Case Raised'],
      'resolved':   ['badge-blue',   'Resolved'],
      'reimbursed': ['badge-green',  'Reimbursed'],
      'take-action':['badge-red',    'Take Action'],
    };
    const [cls, label] = map[s] || ['badge-gray', s || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  // -- Summary Tab --
  async function loadSummary() {
    const p = new URLSearchParams();
    const fr = document.getElementById('s-from')?.value; if (fr) p.set('from', fr);
    const to = document.getElementById('s-to')?.value;   if (to) p.set('to', to);
    const fc = document.getElementById('s-fc')?.value;   if (fc) p.set('fc', fc);
    const sr = document.getElementById('s-search')?.value; if (sr) p.set('search', sr);

    const el = document.getElementById('sum-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/fc-transfer-recon${p.toString() ? '?' + p : ''}`).then(r => r.json());
      summaryData = d.rows || [];
      const s = d.stats || {};
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('k-skus',    Number(s.total_skus  || 0).toLocaleString());
      set('k-events',  Number(s.total_events || 0).toLocaleString());
      set('k-qty-in',  summaryData.reduce((a, x) => a + parseInt(x.qty_in || 0), 0).toLocaleString());
      set('k-qty-out', summaryData.reduce((a, x) => a + parseInt(x.qty_out || 0), 0).toLocaleString());
      colFiltersSummary = {};
      renderSummaryTable();
    } catch (e) {
      window.Toast?.show('Failed to load FC summary: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function renderSummaryTable() {
    const el = document.getElementById('sum-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!summaryData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        No FC transfer data — <a href="#/upload?t=fctransfer" style="color:var(--accent)">upload FC Transfers ?</a>
      </div>`;
      return;
    }
    summaryFiltered = [...summaryData];
    Object.keys(colFiltersSummary).forEach(key => {
      summaryFiltered = summaryFiltered.filter(r => (parseInt(r[key]) || 0) !== 0);
    });
    const data = summaryFiltered.map(r => {
      const co = caseOverlayMap[(r.msku || '').trim()] || {};
      return {
        ...r,
        _case:   co.top_status ? co.top_status.charAt(0).toUpperCase() + co.top_status.slice(1) : '—',
        _reimb:  (parseInt(co.total_approved) || 0) > 0 ? fn(co.total_approved) + ' / ' + fm(co.total_amount) : '—',
        _dr:     r.earliest ? `${fd(r.earliest)} ? ${fd(r.latest)}` : '—',
      };
    });
    window.VTable.create(el, {
      colTotalPrefix: 'fct-sum-',
      columns: [
        { key: 'msku',         label: 'MSKU',        width: 140 },
        { key: 'fnsku',        label: 'FNSKU',        width: 120 },
        { key: 'asin',         label: 'ASIN',         width: 110 },
        { key: 'title',        label: 'Title',        width: 180 },
        { key: 'event_count',  label: 'Events',       width: 70, numeric: true, render: v => fn(v) },
        { key: 'total_qty',    label: 'Net Qty',       width: 80, numeric: true, render: v => { const n = parseInt(v || 0, 10); return (n > 0 ? '+' : '') + fn(v); } },
        { key: 'qty_in',       label: 'Qty In (+)',    width: 80, numeric: true, render: v => `<span style="color:var(--green);font-weight:600">+${fn(v)}</span>` },
        { key: 'qty_out',      label: 'Qty Out (-)',   width: 80, numeric: true, render: v => `<span style="color:var(--red);font-weight:600">-${fn(v)}</span>` },
        { key: '_case',        label: 'Case Status',  width: 110 },
        { key: '_reimb',       label: 'Case Reimb',   width: 140 },
        { key: '_dr',          label: 'Date Range',   width: 160 },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Analysis Tab --
  async function loadAnalysis() {
    const p = new URLSearchParams();
    const sr = document.getElementById('a-search')?.value; if (sr) p.set('search', sr);

    const el = document.getElementById('ana-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const [d] = await Promise.all([
        fetch(`${API}/fc-transfer-analysis${p.toString() ? '?' + p : ''}`).then(r => r.json()),
        loadCaseOverlay(),
        loadAdjOverlay(),
      ]);
      analysisData = d.rows || [];
      colFiltersAnalysis = {};
      updateAnalysisKPIs(d.stats || {}, analysisData);
      filterAnalysis();
    } catch (e) {
      window.Toast?.show('Failed to load FC analysis: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function updateAnalysisKPIs(s, rows) {
    const actionRows    = rows.filter(r => displayStatus(r) === 'take-action');
    const waitRows      = rows.filter(r => displayStatus(r) === 'waiting');
    const excessRows    = rows.filter(r => displayStatus(r) === 'excess');
    const unresolvedRows= rows.filter(r => displayStatus(r) !== 'excess');
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = Number(v).toLocaleString(); };
    set('k-action',        s.take_action_count || actionRows.length);
    set('k-action-qty',    actionRows.reduce((a, x) => a + Math.abs(parseInt(x.net_qty || 0)), 0));
    set('k-wait',          s.waiting_count     || waitRows.length);
    set('k-wait-qty',      waitRows.reduce((a, x) => a + Math.abs(parseInt(x.net_qty || 0)), 0));
    set('k-excess',        s.excess_count      || excessRows.length);
    set('k-excess-qty',    excessRows.reduce((a, x) => a + parseInt(x.net_qty || 0), 0));
    set('k-unresolved',    s.total_unresolved  || unresolvedRows.length);
    set('k-unresolved-qty',unresolvedRows.reduce((a, x) => a + Math.abs(parseInt(x.net_qty || 0)), 0));
  }

  function filterAnalysis() {
    const sf = document.getElementById('a-status')?.value || 'all';
    let base = sf === 'all' ? analysisData.slice() : analysisData.filter(r => displayStatus(r) === sf);
    Object.keys(colFiltersAnalysis).forEach(key => {
      const isAmt = key === 'reimb_amount';
      base = base.filter(r => (isAmt ? (parseFloat(r[key]) || 0) : (parseInt(r[key]) || 0)) !== 0);
    });
    filteredAnalysis = base;
    renderAnalysisTable();
  }

  function renderAnalysisTable() {
    const el = document.getElementById('ana-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!filteredAnalysis.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        No unresolved FC transfers — either all balanced or no data uploaded<br>
        <a href="#/upload?t=fctransfer" style="color:var(--accent)">Upload FC Transfers ?</a>
      </div>`;
      return;
    }
    const data = filteredAnalysis.map(r => ({
      ...r,
      _status: displayStatus(r),   // raw key — rendered via htip in column def
    }));
    window.VTable.create(el, {
      colTotalPrefix: 'fct-ana-',
      columns: [
        { key: 'msku',           label: 'MSKU',           width: 140 },
        { key: 'fnsku',          label: 'FNSKU',           width: 120 },
        { key: 'asin',           label: 'ASIN',            width: 110 },
        { key: 'net_qty',        label: 'Net Qty',          width: 80, numeric: true, render: v => { const n = parseInt(v || 0, 10); return (n > 0 ? '+' : '') + fn(v); } },
        { key: 'qty_in',         label: 'Qty In (+)',       width: 80, numeric: true, render: v => fn(v) },
        { key: 'qty_out',        label: 'Qty Out (-)',      width: 80, numeric: true, render: v => fn(v) },
        { key: 'event_count',    label: 'Events',           width: 70, numeric: true, render: v => fn(v) },
        { key: 'earliest_date',  label: 'First Event',      width: 100, render: v => fd(v) },
        { key: 'days_pending',   label: 'Days Pending',     width: 90, numeric: true, render: v => {
          const d = parseInt(v || 0);
          const c = d > 60 ? 'var(--red)' : d > 30 ? 'var(--orange)' : 'var(--green)';
          return `<span style="color:${c};font-weight:600">${d}</span>`;
        }},
        { key: '_status', label: 'Status', width: 130, sortable: false,
          render: (v, r) => {
            const colorMap = {
              'reimbursed': '#10b981', 'resolved':   '#10b981', 'adjustment': '#10b981',
              'excess':     '#3b82f6',
              'take-action':'#ef4444',
              'waiting':    '#f59e0b', 'case-raised':'#f59e0b',
            };
            const labelMap = {
              'reimbursed': 'Reimbursed', 'resolved':   'Resolved',   'adjustment': 'Adjustment',
              'excess':     'Excess Stock',
              'take-action':'Take Action',
              'waiting':    'Waiting',    'case-raised':'Case Raised',
            };
            const color = colorMap[v] || '#94a3b8';
            const label = labelMap[v]  || escH(v || '?');
            const badge = '<span style="color:' + color + ';font-weight:700;font-size:11px">' + label + '</span>';
            const netN  = parseInt(r.net_qty || 0);
            const tipContent =
              '<div class="htip-row"><span class="htip-lbl">Status</span><span class="htip-val" style="color:' + color + '">' + label + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Qty In</span><span class="htip-val" style="color:#10b981">+'  + (r.qty_in  || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Qty Out</span><span class="htip-val" style="color:#ef4444">?' + (r.qty_out || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Net</span><span class="htip-val">' + (netN >= 0 ? '+' : '') + netN + '</span></div>';
            return htip(badge, tipContent);
          }
        },
        { key: 'reimb_qty',    label: 'Reimb. Qty', width: 80, numeric: true, render: v => fn(v) },
        { key: 'reimb_amount', label: 'Reimb. $',   width: 90, numeric: true,
          render: (v, r) => {
            const amt = parseFloat(v || 0);
            if (!amt) return '<span style="color:var(--text3)">?</span>';
            const rimbTip =
              (r.case_ids ? '<div class="htip-row"><span class="htip-lbl">Case ID(s)</span><span class="htip-val" style="color:#60a5fa">' + escH(r.case_ids) + '</span></div>' : '')
              + '<div class="htip-row"><span class="htip-lbl">Approved Qty</span><span class="htip-val" style="color:#10b981">' + (r.reimb_qty || 0)      + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Approved Amt</span><span class="htip-val" style="color:#10b981">$' + amt.toFixed(2) + '</span></div>';
            return htip('<b style="color:var(--green)">$' + amt.toFixed(2) + '</b>', rimbTip);
          }
        },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Log Tab --
  async function loadLog() {
    const p = new URLSearchParams();
    const fr = document.getElementById('l-from')?.value;   if (fr) p.set('from', fr);
    const to = document.getElementById('l-to')?.value;     if (to) p.set('to', to);
    const fc = document.getElementById('l-fc')?.value;     if (fc) p.set('fc', fc);
    const sr = document.getElementById('l-search')?.value; if (sr) p.set('search', sr);

    const el = document.getElementById('log-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/fc-transfer-log${p.toString() ? '?' + p : ''}`).then(r => r.json());
      logData = d.rows || [];
      colFiltersLog = {};
      renderLogTable();
    } catch (e) {
      window.Toast?.show('Failed to load FC log: ' + e.message, 'error');
    }
  }

  function renderLogTable() {
    const el = document.getElementById('log-vtable');
    if (!el) return;
    el.innerHTML = '';
    logFiltered = [...logData];
    Object.keys(colFiltersLog).forEach(key => {
      logFiltered = logFiltered.filter(r => (parseInt(r[key]) || 0) !== 0);
    });
    window.VTable.create(el, {
      colTotalPrefix: 'fct-log-',
      columns: [
        { key: 'transfer_date',      label: 'Date',           width: 100, render: v => fd(v) },
        { key: 'msku',               label: 'MSKU',           width: 140 },
        { key: 'fnsku',              label: 'FNSKU',           width: 120 },
        { key: 'asin',               label: 'ASIN',            width: 110 },
        { key: 'title',              label: 'Title',           width: 180 },
        { key: 'quantity',           label: 'Qty',             width: 70, numeric: true, render: v => { const n = parseInt(v || 0); return `<span style="color:${n > 0 ? 'var(--green)' : 'var(--red)'};">${n > 0 ? '+' : ''}${n.toLocaleString()}</span>`; } },
        { key: 'event_type',         label: 'Event Type',     width: 110 },
        { key: 'fulfillment_center', label: 'FC',             width: 80 },
        { key: 'disposition',        label: 'Disposition',    width: 110 },
        { key: 'reason',             label: 'Reason',         width: 130 },
      ],
      data: logFiltered,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  function switchTab(t) {
    activeTab = t;
    ['summary', 'analysis', 'log'].forEach(x => {
      const p = document.getElementById(`panel-${x}`);
      if (p) p.style.display = x === t ? '' : 'none';
    });
    document.querySelectorAll('.fct-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`ftab-${t}`)?.classList.add('active');
    if (t === 'log' && !logData.length)        loadLog();
    if (t === 'analysis' && !analysisData.length) loadAnalysis();
  }

  // -- Render --
  function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">FC Transfer Recon</div>
          <div class="page-sub">Fulfilment Centre transfer reconciliation — SKU-level quantity tracking</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__fctRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI Row 1: Summary -->
      <div class="stat-grid" style="margin-bottom:10px">
        <div class="stat-card">
          <div class="stat-label">Unique SKUs</div>
          <div class="stat-value" id="k-skus" style="color:var(--accent)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Events</div>
          <div class="stat-value" id="k-events" style="color:var(--text)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Qty In</div>
          <div class="stat-value" id="k-qty-in" style="color:var(--green)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Qty Out</div>
          <div class="stat-value" id="k-qty-out" style="color:var(--red)">—</div>
        </div>
      </div>
      <!-- KPI Row 2: Analysis -->
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card" style="border-left:3px solid var(--red)">
          <div class="stat-label">Take Action (&gt;60 Days)</div>
          <div class="stat-value" id="k-action" style="color:var(--red)">—</div>
          <div class="stat-sub"><span id="k-action-qty">—</span> units</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--orange)">
          <div class="stat-label">Waiting (&lt;60 Days)</div>
          <div class="stat-value" id="k-wait" style="color:var(--orange)">—</div>
          <div class="stat-sub"><span id="k-wait-qty">—</span> units</div>
        </div>
        <div class="stat-card" style="border-left:3px solid var(--accent)">
          <div class="stat-label">Excess Stock</div>
          <div class="stat-value" id="k-excess" style="color:var(--accent)">—</div>
          <div class="stat-sub"><span id="k-excess-qty">—</span> surplus</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total Unresolved</div>
          <div class="stat-value" id="k-unresolved" style="color:var(--text2)">—</div>
          <div class="stat-sub"><span id="k-unresolved-qty">—</span> units missing</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-sm btn-outline fct-tab active" id="ftab-summary"  onclick="window.__fctSwitch('summary')">Summary by SKU</button>
        <button class="btn btn-sm btn-outline fct-tab"        id="ftab-log"      onclick="window.__fctSwitch('log')">Transfer Log</button>
        <button class="btn btn-sm btn-outline fct-tab"        id="ftab-analysis" onclick="window.__fctSwitch('analysis')">FC Transfer Analysis</button>
      </div>

      <!-- SUMMARY TAB -->
      <div id="panel-summary">
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="s-from" value="${d30}" style="height:32px" onchange="window.__fctLoadSum()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="s-to" value="${today}" style="height:32px" onchange="window.__fctLoadSum()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">FC</div>
            <input id="s-fc" placeholder="e.g. PHX7" style="height:32px;width:80px" oninput="window.__fctDbSum()">
          </div>
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / FNSKU</div>
            <input id="s-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__fctDbSum()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__fctClearSum()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>FC Transfers by SKU</span></div>
          <div style="padding:12px" id="sum-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- LOG TAB -->
      <div id="panel-log" style="display:none">
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="l-from" value="${d30}" style="height:32px" onchange="window.__fctLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="l-to" value="${today}" style="height:32px" onchange="window.__fctLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">FC</div>
            <input id="l-fc" placeholder="e.g. PHX7" style="height:32px;width:80px" oninput="window.__fctDbLog()">
          </div>
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / FNSKU</div>
            <input id="l-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__fctDbLog()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__fctClearLog()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>Transfer Log</span></div>
          <div style="padding:12px" id="log-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- ANALYSIS TAB -->
      <div id="panel-analysis" style="display:none">
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Status</div>
            <select id="a-status" style="height:32px;min-width:170px" onchange="window.__fctFilterAna()">
              <option value="all">All</option>
              <option value="take-action">Take Action (&gt;60 Days)</option>
              <option value="waiting">Waiting (&lt;60 Days)</option>
              <option value="excess">Excess Stock</option>
              <option value="case-raised">Case Raised</option>
              <option value="adjustment">Adjustment</option>
              <option value="resolved">Resolved</option>
              <option value="reimbursed">Reimbursed</option>
            </select>
          </div>
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / FNSKU / ASIN</div>
            <input id="a-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__fctDbAna()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__fctClearAna()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>FC Transfer Analysis — Unresolved Transfers</span></div>
          <div style="padding:12px" id="ana-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    [['sum-vtable', updateColTotalsSum], ['ana-vtable', updateColTotalsAna], ['log-vtable', updateColTotalsLog]].forEach(([id, fn]) => {
      const node = document.getElementById(id);
      if (node && !node._fctTotalsBound) {
        node._fctTotalsBound = true;
        node.addEventListener('vtable:rendered', fn);
      }
    });

    window.__fctRefresh   = () => { loadSummary(); if (activeTab === 'log') loadLog(); if (activeTab === 'analysis') loadAnalysis(); };
    window.__fctSwitch    = switchTab;
    window.__fctLoadSum   = loadSummary;
    window.__fctLoadLog   = loadLog;
    window.__fctFilterAna = filterAnalysis;
    window.__fctDbSum     = debounce(loadSummary, 400);
    window.__fctDbLog     = debounce(loadLog, 400);
    window.__fctDbAna     = debounce(loadAnalysis, 400);
    window.__fctClearSum  = () => {
      ['s-from','s-to','s-fc','s-search'].forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id === 's-from') e.value = d30;
        else if (id === 's-to') e.value = today;
        else e.value = '';
      });
      loadSummary();
    };
    window.__fctClearLog  = () => {
      ['l-from','l-to','l-fc','l-search'].forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id === 'l-from') e.value = d30;
        else if (id === 'l-to') e.value = today;
        else e.value = '';
      });
      loadLog();
    };
    window.__fctClearAna  = () => {
      const s = document.getElementById('a-status'); if (s) s.value = 'all';
      const q = document.getElementById('a-search'); if (q) q.value = '';
      loadAnalysis();
    };

    Promise.all([loadSummary(), loadCaseOverlay(), loadAdjOverlay()]).then(() => {
      updateAnalysisKPIs({}, []);
    });
  }

  function refresh() { loadSummary(); }

  window.__viewExport = { render, refresh };
})();
