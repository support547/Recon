/* ====================================================
   Full Inventory Recon View
   APIs: /full-recon, /cases, /manual-adjustments,
         /full-recon-remarks
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

  let allData = [], filteredData = [];
  let colFilters = {};
  let _currentDrawerRow = null;

  const COL_TOTALS = [
    { key: 'days_recv_to_sale',  computed: false },
    { key: 'shipped_qty',        computed: false },
    { key: 'receipt_qty',        computed: false },
    { key: 'shortage_qty',       computed: false },
    { key: 'sold_qty',           computed: false },
    { key: 'return_qty',         computed: false },
    { key: 'reimb_qty',          computed: false },
    { key: 'removal_rcpt_qty',   computed: false },
    { key: 'repl_qty',           computed: false },
    { key: 'gnr_qty',            computed: false },
    { key: 'fc_net_qty',         computed: false },
    { key: '_ending_bal',        computed: true  },
    { key: 'fba_ending_balance', computed: false },
    { key: 'fba_adj_total',      computed: false },
    { key: 'adj_qty',            computed: false },
  ];

  function updateColTotals() {
    COL_TOTALS.forEach(col => {
      const el = document.getElementById('ct-' + col.key);
      if (!el) return;
      const total = filteredData.reduce((s, r) => {
        const v = col.computed ? getEndingBal(r) : (parseInt(r[col.key]) || 0);
        return s + v;
      }, 0);
      el.textContent = (total >= 0 ? '+' : '') + total.toLocaleString();
      el.classList.toggle('active', !!colFilters[col.key]);
      el.onclick = () => toggleColFilter(col.key);
    });
  }

  function toggleColFilter(key) {
    if (colFilters[key]) delete colFilters[key];
    else colFilters[key] = true;
    applyLocal();
  }

  const _timers = {};
  function debounce(fn, ms) {
    return function () { clearTimeout(_timers[fn]); _timers[fn] = setTimeout(fn, ms); };
  }

  function fd(v) { if (!v) return '�'; return String(v).split('T')[0]; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '�' : n.toLocaleString(); }
  function signed(v) { const n = Number(v) || 0; if (n > 0) return '+' + n.toLocaleString(); if (n < 0) return '-' + Math.abs(n).toLocaleString(); return '0'; }

  function apiUrl(path) { return location.origin + path; }
  async function fetchJson(url, opts) {
    const r = await fetch(url, opts);
    if (!r.ok) throw new Error(r.statusText);
    return r.json();
  }

  // -- Inventory math --
  function replacementBalanceContrib(r) {
    return (parseInt(r.repl_qty || 0)) + (parseInt(r.repl_return_qty || 0)) - (parseInt(r.repl_reimb_qty || 0));
  }

  function getEndingBal(r) {
    const rc  = parseInt(r.receipt_qty      || 0);
    const so  = parseInt(r.sold_qty         || 0);
    const ret = parseInt(r.return_qty       || 0);
    const rb  = parseInt(r.reimb_qty        || 0);
    const rmv = parseInt(r.removal_rcpt_qty || 0);
    const gn  = parseInt(r.gnr_qty          || 0);
    const fc  = parseInt(r.fc_net_qty       || 0);
    return rc - so + ret - rb - rmv + replacementBalanceContrib(r) - gn + fc;
  }

  function fbaSnapshotBalance(r) {
    if (r.fba_ending_balance === null || r.fba_ending_balance === undefined || r.fba_ending_balance === '') return null;
    return parseInt(r.fba_ending_balance, 10) || 0;
  }

  function isFnskuInStockFba(r)   { const b = fbaSnapshotBalance(r); return b !== null && b > 0; }
  function isFnskuOutOfStockFba(r){ const b = fbaSnapshotBalance(r); return b !== null && b <= 0; }

  function rowReconStatus(r) {
    const receipts    = parseInt(r.receipt_qty      || 0);
    const sold        = parseInt(r.sold_qty         || 0);
    const returns     = parseInt(r.return_qty       || 0);
    const reimb       = parseInt(r.reimb_qty        || 0);
    const removalRcpt = parseInt(r.removal_rcpt_qty || 0);
    const gnr         = parseInt(r.gnr_qty          || 0);
    const fcNet       = parseInt(r.fc_net_qty       || 0);
    const replContrib = replacementBalanceContrib(r);
    const endingBal   = receipts - sold + returns - reimb - removalRcpt + replContrib - gnr + fcNet;
    const fbaHasData  = r.fba_ending_balance !== null && r.fba_ending_balance !== undefined && r.fba_ending_balance !== '';
    if (!fbaHasData) return 'No Snapshot';
    const fbaBal  = parseInt(r.fba_ending_balance);
    const variance = fbaBal - endingBal;
    if (variance === 0) return 'Matched';
    if (variance > 0)   return 'Over';
    if (reimb > 0 && reimb >= Math.abs(variance)) return 'Reimbursed';
    return 'Take Action';
  }

  function rowMatchesStatusFilter(r, st) {
    if (!st) return true;
    if (st === 'Out of FNSKUs') return isFnskuOutOfStockFba(r);
    const rowSt = rowReconStatus(r);
    if (st === 'Matched') return rowSt === 'Matched' || rowSt === 'Reimbursed';
    return rowSt === st;
  }

  function statusBadge(r) {
    const s = rowReconStatus(r);
    const fbaOut = isFnskuOutOfStockFba(r);
    let disp = s;
    if (fbaOut && (s === 'Matched' || s === 'Reimbursed')) disp = 'Out of Stock';
    const map = {
      'Matched':     ['badge-green',  'Matched'],
      'Reimbursed':  ['badge-green',  'Reimbursed'],
      'Over':        ['badge-blue',   'Over'],
      'Take Action': ['badge-red',    'Take Action'],
      'No Snapshot': ['badge-gray',   'No Snapshot'],
      'Out of Stock':['badge-orange', 'Out of Stock'],
    };
    const [cls, label] = map[disp] || ['badge-gray', disp];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  // -- Load --
  async function loadRecon() {
    const sr = document.getElementById('f-search')?.value;
    const p  = new URLSearchParams();
    if (sr) p.set('search', sr);

    const el = document.getElementById('fr-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetchJson(apiUrl('/api/full-recon' + (p.toString() ? '?' + p : '')));
      if (d.error) throw new Error(d.error);
      allData = d.rows || [];
      colFilters = {};
      updateKPIs();
      applyLocal();
    } catch (e) {
      window.Toast?.show('Failed to load full recon: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function updateKPIs() {
    const totalShipped  = allData.reduce((s, r) => s + (parseInt(r.shipped_qty) || 0), 0);
    const totalRecv     = allData.reduce((s, r) => s + (parseInt(r.receipt_qty) || 0), 0);
    const totalShortage = allData.reduce((s, r) => s + (parseInt(r.shortage_qty) || 0), 0);
    const totalEnding   = allData.reduce((s, r) => s + getEndingBal(r), 0);
    const totalFba      = allData.reduce((s, r) => {
      const b = fbaSnapshotBalance(r);
      return b !== null ? s + b : s;
    }, 0);
    let fnskuInStock = 0, fnskuOutStock = 0;
    allData.forEach(r => {
      if (isFnskuInStockFba(r)) fnskuInStock++;
      else if (isFnskuOutOfStockFba(r)) fnskuOutStock++;
    });
    let cMatched = 0, cOver = 0, cAction = 0, cNoSnap = 0;
    allData.forEach(r => {
      const st = rowReconStatus(r);
      if (st === 'Matched' || st === 'Reimbursed') cMatched++;
      else if (st === 'Over')        cOver++;
      else if (st === 'Take Action') cAction++;
      else                           cNoSnap++;
    });
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('k1-qty-a', allData.length.toLocaleString());
    set('k1-qty-b', totalShipped.toLocaleString());
    set('k2-qty-a', totalRecv.toLocaleString());
    set('k2-qty-b', signed(totalShortage));
    set('k3-qty-a', signed(totalEnding));
    set('k3-qty-b', signed(totalFba));
    set('k4-qty-a', fnskuInStock.toLocaleString());
    set('k4-qty-b', fnskuOutStock.toLocaleString());
    set('k-matched',   cMatched.toLocaleString());
    set('k-over',      cOver.toLocaleString());
    set('k-action',    cAction.toLocaleString());
    set('k-out-fnsku', fnskuOutStock.toLocaleString());
    set('k-nosnap',    cNoSnap.toLocaleString());
  }

  function applyLocal() {
    const st = document.getElementById('f-status')?.value     || '';
    const dm = document.getElementById('f-days-min')?.value.trim();
    const dx = document.getElementById('f-days-max')?.value.trim();
    const minDays = dm ? parseInt(dm) : null;
    const maxDays = dx ? parseInt(dx) : null;

    filteredData = allData.filter(r => {
      if (st && !rowMatchesStatusFilter(r, st)) return false;
      if (minDays !== null || maxDays !== null) {
        const dn = r.days_recv_to_sale !== null && r.days_recv_to_sale !== undefined && r.days_recv_to_sale !== ''
          ? parseInt(r.days_recv_to_sale) : null;
        if (dn === null) return false;
        if (minDays !== null && dn < minDays) return false;
        if (maxDays !== null && dn > maxDays) return false;
      }
      return true;
    });

    Object.keys(colFilters).forEach(key => {
      filteredData = filteredData.filter(r => {
        const v = key === '_ending_bal' ? getEndingBal(r) : (parseInt(r[key]) || 0);
        return v !== 0;
      });
    });

    const cnt = document.getElementById('fr-count');
    if (cnt) cnt.textContent = filteredData.length.toLocaleString() + ' FNSKUs';

    renderTable();
  }

  function setStatusFilter(val) {
    const sel = document.getElementById('f-status');
    if (!sel) return;
    sel.value = sel.value === val ? '' : val;
    applyLocal();
  }

  function renderTable() {
    const el = document.getElementById('fr-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!filteredData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">
        No full recon data � upload reports to begin reconciliation
      </div>`;
      return;
    }
    const data = filteredData.map((r, i) => ({
      ...r,
      _ending_bal: getEndingBal(r),
      _status:     statusBadge(r),
      _row_idx:    i,
    }));
    window.VTable.create(el, {
      columns: [
        { key: 'msku', label: 'MSKU / Title', width: 180,
          render: (v, row) => {
            const idx = row._row_idx;
            return '<div style="cursor:pointer" onclick="window.__frOpenDrawer(' + idx + ')">'
              + '<div style="font-weight:600;font-size:12px;color:var(--accent);font-family:monospace;text-decoration:underline dotted">' + escH(v || '—') + '</div>'
              + '<div style="font-size:10px;color:var(--text3);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + escAttr(row.title || '') + '">' + escH(row.title || '') + '</div>'
              + '</div>';
          }
        },
        { key: 'asin',  label: 'ASIN',  width: 110 },
        { key: 'fnsku', label: 'FNSKU', width: 120 },
        { key: 'days_recv_to_sale', label: 'Days', width: 70, numeric: true,
          render: (v, r) => {
            const dt = '<b>Received</b>: ' + (fmtDate(r.latest_recv_date)||'—') + '<br><b>Last Sale</b>: ' + (fmtDate(r.latest_sale_date)||'—');
            if (v == null || v === '') return dataTip(dt, '<span style="color:var(--text3);font-size:10px">—</span>');
            return dataTip(dt, '<span style="color:var(--accent);font-weight:600;font-family:monospace">' + parseInt(v) + ' d</span>');
          }
        },
        { key: 'shipped_qty', label: 'Shipped', width: 80, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            let details = r.shipment_details;
            if (typeof details === 'string') { try { details = JSON.parse(details); } catch(e) { details = []; } }
            if (!details || !details.length) return '<span style="font-family:monospace">' + (qty ? qty.toLocaleString() : '—') + '</span>';
            const rows = details.map(d => {
              const sid = d.shipment_id || '—';
              const sdt = d.ship_date ? fmtDateShort(d.ship_date) : '—';
              const st  = d.status || 'Unknown';
              const stColor = st.toLowerCase().includes('closed') || st.toLowerCase().includes('received') ? '#10b981'
                            : st.toLowerCase().includes('cancel') ? '#ef4444' : '#f59e0b';
              return '<b style="color:' + stColor + '">' + escH(sid) + '</b>'
                   + ' <span style="color:#94a3b8;font-size:10px">' + escH(sdt) + ' · ' + escH(st) + '</span>';
            });
            return dataTip('<b>Shipments (' + details.length + ')</b><hr>' + rows.join('<br>'),
              '<span style="font-family:monospace;font-weight:700">' + qty.toLocaleString() + '</span>');
          }
        },
        { key: 'receipt_qty', label: 'Receipts', width: 80, numeric: true, render: v => fn(v) },
        { key: 'shortage_qty', label: 'Shortage', width: 80, numeric: true,
          render: (v, r) => {
            const shortage = parseInt(v || 0);
            const _reimb = parseInt(r.reimb_qty || 0);
            const _cReim = parseInt(r.case_reimb_qty || 0);
            const _adj   = parseInt(r.adj_qty || 0);
            const _cStat = (r.case_statuses || '').toLowerCase();
            const _pend  = Math.max(0, shortage - _reimb);
            const _effP  = Math.max(0, _pend - _cReim - Math.max(0, _adj));
            let reconStatus, reconColor;
            if (shortage <= 0)                                                    { reconStatus = '✓ Matched';    reconColor = '#10b981'; }
            else if (_reimb + _cReim >= shortage)                                 { reconStatus = '💰 Reimbursed'; reconColor = '#10b981'; }
            else if (_cStat.includes('raised') || _cStat.includes('pending'))    { reconStatus = '⚖️ Case Raised'; reconColor = '#f59e0b'; }
            else if (_adj > 0 || _effP < _pend)                                  { reconStatus = '↻ In Progress'; reconColor = '#8b5cf6'; }
            else                                                                   { reconStatus = '⚠️ Case Needed'; reconColor = '#ef4444'; }
            const tipLines = [];
            if (r.shipment_statuses) tipLines.push('<b>Shipment Status</b><br>' + escH(r.shipment_statuses));
            tipLines.push('<b>Recon Status</b>: <span style="color:' + reconColor + ';font-weight:700">' + reconStatus + '</span>');
            tipLines.push('<hr>');
            tipLines.push('<b>Reimb. Qty</b>: ' + _reimb);
            tipLines.push('<b>Cases Raised</b>: ' + (parseInt(r.case_count)||0) + (r.case_statuses ? ' <span style="color:#94a3b8">(' + escH(r.case_statuses) + ')</span>' : ''));
            tipLines.push('<b>Case Reimb.</b>: ' + _cReim + ' / $' + parseFloat(r.case_reimb_amt||0).toFixed(2));
            tipLines.push('<b>Adjusted</b>: ' + _adj + ' (' + (parseInt(r.adj_count)||0) + ' entries)');
            if (shortage === 0) return '<span style="color:var(--green)">0</span>';
            return '<span data-tip="' + escAttr(tipLines.join('<br>')) + '" onmouseover="showTip(event,this)" onmousemove="moveTip(event)" onmouseout="hideTip()" style="color:var(--red);font-weight:700;cursor:help">' + shortage + '</span>';
          }
        },
        { key: 'sold_qty', label: 'Sold', width: 75, numeric: true, render: v => fn(v) },
        { key: 'return_qty', label: 'Returns', width: 75, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            if (!qty) return '<span style="color:var(--text3)">—</span>';
            let details = r.return_details;
            if (typeof details === 'string') { try { details = JSON.parse(details); } catch(e) { details = []; } }
            const tipLines = ['<b>Returns Breakdown</b>', '<hr>'];
            if (Array.isArray(details)) {
              details.forEach(d => {
                tipLines.push('<b style="color:#f1f5f9">Qty ' + d.qty + '</b>'
                  + (d.status && d.status !== '—' ? ' · <span style="color:#94a3b8">' + escH(d.status) + '</span>' : '')
                  + (d.disp   && d.disp   !== '—' ? '<br><span style="color:#94a3b8;font-size:10px">Disp: </span>'   + escH(d.disp)   : '')
                  + (d.reason && d.reason !== '—' ? '<br><span style="color:#94a3b8;font-size:10px">Reason: </span>' + escH(d.reason) : ''));
              });
            }
            return dataTip(tipLines.join('<br>'), '<span style="color:var(--orange);font-weight:700">' + qty.toLocaleString() + '</span>');
          }
        },
        { key: 'reimb_qty', label: 'Reimb.', width: 70, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            const amt = parseFloat(r.reimb_amt || 0);
            if (!qty && !amt) return '<span style="color:var(--text3)">—</span>';
            let details = r.reimb_details;
            if (typeof details === 'string') { try { details = JSON.parse(details); } catch(e) { details = []; } }
            const tipLines = ['<b>Reimbursements</b>',
              '<span style="color:#94a3b8;font-size:10px">Includes Lost_Inbound and warehouse/outbound loss types</span>', '<hr>'];
            if (Array.isArray(details)) {
              details.forEach((d, i) => {
                if (i >= 6) { tipLines.push('…and ' + (details.length - 6) + ' more'); return; }
                tipLines.push('<b>$' + parseFloat(d.amount||0).toFixed(2) + '</b>'
                  + (d.reason ? ' · <span style="color:#94a3b8">' + escH(d.reason) + '</span>' : '')
                  + (d.order_id && d.order_id !== '-' ? '<br><span style="color:#94a3b8;font-size:10px">Order: </span>' + escH(d.order_id) : ''));
              });
            }
            if (amt) tipLines.push('<hr><b>Total: $' + amt.toFixed(2) + '</b>');
            return dataTip(tipLines.join('<br>'), '<span style="color:var(--green);font-weight:700">' + qty.toLocaleString() + '</span>');
          }
        },
        { key: 'removal_rcpt_qty', label: 'Removal Rcpt', width: 95, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            if (!qty) return '<span style="color:var(--text3)">—</span>';
            let details = r.removal_rcpt_details;
            if (typeof details === 'string') { try { details = JSON.parse(details); } catch(e) { details = []; } }
            const tipLines = ['<b>Removal Receipts</b>',
              '<span style="color:#94a3b8;font-size:10px">Physically received at warehouse</span>', '<hr>'];
            if (Array.isArray(details)) {
              details.forEach(d => {
                const dt = d.date ? fmtDateShort(d.date) : null;
                tipLines.push('<b style="color:#f1f5f9">Qty ' + d.qty + '</b>'
                  + (dt ? ' · <span style="color:#94a3b8;font-size:10px">' + dt + '</span>' : '')
                  + (d.order_id && d.order_id !== '—' ? '<br><span style="color:#94a3b8;font-size:10px">Order: </span>' + escH(d.order_id) : ''));
              });
            }
            return dataTip(tipLines.join('<br>'), '<span style="color:var(--accent);font-weight:700">' + qty.toLocaleString() + '</span>');
          }
        },
        { key: 'repl_qty', label: 'Replacements', width: 100, numeric: true,
          render: (v, r) => {
            const replOut  = Math.abs(parseInt(v || 0));
            const retQty   = parseInt(r.repl_return_qty  || 0);
            const reimbQty = parseInt(r.repl_reimb_qty   || 0);
            const reimbAmt = parseFloat(r.repl_reimb_amt || 0);
            if (!replOut && !retQty && !reimbQty) return '<span style="color:var(--text3)">—</span>';
            const status = r.repl_status || 'Pending';
            const statusColor = status === 'Covered' ? '#10b981' : status === 'Partial' ? '#f59e0b' : '#ef4444';
            const tipLines = ['<b>Replacements</b>',
              '<span style="color:#94a3b8;font-size:10px">Units sent as replacements (matched by MSKU)</span>', '<hr>',
              replOut  ? '<b>Replaced (out):</b> <span style="color:#ef4444;font-weight:700">−' + replOut + '</span>'  : '',
              retQty   ? '<b>Returns:</b> <span style="color:#10b981;font-weight:700">+' + retQty + '</span>'           : '',
              reimbQty ? '<b>Reimb Qty:</b> <span style="color:#10b981">+' + reimbQty + '</span>'                      : '',
              reimbAmt ? '<b>Reimb Amt:</b> <span style="color:#10b981">$' + reimbAmt.toFixed(2) + '</span>'           : '',
              '<hr><b>Status:</b> <span style="color:' + statusColor + ';font-weight:700">' + escH(status) + '</span>',
            ].filter(Boolean);
            const display = replOut ? '<span style="color:var(--red);font-weight:700">−' + replOut + '</span>' : '<span style="color:var(--text3)">—</span>';
            return dataTip(tipLines.join('<br>'), '<span>' + display + '</span>');
          }
        },
        { key: 'gnr_qty', label: 'GNR Qty', width: 75, numeric: true,
          render: (v, r) => {
            const qty = parseInt(v || 0);
            if (!qty) return '<span style="color:var(--text3)">—</span>';
            const succ = parseInt(r.gnr_succeeded || 0);
            const fail = parseInt(r.gnr_failed    || 0);
            const tipLines = ['<b>Grade & Resell</b>',
              '<span style="color:#94a3b8;font-size:10px">Units processed through GNR</span>', '<hr>',
              '<b>Total: ' + qty + '</b> · <span style="color:#10b981">' + succ + ' succeeded</span>'
                + (fail > 0 ? ' · <span style="color:#ef4444">' + fail + ' failed</span>' : ''),
            ];
            return dataTip(tipLines.join('<br>'), '<span style="color:var(--orange);font-weight:700">' + qty.toLocaleString() + '</span>');
          }
        },
        { key: 'fc_net_qty', label: 'FC Transfer', width: 85, numeric: true,
          render: (v, r) => {
            const net = parseInt(v || 0);
            if (r.fc_net_qty == null && r.fc_net_qty !== 0) return '<span style="color:var(--text3)">—</span>';
            if (net === 0 && !r.fc_event_days) return '<span style="color:var(--text3)">—</span>';
            const fcIn  = parseInt(r.fc_in_qty  || 0);
            const fcOut = parseInt(r.fc_out_qty || 0);
            const status = r.fc_status || '—';
            const statusColor = status === 'Balanced' ? '#10b981' : status === 'Excess' ? '#3b82f6' : status === 'Take Action' ? '#ef4444' : '#f59e0b';
            const tipLines = ['<b>FC Transfer</b>', '<hr>',
              '<b>In:</b> <span style="color:#10b981">+' + fcIn + '</span>',
              '<b>Out:</b> <span style="color:#ef4444">−' + fcOut + '</span>',
              '<b>Net:</b> <span style="font-weight:700">' + (net >= 0 ? '+' : '') + net + '</span>',
              '<hr><b>Status:</b> <span style="color:' + statusColor + ';font-weight:700">' + escH(status) + '</span>',
            ];
            const color = net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : 'var(--text3)';
            return dataTip(tipLines.join('<br>'), '<span style="color:' + color + ';font-weight:700">' + (net > 0 ? '+' : '') + net + '</span>');
          }
        },
        { key: '_ending_bal', label: 'Ending Balance', width: 110, numeric: true,
          render: (v, r) => {
            const receipts = parseInt(r.receipt_qty      || 0);
            const sold     = parseInt(r.sold_qty         || 0);
            const returns  = parseInt(r.return_qty       || 0);
            const reimb    = parseInt(r.reimb_qty        || 0);
            const remRcpt  = parseInt(r.removal_rcpt_qty || 0);
            const gnr      = parseInt(r.gnr_qty          || 0);
            const fcNet    = parseInt(r.fc_net_qty       || 0);
            const replC    = (parseInt(r.repl_qty||0)) + (parseInt(r.repl_return_qty||0)) - (parseInt(r.repl_reimb_qty||0));
            const bal      = receipts - sold + returns - reimb - remRcpt + replC - gnr + fcNet;
            const tipLines = ['<b>Ending Balance Breakdown</b>', '<hr>',
              '<span style="color:#94a3b8">Receipts</span>     <b style="color:#10b981">+' + receipts + '</b>',
              '<span style="color:#94a3b8">Sold</span>         <b style="color:#ef4444">−' + sold + '</b>',
              '<span style="color:#94a3b8">Returns</span>      <b style="color:#10b981">+' + returns + '</b>',
              '<span style="color:#94a3b8">Reimb.</span>       <b style="color:#ef4444">−' + reimb + '</b>',
              '<span style="color:#94a3b8">Removal Rcpt</span> <b style="color:#ef4444">−' + remRcpt + '</b>',
              '<span style="color:#94a3b8">Replacements</span> <b>' + (replC >= 0 ? '+' : '') + replC + '</b>',
              '<span style="color:#94a3b8">GNR</span>          <b style="color:#ef4444">−' + gnr + '</b>',
              '<span style="color:#94a3b8">FC Transfer</span>  <b>' + (fcNet >= 0 ? '+' : '') + fcNet + '</b>',
              '<hr><b>= ' + (bal >= 0 ? '+' : '') + bal + '</b>',
            ];
            const color = bal > 0 ? 'var(--green)' : bal < 0 ? 'var(--red)' : 'var(--text3)';
            return dataTip(tipLines.join('<br>'), '<span style="color:' + color + ';font-weight:700">' + (bal > 0 ? '+' : '') + bal + '</span>');
          }
        },
        { key: 'fba_ending_balance', label: 'FBA Balance', width: 95, numeric: true,
          render: (v, r) => {
            if (v == null || v === '') return '<span style="color:var(--text3)">—</span>';
            const bal = parseInt(v);
            const dt  = r.fba_summary_date ? fmtDate(r.fba_summary_date) : null;
            const tipHtml = '<b>FBA Ending Balance</b><br>'
              + '<span style="color:#94a3b8;font-size:10px">SELLABLE · Latest Snapshot</span><hr>'
              + (dt ? '<b>Summary Date:</b> ' + dt + '<br>' : '')
              + '<b>Ending Balance:</b> <span style="color:' + (bal>0?'#10b981':bal<0?'#ef4444':'#94a3b8') + ';font-weight:700">' + (bal>0?'+':'') + bal + '</span>';
            const color = bal > 0 ? 'var(--green)' : bal < 0 ? 'var(--red)' : 'var(--text3)';
            return dataTip(tipHtml, '<span style="color:' + color + ';font-weight:700">' + (bal>0?'+':'') + bal + '</span>');
          }
        },
        { key: 'fba_adj_total', label: 'Adjustments', width: 95, numeric: true,
          render: (v, r) => {
            if (v == null || v === '') return '<span style="color:var(--text3)">—</span>';
            const total = parseInt(v || 0);
            const vr = parseInt(r.fba_vendor_returns || 0);
            const fo = parseInt(r.fba_found         || 0);
            const lo = parseInt(r.fba_lost          || 0);
            const da = parseInt(r.fba_damaged       || 0);
            const di = parseInt(r.fba_disposed      || 0);
            const tipHtml = '<b>FBA Adjustments</b><br>'
              + '<span style="color:#94a3b8;font-size:10px">From latest FBA Summary snapshot</span><hr>'
              + '<b>Vendor Returns:</b> ' + vr + '<br>'
              + '<b>Found:</b> <span style="color:#10b981">' + fo + '</span><br>'
              + '<b>Lost:</b> <span style="color:#ef4444">'  + lo + '</span><br>'
              + '<b>Damaged:</b> <span style="color:#ef4444">' + da + '</span><br>'
              + '<b>Disposed:</b> ' + di;
            const color = total > 0 ? 'var(--green)' : total < 0 ? 'var(--red)' : 'var(--text3)';
            return dataTip(tipHtml, '<span style="color:' + color + ';font-weight:700">' + (total>0?'+':'') + total + '</span>');
          }
        },
        { key: 'adj_qty', label: 'Manual Adj', width: 80, numeric: true,
          render: (v, r) => {
            const adjQty   = parseInt(v           || 0);
            const adjCount = parseInt(r.adj_count || 0);
            if (adjQty === 0) return '<span style="color:var(--text3)">—</span>';
            const tipHtml = '<b>Manual Adjustments</b><hr>'
              + '<b>Count:</b> ' + adjCount + ' entr' + (adjCount === 1 ? 'y' : 'ies') + '<br>'
              + '<b>Net Adj Qty:</b> <span style="font-family:monospace;font-weight:700;color:' + (adjQty>=0?'#10b981':'#ef4444') + '">' + (adjQty>0?'+':'') + adjQty + '</span>';
            const color = adjQty > 0 ? 'var(--green)' : 'var(--red)';
            return dataTip(tipHtml, '<span style="color:' + color + ';font-weight:700">' + (adjQty>0?'+':'') + adjQty + '</span>');
          }
        },
        { key: '_status',  label: 'Status',  width: 130, sortable: false, render: v => v },
        { key: 'remarks',  label: 'Remarks', width: 160 },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Remarks save --
  async function saveRemark() {
    const r = _currentDrawerRow;
    if (!r) return;
    const text = document.getElementById('drawer-remarks')?.value || '';
    const fk   = (r.fnsku || '').trim();
    if (!fk) { window.Toast?.show('Missing FNSKU', 'error'); return; }
    try {
      await fetchJson(apiUrl('/api/full-recon-remarks'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fnsku: fk, remarks: text }),
      });
      const row = allData.find(d => (d.fnsku || '').trim() === fk);
      if (row) row.remarks = text;
      r.remarks = text;
      window.Toast?.show('? Remarks saved', 'success');
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  // -- Row drawer --
  function openRowDrawer(idx) {
    const r = filteredData[idx];
    if (!r) return;
    _currentDrawerRow = r;
    const shortage   = parseInt(r.shortage_qty || 0);
    const days       = r.days_recv_to_sale != null ? parseInt(r.days_recv_to_sale) : null;
    const shortColor = shortage > 0 ? 'var(--red)' : shortage < 0 ? 'var(--orange)' : 'var(--green)';
    const endingBal  = getEndingBal(r);
    const fba        = fbaSnapshotBalance(r);

    const body = `
      <div class="drow">
        <div class="dkpi">
          <div class="dkpi-val">${fn(r.shipped_qty)}</div>
          <div class="dkpi-lbl">Shipped</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val">${fn(r.receipt_qty)}</div>
          <div class="dkpi-lbl">Receipts</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val" style="color:${shortColor}">${fn(r.shortage_qty)}</div>
          <div class="dkpi-lbl">Shortage</div>
        </div>
      </div>
      <div class="drow">
        <div class="dkpi">
          <div class="dkpi-val">${fn(r.sold_qty)}</div>
          <div class="dkpi-lbl">Sold</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val" style="color:${endingBal>=0?'var(--green)':'var(--red)'}">
            ${endingBal >= 0 ? '+' : ''}${endingBal.toLocaleString()}
          </div>
          <div class="dkpi-lbl">Ending Balance</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val" style="color:var(--accent)">
            ${fba !== null ? fba.toLocaleString() : '�'}
          </div>
          <div class="dkpi-lbl">FBA Balance</div>
        </div>
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">Item Details</div>
        <div class="dl-row">
          <span class="dl-lbl">FNSKU</span>
          <span class="dl-val" style="font-family:monospace">${window.escH(r.fnsku || '�')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">ASIN</span>
          <span class="dl-val" style="font-family:monospace">${window.escH(r.asin || '�')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Title</span>
          <span class="dl-val" style="font-weight:400;max-width:260px;text-align:right">
            ${window.escH(r.title || '�')}
          </span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Days (Recv?Sale)</span>
          <span class="dl-val">${days !== null ? days + ' days' : '�'}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Latest Recv</span>
          <span class="dl-val">${fd(r.latest_recv_date)}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Latest Sale</span>
          <span class="dl-val">${fd(r.latest_sale_date)}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Status</span>
          <span class="dl-val">${statusBadge(r)}</span>
        </div>
        ${shortage > 0 ? `<div class="dl-row">
          <span class="dl-lbl">Shortage Note</span>
          <span class="dl-val" style="color:var(--red)">
            ${shortage} units shipped but not confirmed received by Amazon
          </span>
        </div>` : ''}
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:6px">Remarks</div>
        <textarea id="drawer-remarks" rows="3"
          style="width:100%;font-size:12px;border:1px solid var(--border);
            border-radius:6px;padding:8px;resize:vertical;font-family:var(--font)"
          placeholder="Add remarks for this FNSKU...">${window.escH(r.remarks || '')}</textarea>
        <button onclick="window.__frSaveRemark()"
          style="margin-top:6px;padding:6px 14px;background:var(--accent);color:#fff;
            border:none;border-radius:6px;font-size:12px;cursor:pointer">
          Save Remarks
        </button>
      </div>
    `;
    window.openDrawer(r.msku || '�', (r.asin || '') + (r.fnsku ? ' � ' + r.fnsku : ''), body);
  }

  // -- Render --
  function render(container) {
    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Full Inventory Recon</div>
          <div class="page-sub">Complete FNSKU-level reconciliation � Shipped ? Received ? Sold ? Returns ? Balance vs FBA Snapshot</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__frRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI Row 1: Overview slash cards -->
      <div class="stat-grid" style="margin-bottom:10px">
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">FNSKUs / Total Shipped</div>
          <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:4px">
            <span class="stat-value" id="k1-qty-a" style="font-size:22px">�</span>
            <span style="color:var(--text3)">/</span>
            <span class="stat-value" id="k1-qty-b" style="font-size:22px">�</span>
          </div>
        </div>
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">Total Received / Shortage</div>
          <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:4px">
            <span class="stat-value" id="k2-qty-a" style="font-size:22px;color:var(--green)">�</span>
            <span style="color:var(--text3)">/</span>
            <span class="stat-value" id="k2-qty-b" style="font-size:22px;color:var(--red)">�</span>
          </div>
        </div>
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">Ending Balance / FBA Balance</div>
          <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:4px">
            <span class="stat-value" id="k3-qty-a" style="font-size:22px">�</span>
            <span style="color:var(--text3)">/</span>
            <span class="stat-value" id="k3-qty-b" style="font-size:22px">�</span>
          </div>
        </div>
        <div class="stat-card" style="text-align:center">
          <div class="stat-label">FNSKUs In Stock / Out of Stock</div>
          <div style="display:flex;align-items:baseline;justify-content:center;gap:6px;margin-top:4px">
            <span class="stat-value" id="k4-qty-a" style="font-size:22px;color:var(--green)">�</span>
            <span style="color:var(--text3)">/</span>
            <span class="stat-value" id="k4-qty-b" style="font-size:22px;color:var(--orange)">�</span>
          </div>
        </div>
      </div>

      <!-- KPI Row 2: Status counts (clickable) -->
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card" style="cursor:pointer;border-left:3px solid var(--green)"  onclick="window.__frSetStatus('Matched')">
          <div class="stat-label">Matched</div>
          <div class="stat-value" id="k-matched" style="color:var(--green)">�</div>
        </div>
        <div class="stat-card" style="cursor:pointer;border-left:3px solid var(--accent)" onclick="window.__frSetStatus('Over')">
          <div class="stat-label">Over</div>
          <div class="stat-value" id="k-over" style="color:var(--accent)">�</div>
        </div>
        <div class="stat-card" style="cursor:pointer;border-left:3px solid var(--red)"    onclick="window.__frSetStatus('Take Action')">
          <div class="stat-label">Take Action</div>
          <div class="stat-value" id="k-action" style="color:var(--red)">�</div>
        </div>
        <div class="stat-card" style="cursor:pointer;border-left:3px solid var(--orange)" onclick="window.__frSetStatus('Out of FNSKUs')">
          <div class="stat-label">Out of FNSKUs</div>
          <div class="stat-value" id="k-out-fnsku" style="color:var(--orange)">�</div>
        </div>
        <div class="stat-card" style="cursor:pointer;border-left:3px solid var(--text3)"  onclick="window.__frSetStatus('No Snapshot')">
          <div class="stat-label">No Snapshot</div>
          <div class="stat-value" id="k-nosnap" style="color:var(--text3)">�</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="filter-bar" style="margin-bottom:12px">
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Recon Status</div>
          <select id="f-status" style="height:32px;min-width:170px" onchange="window.__frApplyLocal()">
            <option value="">All</option>
            <option value="Matched">Matched</option>
            <option value="Over">Over</option>
            <option value="Take Action">Take Action</option>
            <option value="Out of FNSKUs">Out of FNSKUs</option>
            <option value="No Snapshot">No Snapshot</option>
          </select>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Days Min�Max (recv ? sale)</div>
          <div style="display:flex;align-items:center;gap:4px">
            <input type="number" id="f-days-min" placeholder="Min" min="0" style="height:32px;width:70px" oninput="window.__frApplyLocal()">
            <span style="color:var(--text3)">�</span>
            <input type="number" id="f-days-max" placeholder="Max" min="0" style="height:32px;width:70px" oninput="window.__frApplyLocal()">
          </div>
        </div>
        <div style="flex:1;min-width:200px">
          <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / FNSKU / Title</div>
          <input id="f-search" placeholder="Search�" style="height:32px;width:100%" oninput="window.__frDbLoad()">
        </div>
        <div style="align-self:flex-end;display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="window.__frClear()">? Clear</button>
          <span style="font-size:11px;color:var(--text3);padding:8px 4px" id="fr-count">�</span>
        </div>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="card-header"><span>Full Inventory Reconciliation � by FNSKU</span></div>
        <div style="padding:12px" id="fr-vtable">
          <div class="skeleton" style="height:200px;border-radius:8px"></div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const frV = document.getElementById('fr-vtable');
    if (frV && !frV._frVtableTotalsBound) {
      frV._frVtableTotalsBound = true;
      frV.addEventListener('vtable:rendered', updateColTotals);
    }

    window.__frRefresh    = loadRecon;
    window.__frApplyLocal = applyLocal;
    window.__frDbLoad     = debounce(loadRecon, 400);
    window.__frSetStatus  = setStatusFilter;
    window.__frOpenDrawer  = openRowDrawer;
    window.__frSaveRemark  = saveRemark;
    window.__frClear      = () => {
      ['f-status','f-days-min','f-days-max','f-search'].forEach(id => {
        const e = document.getElementById(id); if (e) e.value = '';
      });
      loadRecon();
    };

    loadRecon();
  }

  function refresh() { loadRecon(); }

  window.__viewExport = { render, refresh };
})();
