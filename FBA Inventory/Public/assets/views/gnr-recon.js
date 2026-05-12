/* ====================================================
   GNR Recon View
   APIs: /gnr-recon, /gnr-log, /case-reimb-summary,
         /manual-adjustments, /gnr-recon-remarks, /cases
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

  let reconData = [], reconFiltered = [], logData = [], logFiltered = [];
  let caseOverlayMap = {}, adjOverlayMap = {};
  let activeTab = 'recon';
  let _gnrDrawerRow = null;

  let colFiltersRecon = {}, colFiltersLog = {};
  const COL_TOTALS_RECON = [
    { key: 'gnr_qty'        },
    { key: 'sales_qty'      },
    { key: 'return_qty'     },
    { key: 'removal_qty'    },
    { key: 'reimb_qty'      },
    { key: 'ending_balance' },
    { key: 'fba_ending'     },
  ];
  const COL_TOTALS_LOG = [{ key: 'quantity' }];

  function updateColTotalsRecon() {
    COL_TOTALS_RECON.forEach(col => {
      const el = document.getElementById('gnr-r-ct-' + col.key);
      if (!el) return;
      const total = reconFiltered.reduce((s, r) => s + (parseInt(r[col.key]) || 0), 0);
      el.textContent = (total >= 0 ? '+' : '') + total.toLocaleString();
      el.classList.toggle('active', !!colFiltersRecon[col.key]);
      el.onclick = () => { if (colFiltersRecon[col.key]) delete colFiltersRecon[col.key]; else colFiltersRecon[col.key] = true; renderReconTable(); };
    });
  }
  function updateColTotalsLog() {
    COL_TOTALS_LOG.forEach(col => {
      const el = document.getElementById('gnr-l-ct-' + col.key);
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

  function fd(v) { return v ? String(v).split('T')[0] : '?'; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '?' : n.toLocaleString(); }
  function fm(v) { const n = parseFloat(v); return isNaN(n) || n === 0 ? '?' : '$' + n.toFixed(2); }

  function apiUrl(path) { return location.origin + path; }

  async function fetchJson(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  }

  // -- Overlays --
  async function loadCaseOverlay() {
    try {
      const d = await fetchJson(apiUrl('/api/case-reimb-summary?recon_type=gnr'));
      caseOverlayMap = {};
      (d.rows || []).forEach(x => { caseOverlayMap[(x.fnsku || '').trim()] = x; });
      window._gnrCaseOverlay = caseOverlayMap;
    } catch (e) { console.warn('caseOverlay:', e); }
  }

  async function loadAdjOverlay() {
    try {
      const d = await fetchJson(apiUrl('/api/manual-adjustments?recon_type=gnr'));
      adjOverlayMap = {};
      (d.rows || []).forEach(x => {
        const k = (x.msku || '').trim();
        if (!adjOverlayMap[k]) adjOverlayMap[k] = { qty: 0, count: 0, reasons: [] };
        adjOverlayMap[k].qty    += parseInt(x.qty_adjusted || x.quantity || 0);
        adjOverlayMap[k].count  += 1;
        if (x.reason) adjOverlayMap[k].reasons.push(x.reason);
      });
      window._gnrAdjOverlay = adjOverlayMap;
    } catch (e) { console.warn('adjOverlay:', e); }
  }

  function displayStatus(r) {
    const co = caseOverlayMap[(r.used_fnsku || '').trim()] || {};
    const ao = adjOverlayMap[(r.used_msku  || '').trim()] || { qty: 0, count: 0 };
    const adjQty  = parseInt(ao.qty) || 0;
    const caseCnt = parseInt(co.case_count) || 0;
    if (adjQty > 0) return 'adjustment';
    if (caseCnt > 0) {
      const ts = String(co.top_status || '').toLowerCase();
      if (ts === 'resolved') return 'resolved';
      if (ts === 'approved') return 'reimbursed';
      return 'case-raised';
    }
    const base = String(r.action_status || '').trim();
    if (base === 'over-accounted') return 'over-accounted';
    if (base === 'waiting')         return 'waiting';
    if (base === 'matched')         return 'matched';
    return 'take-action';
  }

  function statusBadge(s) {
    const map = {
      'matched':        ['badge-green',  'Matched'],
      'take-action':    ['badge-red',    'Take Action'],
      'waiting':        ['badge-orange', 'Waiting'],
      'over-accounted': ['badge-blue',   'Over-Accounted'],
      'case-raised':    ['badge-orange', 'Case Raised'],
      'adjustment':     ['badge-blue',   'Adjustment'],
      'resolved':       ['badge-blue',   'Resolved'],
      'reimbursed':     ['badge-green',  'Reimbursed'],
    };
    const [cls, label] = map[s] || ['badge-gray', s || '?'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  // -- Load All --
  async function loadAll() {
    await Promise.all([loadRecon(), loadCaseOverlay(), loadAdjOverlay()]);
  }

  // -- Recon --
  async function loadRecon() {
    const search = document.getElementById('r-search')?.value.trim();
    const status = document.getElementById('r-status')?.value;
    const params = [];
    if (search) params.push('search=' + encodeURIComponent(search));
    if (status) params.push('action_status=' + encodeURIComponent(status));
    const url = apiUrl('/api/gnr-recon' + (params.length ? '?' + params.join('&') : ''));

    const el = document.getElementById('gnr-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetchJson(url);
      reconData = d.rows || [];
      const s   = d.stats || {};
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = (v || 0).toLocaleString(); };
      set('k-skus',     s.total_skus    || reconData.length);
      set('k-gnr-qty',  s.total_gnr_qty || reconData.reduce((a, r) => a + parseInt(r.gnr_qty || 0), 0));
      set('k-matched',  s.matched       || 0);
      set('k-action',   s.take_action   || 0);
      set('k-waiting',  s.waiting       || 0);
      set('k-over',     s.over_accounted|| 0);
      colFiltersRecon = {};
      renderReconTable();
    } catch (e) {
      window.Toast?.show('Failed to load GNR recon: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function renderReconTable() {
    const el = document.getElementById('gnr-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!reconData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        No GNR data found ? <a href="#/upload?t=gnr" style="color:var(--accent)">upload GNR Report ?</a>
        or add via <a href="#/grade-resell" style="color:var(--accent)">Grade & Resell ?</a>
      </div>`;
      return;
    }
    reconFiltered = [...reconData];
    Object.keys(colFiltersRecon).forEach(key => {
      reconFiltered = reconFiltered.filter(r => (parseInt(r[key]) || 0) !== 0);
    });
    const data = reconFiltered.map((r, i) => ({
      ...r,
      _status:     displayStatus(r),
      _date_range: r.first_date === r.last_date ? fd(r.first_date) : `${fd(r.first_date)} ? ${fd(r.last_date)}`,
      _row_idx:    i,
    }));
    window.VTable.create(el, {
      colTotalPrefix: 'gnr-r-',
      columns: [
        { key: 'used_msku', label: 'Used MSKU', width: 160,
          render: (v, row) => {
            const idx = row._row_idx;
            return `<span style="color:var(--accent);cursor:pointer;font-family:monospace;
              font-weight:600;text-decoration:underline dotted"
              onclick="window.__gnrOpenDrawer(${idx})">${String(v||'?').replace(/</g,'&lt;')}</span>`;
          }
        },
        { key: 'used_fnsku',     label: 'Used FNSKU',     width: 120 },
        { key: 'fnsku',          label: 'Orig. FNSKU',    width: 120 },
        { key: 'asin',           label: 'ASIN',            width: 110 },
        { key: 'used_condition', label: 'Condition',       width: 110 },
        { key: 'gnr_qty', label: 'GNR Qty', width: 80, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            const gnrTip =
              '<div class="htip-row"><span class="htip-lbl">GNR Qty</span><span class="htip-val" style="font-weight:700">' + qty + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Succeeded</span><span class="htip-val" style="color:#10b981">' + (r.gnr_succeeded || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Failed</span><span class="htip-val" style="color:#ef4444">'    + (r.gnr_failed    || 0) + '</span></div>'
              + (r.first_date
                  ? '<div class="htip-sep"></div><div class="htip-row"><span class="htip-lbl">Period</span><span class="htip-val">'
                    + fmtDate(r.first_date) + (r.last_date && r.last_date !== r.first_date ? ' \u2192 ' + fmtDate(r.last_date) : '')
                    + '</span></div>'
                  : '');
            return '<span class="mono" style="font-weight:700;cursor:default" data-tip="'
              + gnrTip.replace(/"/g, '&quot;') + '" onmouseover="showTip(event,this)" onmousemove="moveTip(event)" onmouseout="hideTip()">'
              + qty + '</span>';
          }
        },
        { key: 'sales_qty',   label: 'Sales Qty',   width: 80, numeric: true, render: v => fn(v) },
        { key: 'return_qty',  label: 'Return Qty',  width: 85, numeric: true, render: v => fn(v) },
        { key: 'removal_qty', label: 'Removal Qty', width: 90, numeric: true, render: v => fn(v) },
        { key: 'reimb_qty', label: 'Reimb. / Case', width: 110, numeric: true,
          render: (v, r) => {
            const co = (window._gnrCaseOverlay && window._gnrCaseOverlay[(r.used_fnsku || '').trim()]) || {};
            const ao = (window._gnrAdjOverlay  && window._gnrAdjOverlay[(r.used_msku  || '').trim()]) || {};
            const totalReimb = parseInt(co.total_approved || 0) + parseInt(ao.qty || 0);
            const caseCnt    = parseInt(co.case_count || 0);
            const caseAmt    = parseFloat(co.total_amount || 0);
            const csLabel    = co.top_status ? co.top_status.charAt(0).toUpperCase() + co.top_status.slice(1) : '';
            const csColor    = co.top_status === 'approved' ? '#10b981' : (co.top_status === 'raised' || co.top_status === 'pending') ? '#f59e0b' : 'var(--text3)';
            const amtBadge   = caseAmt > 0 ? ' <span style="color:#10b981;font-size:10px">$' + caseAmt.toFixed(2) + '</span>' : '';

            if (totalReimb > 0 || caseAmt > 0) {
              const rimbTip =
                (co.case_ids ? '<div class="htip-row"><span class="htip-lbl">Case ID(s)</span><span class="htip-val" style="color:#60a5fa">' + escH(co.case_ids) + '</span></div>' : '')
                + (csLabel   ? '<div class="htip-row"><span class="htip-lbl">Status</span><span class="htip-val" style="color:' + csColor + '">' + csLabel + '</span></div>' : '')
                + '<div class="htip-sep"></div>'
                + '<div class="htip-row"><span class="htip-lbl">Approved Qty</span><span class="htip-val" style="color:#10b981">' + (co.total_approved || 0) + '</span></div>'
                + (caseAmt > 0 ? '<div class="htip-row"><span class="htip-lbl">Approved Amt</span><span class="htip-val" style="color:#10b981">$' + caseAmt.toFixed(2) + '</span></div>' : '')
                + (ao.qty > 0  ? '<div class="htip-row"><span class="htip-lbl">Adj Qty</span><span class="htip-val">' + ao.qty + '</span></div>' : '');
              return htip('<span class="mono" style="color:var(--green);font-weight:700;cursor:default">' + totalReimb + '</span>' + amtBadge, rimbTip);
            } else if (caseCnt > 0) {
              const rimbTip =
                '<div class="htip-row"><span class="htip-lbl">Case ID(s)</span><span class="htip-val" style="color:#60a5fa">' + escH(co.case_ids || '?') + '</span></div>'
                + '<div class="htip-row"><span class="htip-lbl">Status</span><span class="htip-val" style="color:' + csColor + '">' + (csLabel || '?') + '</span></div>'
                + '<div class="htip-row"><span class="htip-lbl">Cases</span><span class="htip-val">' + caseCnt + '</span></div>';
              return htip('<span style="color:' + csColor + ';font-weight:700;font-size:10px;cursor:default">\u2b06 ' + csLabel + '</span>', rimbTip);
            } else {
              return '<span style="color:var(--text3)">?</span>';
            }
          }
        },
        { key: 'ending_balance', label: 'Ending Bal.', width: 100, numeric: true,
          render: (v, r) => {
            const endBal = parseInt(v || 0);
            const balTip =
              '<div class="htip-row"><span class="htip-lbl">GNR Qty</span><span class="htip-val">'                                               + (r.gnr_qty   || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Sales</span><span class="htip-val" style="color:#ef4444">\u2212'                    + (r.sales_qty || 0) + '</span></div>'
              + '<div class="htip-row"><span class="htip-lbl">Reimb</span><span class="htip-val" style="color:#10b981">\u2212'                    + (r.reimb_qty || 0) + '</span></div>'
              + '<div class="htip-sep"></div>'
              + '<div class="htip-row"><span class="htip-lbl">Balance</span><span class="htip-val" style="font-weight:700">' + (endBal >= 0 ? '+' : '') + endBal + '</span></div>';
            const balCls = endBal > 0 ? 'color:var(--red)' : endBal < 0 ? 'color:var(--green)' : 'color:var(--text3)';
            return '<span class="mono" style="' + balCls + ';cursor:default" data-tip="'
              + balTip.replace(/"/g, '&quot;') + '" onmouseover="showTip(event,this)" onmousemove="moveTip(event)" onmouseout="hideTip()">'
              + (endBal >= 0 ? '+' : '') + endBal + '</span>';
          }
        },
        { key: 'fba_ending', label: 'FBA Balance', width: 90, numeric: true, render: v => v == null ? '?' : fn(v) },
        { key: '_status', label: 'Status', width: 130, sortable: false,
          render: (v, row) => {
            const co  = (caseOverlayMap && caseOverlayMap[(row.used_fnsku || '').trim()]) || {};
            const ao  = (adjOverlayMap  && adjOverlayMap[(row.used_msku  || '').trim()]) || {};
            const rem = (row.recon_remarks || row.remarks || '').trim();
            const eH  = window.escH || (s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'));

            let html = '';
            if (v) html += `<div style="font-size:11px;color:#e2e8f0;margin-bottom:4px">${eH(v)}</div>`;
            if (rem) {
              html += `<div class="htip-sep"></div>
                <div style="font-size:10px;color:#94a3b8;font-weight:700;margin-bottom:3px">Remarks</div>
                <div style="font-size:10px;color:#e2e8f0;white-space:pre-wrap">${eH(rem)}</div>`;
            }
            if ((co.case_count > 0) || co.case_ids) {
              html += `<div class="htip-sep"></div>
                <div style="font-size:10px;color:#94a3b8;font-weight:700">Cases</div>
                <div style="font-size:10px;color:#e2e8f0">${co.case_count || 0} raised ? ${co.total_approved || 0} approved</div>`;
            }
            if (ao.qty > 0) {
              html += `<div class="htip-sep"></div>
                <div style="font-size:10px;color:#94a3b8;font-weight:700">Adjustments</div>
                <div style="font-size:10px;color:#e2e8f0">Qty: ${ao.qty}</div>`;
            }

            const badge = statusBadge(v);
            return `<div class="htip">${badge}<div class="htip-box">${html}</div></div>`;
          }
        },
        { key: 'remarks',        label: 'Remarks',         width: 160 },
        { key: '_date_range',    label: 'Date Range',      width: 160 },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Log --
  async function loadLog() {
    const from   = document.getElementById('l-from')?.value;
    const to     = document.getElementById('l-to')?.value;
    const search = document.getElementById('l-search')?.value.trim();
    const status = document.getElementById('l-status')?.value;
    const params = [];
    if (from)   params.push('from='   + from);
    if (to)     params.push('to='     + to);
    if (search) params.push('search=' + encodeURIComponent(search));
    if (status) params.push('status=' + encodeURIComponent(status));
    const url = apiUrl('/api/gnr-log' + (params.length ? '?' + params.join('&') : ''));

    const el = document.getElementById('log-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetchJson(url);
      logData = d.rows || [];
      colFiltersLog = {};
      renderLogTable();
    } catch (e) {
      window.Toast?.show('Failed to load GNR log: ' + e.message, 'error');
    }
  }

  function renderLogTable() {
    const el = document.getElementById('log-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!logData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        No GNR log data ? <a href="#/upload?t=gnr" style="color:var(--accent)">upload GNR Report ?</a>
      </div>`;
      return;
    }
    logFiltered = [...logData];
    Object.keys(colFiltersLog).forEach(key => {
      logFiltered = logFiltered.filter(r => (parseInt(r[key]) || 0) !== 0);
    });
    const data = logFiltered.map(r => ({
      ...r,
      _source: r.entry_source === 'manual'
        ? `<span class="badge badge-blue">Manual</span>`
        : `<span class="badge badge-gray">Report</span>`,
      _unit_status: r.unit_status === 'Succeeded'
        ? `<span class="badge badge-green">Succeeded</span>`
        : r.unit_status === 'Failed'
        ? `<span class="badge badge-red">Failed</span>`
        : r.unit_status || '?',
    }));
    window.VTable.create(el, {
      colTotalPrefix: 'gnr-l-',
      columns: [
        { key: '_source',             label: 'Source',        width: 80, sortable: false, render: v => v },
        { key: 'report_date',         label: 'Date',          width: 100, render: v => fd(v) },
        { key: 'order_id',            label: 'Order ID',      width: 140 },
        { key: 'lpn',                 label: 'LPN',           width: 120 },
        { key: 'value_recovery_type', label: 'Recovery Type', width: 120 },
        { key: 'msku',                label: 'MSKU',          width: 140 },
        { key: 'fnsku',               label: 'FNSKU',         width: 120 },
        { key: 'asin',                label: 'ASIN',          width: 110 },
        { key: 'quantity',            label: 'Qty',           width: 60, numeric: true, render: v => fn(v) },
        { key: '_unit_status',        label: 'Unit Status',   width: 100, sortable: false, render: v => v },
        { key: 'reason_for_unit_status', label: 'Reason',    width: 150 },
        { key: 'used_condition',      label: 'Condition',     width: 130 },
        { key: 'used_msku',           label: 'Used MSKU',     width: 150 },
        { key: 'used_fnsku',          label: 'Used FNSKU',    width: 120 },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- GNR row drawer --
  function openGnrDrawer(idx) {
    const r = reconFiltered[idx];
    if (!r) return;
    _gnrDrawerRow = r;
    const eH = s => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const co = caseOverlayMap[(r.used_fnsku || '').trim()] || {};
    const ao = adjOverlayMap[(r.used_msku  || '').trim()] || {};

    const body = `
      <div class="drow">
        <div class="dkpi"><div class="dkpi-val">${fn(r.gnr_qty)}</div><div class="dkpi-lbl">GNR Qty</div></div>
        <div class="dkpi"><div class="dkpi-val">${fn(r.sales_qty)}</div><div class="dkpi-lbl">Sales Qty</div></div>
        <div class="dkpi"><div class="dkpi-val">${fn(r.return_qty)}</div><div class="dkpi-lbl">Returns</div></div>
      </div>
      <div class="drow">
        <div class="dkpi"><div class="dkpi-val">${fn(r.ending_balance)}</div><div class="dkpi-lbl">Ending Bal.</div></div>
        <div class="dkpi"><div class="dkpi-val">${r.fba_ending != null ? fn(r.fba_ending) : '?'}</div><div class="dkpi-lbl">FBA Balance</div></div>
        <div class="dkpi"><div class="dkpi-val">${fn(r.reimb_qty)}</div><div class="dkpi-lbl">Reimb. Qty</div></div>
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">Item Details</div>
        <div class="dl-row"><span class="dl-lbl">Used MSKU</span><span class="dl-val" style="font-family:monospace">${eH(r.used_msku||'?')}</span></div>
        <div class="dl-row"><span class="dl-lbl">Used FNSKU</span><span class="dl-val" style="font-family:monospace">${eH(r.used_fnsku||'?')}</span></div>
        <div class="dl-row"><span class="dl-lbl">Orig. FNSKU</span><span class="dl-val" style="font-family:monospace">${eH(r.fnsku||'?')}</span></div>
        <div class="dl-row"><span class="dl-lbl">ASIN</span><span class="dl-val" style="font-family:monospace">${eH(r.asin||'?')}</span></div>
        <div class="dl-row"><span class="dl-lbl">Condition</span><span class="dl-val">${eH(r.used_condition||'?')}</span></div>
        <div class="dl-row"><span class="dl-lbl">Date Range</span><span class="dl-val">${fd(r.first_date)} ? ${fd(r.last_date)}</span></div>
        ${co.case_count > 0 ? `<div class="dl-row"><span class="dl-lbl">Cases</span><span class="dl-val">${co.case_count} raised ? ${co.total_approved||0} approved</span></div>` : ''}
        ${ao.qty > 0 ? `<div class="dl-row"><span class="dl-lbl">Adj. Qty</span><span class="dl-val">${ao.qty}</span></div>` : ''}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:6px">Remarks</div>
        <textarea id="gnr-drawer-remarks" rows="3"
          style="width:100%;font-size:12px;border:1px solid var(--border);
            border-radius:6px;padding:8px;resize:vertical;font-family:var(--font)"
          placeholder="Add remarks for this Used SKU...">${eH(r.recon_remarks || r.remarks || '')}</textarea>
        <button onclick="window.__gnrSaveRemark()"
          style="margin-top:6px;padding:6px 14px;background:var(--accent);color:#fff;
            border:none;border-radius:6px;font-size:12px;cursor:pointer">
          Save Remarks
        </button>
      </div>
    `;
    window.openDrawer(r.used_msku || '?', eH(r.used_fnsku || ''), body);
  }

  async function saveGnrRemark() {
    const r = _gnrDrawerRow;
    if (!r) return;
    const text = document.getElementById('gnr-drawer-remarks')?.value || '';
    try {
      await fetchJson(apiUrl('/api/gnr-recon-remarks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ used_msku: r.used_msku, used_fnsku: r.used_fnsku, remarks: text }),
      });
      // Patch in-place so tooltip reflects new value without full reload
      const row = reconData.find(d =>
        (d.used_msku || '') === (r.used_msku || '') &&
        (d.used_fnsku || '') === (r.used_fnsku || '')
      );
      if (row) { row.recon_remarks = text; row.remarks = text; }
      r.recon_remarks = text;
      r.remarks = text;
      window.Toast?.show('? Remarks saved', 'success');
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  function switchTab(t) {
    activeTab = t;
    document.getElementById('panel-recon').style.display = t === 'recon' ? '' : 'none';
    document.getElementById('panel-log').style.display   = t === 'log'   ? '' : 'none';
    document.querySelectorAll('.gnrr-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`grtab-${t}`)?.classList.add('active');
    if (t === 'log' && !logData.length) loadLog();
  }

  function setFilter(status) {
    if (activeTab !== 'recon') switchTab('recon');
    const e = document.getElementById('r-status'); if (e) e.value = status;
    loadRecon();
  }

  // -- Render --
  function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">GNR Recon</div>
          <div class="page-sub">Grade & Resell reconciliation ? Used SKU sales and FBA balance tracking</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__gnrRRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI Stats -->
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Unique Used SKUs</div>
          <div class="stat-value" id="k-skus" style="color:var(--accent)">?</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Total GNR Qty</div>
          <div class="stat-value" id="k-gnr-qty" style="color:var(--text)">?</div>
        </div>
        <div class="stat-card" style="cursor:pointer" onclick="window.__gnrRSetFilter('matched')">
          <div class="stat-label">Matched</div>
          <div class="stat-value" id="k-matched" style="color:var(--green)">?</div>
        </div>
        <div class="stat-card" style="cursor:pointer" onclick="window.__gnrRSetFilter('take-action')">
          <div class="stat-label">Take Action</div>
          <div class="stat-value" id="k-action" style="color:var(--red)">?</div>
        </div>
        <div class="stat-card" style="cursor:pointer" onclick="window.__gnrRSetFilter('waiting')">
          <div class="stat-label">Waiting (&lt;60d)</div>
          <div class="stat-value" id="k-waiting" style="color:var(--orange)">?</div>
        </div>
        <div class="stat-card" style="cursor:pointer" onclick="window.__gnrRSetFilter('over-accounted')">
          <div class="stat-label">Over-Accounted</div>
          <div class="stat-value" id="k-over" style="color:var(--accent)">?</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-sm btn-outline gnrr-tab active" id="grtab-recon" onclick="window.__gnrRSwitch('recon')">GNR Reconciliation</button>
        <button class="btn btn-sm btn-outline gnrr-tab"        id="grtab-log"   onclick="window.__gnrRSwitch('log')">GNR Log</button>
      </div>

      <!-- RECON TAB -->
      <div id="panel-recon">
        <div class="filter-bar" style="margin-bottom:14px">
          <div style="flex:1;min-width:200px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search Used SKU / FNSKU / ASIN</div>
            <input id="r-search" placeholder="Search?" style="height:32px;width:100%" oninput="window.__gnrRDbRecon()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Status</div>
            <select id="r-status" style="height:32px;min-width:160px" onchange="window.__gnrRLoadRecon()">
              <option value="">All Statuses</option>
              <option value="matched">Matched</option>
              <option value="take-action">Take Action</option>
              <option value="waiting">Waiting</option>
              <option value="over-accounted">Over-Accounted</option>
            </select>
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__gnrRClearRecon()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>GNR Reconciliation</span></div>
          <div style="padding:12px" id="gnr-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- LOG TAB -->
      <div id="panel-log" style="display:none">
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="l-from" value="${d30}" style="height:32px" onchange="window.__gnrRLoadLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="l-to" value="${today}" style="height:32px" onchange="window.__gnrRLoadLog()">
          </div>
          <div style="flex:1;min-width:180px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search Order / MSKU / ASIN</div>
            <input id="l-search" placeholder="Search?" style="height:32px;width:100%" oninput="window.__gnrRDbLog()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Unit Status</div>
            <select id="l-status" style="height:32px" onchange="window.__gnrRLoadLog()">
              <option value="">All Statuses</option>
              <option value="Succeeded">Succeeded</option>
              <option value="Failed">Failed</option>
            </select>
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__gnrRClearLog()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>GNR Log</span></div>
          <div style="padding:12px" id="log-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const gnrV = document.getElementById('gnr-vtable');
    if (gnrV && !gnrV._gnrReconTotalsBound) {
      gnrV._gnrReconTotalsBound = true;
      gnrV.addEventListener('vtable:rendered', updateColTotalsRecon);
    }
    const gnrLogV = document.getElementById('log-vtable');
    if (gnrLogV && !gnrLogV._gnrLogTotalsBound) {
      gnrLogV._gnrLogTotalsBound = true;
      gnrLogV.addEventListener('vtable:rendered', updateColTotalsLog);
    }

    window.__gnrRRefresh   = () => { loadAll(); if (activeTab === 'log') loadLog(); };
    window.__gnrOpenDrawer = openGnrDrawer;
    window.__gnrSaveRemark = saveGnrRemark;
    window.__gnrRSwitch    = switchTab;
    window.__gnrRSetFilter = setFilter;
    window.__gnrRLoadRecon = loadRecon;
    window.__gnrRLoadLog   = loadLog;
    window.__gnrRDbRecon   = debounce(loadRecon, 350);
    window.__gnrRDbLog     = debounce(loadLog, 350);
    window.__gnrRClearRecon = () => {
      const s = document.getElementById('r-search'); if (s) s.value = '';
      const st = document.getElementById('r-status'); if (st) st.value = '';
      loadRecon();
    };
    window.__gnrRClearLog = () => {
      ['l-from','l-to','l-search','l-status'].forEach(id => {
        const e = document.getElementById(id);
        if (!e) return;
        if (id === 'l-from') e.value = d30;
        else if (id === 'l-to') e.value = today;
        else e.value = '';
      });
      loadLog();
    };

    loadAll();
  }

  function refresh() {
    if (activeTab === 'recon') loadRecon();
    else loadLog();
  }

  window.__viewExport = { render, refresh };
})();
