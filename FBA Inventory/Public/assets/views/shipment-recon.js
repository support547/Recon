/* ====================================================
   Shipment Reconciliation View
   APIs: /shipment-recon-data, /data/fba_receipts,
         /data/reimbursements, /case-reimb-summary,
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

  let allRows = [], filteredRows = [], actionCache = {};
  let colFilters = {};
  let curView = 'sku';   // 'sku' | 'shipment'
  const COL_TOTALS = [
    { key: 'shipped_qty'  },
    { key: 'received_qty' },
    { key: 'shortage'     },
    { key: 'reimb_qty'    },
    { key: 'pending'      },
  ];

  function updateColTotals() {
    COL_TOTALS.forEach(col => {
      const el = document.getElementById('ct-' + col.key);
      if (!el) return;
      const total = filteredRows.reduce((s, r) => s + (parseInt(r[col.key]) || 0), 0);
      el.textContent = (total >= 0 ? '+' : '') + total.toLocaleString();
      el.classList.toggle('active', !!colFilters[col.key]);
      el.onclick = () => toggleColFilter(col.key);
    });
  }

  function toggleColFilter(key) {
    if (colFilters[key]) delete colFilters[key];
    else colFilters[key] = true;
    applyFilters();
  }

  // -- Formatters --
  function fd(v) { if (!v) return '?'; const d = new Date(v); return isNaN(d) ? '?' : d.toISOString().split('T')[0]; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '?' : n.toLocaleString(); }
  function cl(s) { return (s || '').toString().trim().replace(/['"]/g, ''); }

  function statusBadge(r, ca) {
    const approved = ca.case_approved || 0;
    const totalActioned = (approved || ca.case_raised || 0) + Math.max(0, ca.adj_qty || 0);
    const effectivePending = Math.max(0, r.pending - totalActioned);
    if (r.status === 'excess')  return `<span class="badge badge-blue">Excess</span>`;
    if (r.status === 'matched') return `<span class="badge badge-green">Matched</span>`;
    if (r.shortage === 0)       return `<span class="badge badge-green">Matched</span>`;
    if (approved > 0 || approved >= r.shortage) return `<span class="badge badge-green">Reimbursed</span>`;
    if (effectivePending <= 0)  return `<span class="badge badge-green">Action Taken</span>`;
    if (ca.case_status === 'raised' || ca.case_status === 'pending') return `<span class="badge badge-orange">Case Raised</span>`;
    if (totalActioned > 0)      return `<span class="badge badge-blue">In Progress</span>`;
    if (r.status === 'partial') return `<span class="badge badge-orange">Partial Reimb</span>`;
    return `<span class="badge badge-red">Take Action</span>`;
  }

  // -- Load everything --
  async function loadAll() {
    const wrap = document.getElementById('sh-vtable');
    if (wrap) { wrap.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`; }

    try {
      const [caseSum, adjs] = await Promise.all([
        fetch(`${API}/case-reimb-summary?recon_type=shipment`).then(r => r.json()),
        fetch(`${API}/manual-adjustments`).then(r => r.json()),
      ]);
      buildActionCache(caseSum, adjs);
    } catch (e) { console.warn('action cache:', e.message); }

    await loadShipmentDropdown();
    await loadRecon();
  }

  function buildActionCache(caseSum, adjs) {
    actionCache = {};
    const pri = { resolved: 5, approved: 4, raised: 3, pending: 2, rejected: 1, closed: 0 };
    (caseSum.rows || []).forEach(c => {
      const keys = [];
      if ((c.fnsku || '').trim()) keys.push(c.fnsku.trim());
      if ((c.shipment_id || '').trim()) keys.push(c.shipment_id.trim());
      keys.forEach(k => {
        if (!actionCache[k]) actionCache[k] = { case_raised: 0, case_approved: 0, case_amount: 0, adj_qty: 0, case_status: null, case_count: 0 };
        const ac = actionCache[k];
        ac.case_raised   += parseInt(c.total_claimed) || 0;
        ac.case_approved += parseInt(c.total_approved) || 0;
        ac.case_amount   += parseFloat(c.total_amount) || 0;
        ac.case_count    += parseInt(c.case_count) || 0;
        const rank = pri[c.top_status] ?? 0;
        if (!ac.case_status || rank > (pri[ac.case_status] ?? 0)) ac.case_status = c.top_status;
      });
    });
    (adjs.rows || []).forEach(a => {
      if (a.recon_type !== 'shipment') return;
      const k = (a.fnsku || '').trim();
      if (!k) return;
      if (!actionCache[k]) actionCache[k] = { case_raised: 0, case_approved: 0, case_amount: 0, adj_qty: 0, case_status: null, case_count: 0 };
      actionCache[k].adj_qty += parseInt(a.qty_adjusted) || 0;
    });
  }

  async function loadShipmentDropdown() {
    try {
      const d = await fetch(`${API}/shipment-recon-data`).then(r => r.json());
      const rows = d.rows || [];
      const shipMap = {};
      rows.forEach(r => {
        const sid = (r.shipment_id || '').trim();
        if (!sid) return;
        if (!shipMap[sid]) shipMap[sid] = { status: (r.shipment_status || 'Unknown').trim(), date: r.ship_date ? r.ship_date.split('T')[0] : '' };
      });
      const sel = document.getElementById('sh-sid');
      if (!sel) return;
      while (sel.options.length > 1) sel.remove(1);
      Object.keys(shipMap).forEach(id => {
        const o = document.createElement('option');
        o.value = id;
        o.textContent = `${id} (${shipMap[id].status})`;
        sel.appendChild(o);
      });
    } catch (e) { console.warn('dropdown:', e); }
  }

  async function loadRecon() {
    try {
      const [shData, rc, ri] = await Promise.all([
        fetch(`${API}/shipment-recon-data`).then(r => r.json()),
        fetch(`${API}/data/fba_receipts`).then(r => r.json()),
        fetch(`${API}/data/reimbursements`).then(r => r.json()),
      ]);
      const fSt  = document.getElementById('sh-status')?.value || 'all';
      const fSid = document.getElementById('sh-sid')?.value    || 'all';

      const rcMap = {};
      (rc.rows || []).forEach(r => { const k = cl(r.fnsku); if (k) rcMap[k] = (rcMap[k] || 0) + (parseInt(r.quantity) || 0); });
      const riMap = {};
      (ri.rows || []).forEach(r => {
        if ((r.reason || '').trim() !== 'Lost_Inbound') return;
        const k = cl(r.fnsku); if (k) riMap[k] = (riMap[k] || 0) + (parseInt(r.quantity) || 0);
      });

      let shipped = (shData.rows || []).filter(r => {
        const sid = (r.shipment_id || '').trim(), st = (r.shipment_status || 'Unknown').trim();
        if (fSid !== 'all' && sid !== fSid) return false;
        if (fSt  !== 'all' && st.toLowerCase() !== fSt.toLowerCase()) return false;
        return true;
      });

      allRows = shipped.map(s => {
        const fk = cl(s.fnsku);
        const shipped_qty  = parseInt(s.quantity) || 0;
        const received_qty = fk ? (rcMap[fk] || 0) : 0;
        const shortage     = Math.max(0, shipped_qty - received_qty);
        const reimb_qty    = fk ? (riMap[fk] || 0) : 0;
        const pending      = Math.max(0, shortage - reimb_qty);
        let status = 'matched';
        if (shortage > 0 && pending > 0)  status = 'case_needed';
        else if (shortage > 0 && pending === 0) status = 'partial';
        else if (received_qty > shipped_qty)    status = 'excess';
        return {
          shipment_id: (s.shipment_id || '').trim() || '?',
          shipment_status: (s.shipment_status || 'Unknown').trim(),
          msku: s.msku || '?', title: s.title || '?',
          asin: s.asin || '?', fnsku: s.fnsku || '?',
          ship_date: fd(s.ship_date),
          shipped_qty, received_qty, shortage, reimb_qty, pending, status,
        };
      });

      colFilters = {};
      applyFilters();
      updateStats();
    } catch (e) {
      window.Toast?.show('Failed to load recon: ' + e.message, 'error');
    }
  }

  function applyFilters() {
    const fSt = document.getElementById('sh-recon')?.value || 'all';
    const fQ  = (document.getElementById('sh-q')?.value || '').toLowerCase();
    filteredRows = allRows.filter(r => {
      if (fSt !== 'all' && r.status !== fSt) return false;
      if (fQ && !r.msku.toLowerCase().includes(fQ) && !r.asin.toLowerCase().includes(fQ) && !r.fnsku.toLowerCase().includes(fQ) && !r.title.toLowerCase().includes(fQ)) return false;
      return true;
    });
    Object.keys(colFilters).forEach(key => {
      filteredRows = filteredRows.filter(r => (parseInt(r[key]) || 0) !== 0);
    });
    if (curView === 'shipment') renderShipView();
    else mountTable();
  }

  function updateStats() {
    const rows = allRows;
    const set  = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };

    const total      = rows.length;
    const matched    = rows.filter(r => r.status === 'matched' || r.status === 'excess').length;
    const shortage   = rows.filter(r => (r.shortage || 0) > 0).length;
    const caseNeed   = rows.filter(r => r.status === 'case_needed').length;
    const pending    = rows.reduce((s, r) => s + (parseInt(r.pending)    || 0), 0);

    const totalQty   = rows.reduce((s, r) => s + (parseInt(r.shipped_qty) || 0), 0);
    const matchedQty = rows.filter(r => r.status === 'matched' || r.status === 'excess')
                           .reduce((s, r) => s + (parseInt(r.shipped_qty) || 0), 0);
    const shortQty   = rows.filter(r => (r.shortage || 0) > 0)
                           .reduce((s, r) => s + (parseInt(r.shortage)    || 0), 0);
    const caseQty    = rows.filter(r => r.status === 'case_needed')
                           .reduce((s, r) => s + (parseInt(r.pending)     || 0), 0);
    const reimbQty   = rows.reduce((s, r) => s + (parseInt(r.reimb_qty)   || 0), 0);

    set('sr-kpi-total-skus',    total.toLocaleString());
    set('sr-kpi-total-units',   totalQty.toLocaleString());
    set('sr-kpi-matched-skus',  matched.toLocaleString());
    set('sr-kpi-matched-units', matchedQty.toLocaleString());
    set('sr-kpi-short-skus',    shortage.toLocaleString());
    set('sr-kpi-short-units',   shortQty.toLocaleString());
    set('sr-kpi-case-skus',     caseNeed.toLocaleString());
    set('sr-kpi-case-units',    caseQty.toLocaleString());
    set('sr-kpi-pending-skus',  pending.toLocaleString());
    set('sr-kpi-pending-units', reimbQty.toLocaleString() + ' reimb');
  }

  function mountTable() {
    const el = document.getElementById('sh-vtable');
    if (!el) return;
    el.innerHTML = '';
    const data = filteredRows.map((r, i) => ({
      ...r,
      _status_badge: statusBadge(r, actionCache[r.fnsku] || {}),
      _row_idx: i,
    }));
    window.VTable.create(el, {
      columns: [
        { key: 'shipment_id', label: 'Shipment', width: 130,
          render: (v, row) => {
            const idx = row._row_idx;
            return `<span style="color:var(--accent);cursor:pointer;font-family:monospace;
              font-weight:600;text-decoration:underline dotted"
              onclick="window.__srOpenDrawer(${idx})">${escH(v || '?')}</span>`;
          }
        },
        { key: 'shipment_status', label: 'Status',    width: 100 },
        { key: 'msku',            label: 'MSKU',      width: 150 },
        { key: 'fnsku',           label: 'FNSKU',     width: 120 },
        { key: 'asin',            label: 'ASIN',      width: 110 },
        { key: 'ship_date',       label: 'Ship Date', width: 100 },
        { key: 'shipped_qty',  label: 'Shipped',  width: 80, numeric: true, render: v => fn(v) },
        { key: 'received_qty', label: 'Received', width: 80, numeric: true,
          render: (v, r) => {
            const recv = parseInt(v || 0);
            const pct  = r.shipped_qty > 0 ? Math.round((recv / r.shipped_qty) * 100) : 100;
            const pfc  = pct >= 100 ? '#10b981' : pct >= 85 ? '#f59e0b' : '#ef4444';
            const tip  = '<b>Received</b>: ' + recv + ' / ' + r.shipped_qty
                       + '<br><b>Receipt Rate</b>: ' + pct + '%';
            return dataTip(tip,
              '<span style="font-family:monospace">' + recv + '</span>'
              + '<div style="height:3px;background:var(--border);border-radius:2px;margin-top:3px">'
              + '<div style="height:3px;background:' + pfc + ';width:' + Math.min(100, pct) + '%;border-radius:2px"></div>'
              + '</div>');
          }
        },
        { key: 'shortage', label: 'Shortage', width: 80, numeric: true,
          render: (v, r) => {
            const shortage = parseInt(r.shortage || 0);
            if (shortage === 0) return '<span style="color:var(--green)">0</span>';
            const ca      = actionCache[r.fnsku] || {};
            const reimb   = parseInt(r.reimb_qty      || 0);
            const cReim   = parseInt(ca.case_approved || 0);
            const adj     = parseInt(ca.adj_qty       || 0);
            const cStat   = (ca.case_status || '').toLowerCase();
            const cCount  = parseInt(ca.case_count    || 0);
            const pending = Math.max(0, shortage - reimb);
            const effPend = Math.max(0, pending - cReim - Math.max(0, adj));

            let reconStatus, reconColor;
            if (shortage === 0)                                             { reconStatus = '? Matched';    reconColor = '#10b981'; }
            else if (reimb + cReim >= shortage)                             { reconStatus = '?? Reimbursed'; reconColor = '#10b981'; }
            else if (cStat === 'raised' || cStat === 'pending')             { reconStatus = '?? Case Raised'; reconColor = '#f59e0b'; }
            else if (adj > 0 || effPend < pending)                          { reconStatus = '? In Progress'; reconColor = '#8b5cf6'; }
            else                                                             { reconStatus = '?? Case Needed'; reconColor = '#ef4444'; }

            const tipLines = [
              '<b>Recon Status</b>: <span style="color:' + reconColor + ';font-weight:700">' + reconStatus + '</span>',
              '<hr>',
              '<b>Shortage</b>: '     + shortage,
              '<b>Reimb. Qty</b>: '   + reimb,
              '<b>Case Reimb.</b>: '  + cReim,
              '<b>Cases Raised</b>: ' + cCount + (cStat ? ' <span style="color:#94a3b8">(' + escH(cStat) + ')</span>' : ''),
              '<b>Adjusted</b>: '     + adj,
              '<hr><b>Still Pending</b>: <span style="color:' + (effPend > 0 ? '#f87171' : '#34d399') + ';font-weight:700">' + effPend + '</span>',
            ];
            return '<span data-tip="' + escAttr(tipLines.join('<br>')) + '" onmouseover="showTip(event,this)" onmousemove="moveTip(event)" onmouseout="hideTip()" style="color:var(--red);font-weight:700;cursor:help">' + shortage + '</span>';
          }
        },
        { key: 'reimb_qty',     label: 'Reimb.',       width: 80,  numeric: true, render: v => fn(v) },
        { key: 'pending',       label: 'Pending',       width: 80,  numeric: true, render: v => v > 0 ? `<span style="color:var(--orange);font-weight:600">${fn(v)}</span>` : `<span style="color:var(--green)">0</span>` },
        { key: '_status_badge', label: 'Recon Status',  width: 130, sortable: false, render: v => v },
      ],
      data,
      rowHeight: 38,
      exportable: false,
      columnToggle: true,
    });

    // Move the col-toggle-wrap from VTable toolbar into the topbar slot
    requestAnimationFrame(() => {
      const colToggle = el.querySelector('.col-toggle-wrap');
      const slot      = document.getElementById('tb-page-actions');
      if (colToggle && slot) {
        slot.querySelector('.col-toggle-wrap')?.remove();
        slot.appendChild(colToggle);
      }
    });
  }

  function escH(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  // -- Row drawer --
  function openRowDrawer(idx) {
    const r = filteredRows[idx];
    if (!r) return;
    const ca       = actionCache[r.fnsku] || {};
    const shortage = parseInt(r.shortage  || 0);
    const reimb    = parseInt(r.reimb_qty || 0);
    const cReim    = parseInt(ca.case_approved || 0);
    const adj      = parseInt(ca.adj_qty || 0);
    const pending  = Math.max(0, shortage - reimb);
    const effPend  = Math.max(0, pending - cReim - Math.max(0, adj));
    const shortColor = shortage === 0 ? 'var(--green)' : 'var(--red)';
    const pendColor  = effPend  === 0 ? 'var(--green)' : 'var(--orange)';

    const badge = statusBadge(r, ca);

    const body = `
      <div class="drow">
        <div class="dkpi">
          <div class="dkpi-val">${fn(r.shipped_qty)}</div>
          <div class="dkpi-lbl">Shipped</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val">${fn(r.received_qty)}</div>
          <div class="dkpi-lbl">Received</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val" style="color:${shortColor}">${shortage}</div>
          <div class="dkpi-lbl">Shortage</div>
        </div>
      </div>
      <div class="drow">
        <div class="dkpi">
          <div class="dkpi-val">${fn(r.reimb_qty)}</div>
          <div class="dkpi-lbl">Reimbursed</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val">${fn(ca.case_count || 0)}</div>
          <div class="dkpi-lbl">Cases Raised</div>
        </div>
        <div class="dkpi">
          <div class="dkpi-val" style="color:${pendColor}">${effPend}</div>
          <div class="dkpi-lbl">Still Pending</div>
        </div>
      </div>
      <div style="margin-top:16px;border-top:1px solid var(--border);padding-top:14px">
        <div style="font-size:11px;font-weight:700;color:var(--text);margin-bottom:8px">Shipment Details</div>
        <div class="dl-row">
          <span class="dl-lbl">Shipment ID</span>
          <span class="dl-val" style="font-family:monospace">${escH(r.shipment_id)}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Ship Date</span>
          <span class="dl-val">${escH(r.ship_date || '?')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Shipment Status</span>
          <span class="dl-val">${escH(r.shipment_status || '?')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">FNSKU</span>
          <span class="dl-val" style="font-family:monospace">${escH(r.fnsku || '?')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">ASIN</span>
          <span class="dl-val" style="font-family:monospace">${escH(r.asin || '?')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">MSKU</span>
          <span class="dl-val" style="font-family:monospace">${escH(r.msku || '?')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Title</span>
          <span class="dl-val" style="font-weight:400;max-width:260px;text-align:right">${escH(r.title || '?')}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Adj. Qty</span>
          <span class="dl-val">${adj > 0 ? adj : '?'}</span>
        </div>
        <div class="dl-row">
          <span class="dl-lbl">Recon Status</span>
          <span class="dl-val">${badge}</span>
        </div>
        ${effPend > 0 ? `<div class="dl-row">
          <span class="dl-lbl">Action Note</span>
          <span class="dl-val" style="color:var(--red)">${effPend} unit${effPend !== 1 ? 's' : ''} still unaccounted ? raise a case</span>
        </div>` : ''}
      </div>
    `;
    window.openDrawer(
      r.shipment_id || '?',
      escH(r.msku || '') + (r.fnsku ? ' ? ' + r.fnsku : ''),
      body
    );
  }

  // -- View toggle --
  function setView(v) {
    curView = v;
    const skuBtn  = document.getElementById('sr-vt-sku');
    const shipBtn = document.getElementById('sr-vt-ship');
    if (skuBtn) {
      skuBtn.style.background = v === 'sku' ? '#fff' : 'none';
      skuBtn.style.color      = v === 'sku' ? 'var(--text)' : 'var(--text3)';
      skuBtn.style.boxShadow  = v === 'sku' ? '0 1px 3px rgba(0,0,0,.1)' : 'none';
    }
    if (shipBtn) {
      shipBtn.style.background = v === 'shipment' ? '#fff' : 'none';
      shipBtn.style.color      = v === 'shipment' ? 'var(--text)' : 'var(--text3)';
      shipBtn.style.boxShadow  = v === 'shipment' ? '0 1px 3px rgba(0,0,0,.1)' : 'none';
    }
    const wrap = document.getElementById('sr-table-wrap');
    if (v === 'shipment') {
      renderShipView();
    } else {
      if (wrap) {
        wrap.innerHTML = '<div style="padding:12px" id="sh-vtable"></div>';
        const shV = document.getElementById('sh-vtable');
        if (shV) shV.addEventListener('vtable:rendered', updateColTotals);
      }
      mountTable();
    }
  }

  // -- By-Shipment grouped view --
  function renderShipView() {
    const container = document.getElementById('sr-table-wrap');
    if (!container) return;

    // Columns toggle is only for the VTable (SKU view); hide it in ship view
    document.getElementById('tb-page-actions')?.querySelector('.col-toggle-wrap')?.remove();

    const groups = {};
    filteredRows.forEach(r => {
      const sid = (r.shipment_id || '').trim() || '?';
      if (!groups[sid]) groups[sid] = {
        shipment_id: sid,
        shipment_status: r.shipment_status || '?',
        ship_date: r.ship_date || '?',
        skus: 0, shipped: 0, received: 0,
        shortage: 0, reimb: 0, pending: 0,
        matched: 0, case_needed: 0, partial: 0,
      };
      const g = groups[sid];
      g.skus++;
      g.shipped  += parseInt(r.shipped_qty  || 0);
      g.received += parseInt(r.received_qty || 0);
      g.shortage += parseInt(r.shortage     || 0);
      g.reimb    += parseInt(r.reimb_qty    || 0);
      g.pending  += parseInt(r.pending      || 0);
      const st = r.status || '';
      if (st === 'matched' || st === 'excess') g.matched++;
      else if (st === 'case_needed')           g.case_needed++;
      else if (st === 'partial')               g.partial++;
    });

    const gv = Object.values(groups);

    container.innerHTML = `
      <table class="vtable-table">
        <thead>
          <tr>
            <th>Shipment ID</th>
            <th>Status</th>
            <th>Ship Date</th>
            <th class="th-num">SKUs</th>
            <th class="th-num">Shipped</th>
            <th class="th-num">Received</th>
            <th class="th-num">Shortage</th>
            <th class="th-num">Reimb.</th>
            <th class="th-num">Pending</th>
            <th>Summary</th>
          </tr>
        </thead>
        <tbody>
          ${!gv.length
            ? `<tr><td colspan="10" style="text-align:center;padding:40px;color:var(--text3)">No shipments</td></tr>`
            : gv.map(g => {
                const pct    = g.shipped > 0 ? Math.round((g.received / g.shipped) * 100) : 100;
                const pColor = pct >= 100 ? '#10b981' : pct >= 85 ? '#f59e0b' : '#ef4444';
                const stColor = g.shipment_status === 'Closed'    ? '#6b7280'
                              : g.shipment_status === 'Receiving'  ? '#3b82f6' : '#f59e0b';
                return `<tr onclick="window.__srDrillDown('${escAttr(g.shipment_id)}')" style="cursor:pointer">
                  <td style="font-family:monospace;font-weight:600;color:var(--accent)">${escH(g.shipment_id)}</td>
                  <td><span style="color:${stColor};font-weight:600;font-size:11px">${escH(g.shipment_status)}</span></td>
                  <td style="font-size:11px;color:var(--text2)">${escH(g.ship_date)}</td>
                  <td class="r">${g.skus}</td>
                  <td class="r" style="font-family:monospace">${g.shipped.toLocaleString()}</td>
                  <td class="r" style="font-family:monospace">
                    ${g.received.toLocaleString()}
                    <div style="height:3px;background:var(--border);border-radius:2px;margin-top:2px">
                      <div style="height:3px;background:${pColor};width:${Math.min(100, pct)}%;border-radius:2px"></div>
                    </div>
                  </td>
                  <td class="r">${g.shortage > 0 ? `<span style="color:var(--red);font-weight:700">?${g.shortage.toLocaleString()}</span>` : '<span style="color:var(--green)">0</span>'}</td>
                  <td class="r">${g.reimb > 0 ? `<span style="color:var(--green);font-weight:700">+${g.reimb.toLocaleString()}</span>` : '<span style="color:var(--text3)">?</span>'}</td>
                  <td class="r">${g.pending > 0 ? `<span style="color:var(--red);font-weight:700">?${g.pending.toLocaleString()}</span>` : '<span style="color:var(--green)">0</span>'}</td>
                  <td>
                    ${g.matched     ? `<span class="badge badge-green">${g.matched} ok</span> `   : ''}
                    ${g.case_needed ? `<span class="badge badge-red">${g.case_needed} cases</span> ` : ''}
                    ${g.partial     ? `<span class="badge" style="background:var(--accent-l);color:var(--accent)">${g.partial} partial</span>` : ''}
                  </td>
                </tr>`;
              }).join('')
          }
        </tbody>
      </table>
    `;
  }

  // -- Drill-down: shipment row ? SKU view filtered to that shipment --
  function drillDown(shipmentId) {
    const sel = document.getElementById('sh-sid');
    if (sel) sel.value = shipmentId;
    applyFilters();
    setView('sku');
  }

  // -- CSV export of current filtered SKU rows --
  function exportCSV() {
    if (!filteredRows.length) { window.Toast?.show('No data to export', 'error'); return; }
    const cols = ['shipment_id','shipment_status','msku','fnsku','asin','ship_date',
                  'shipped_qty','received_qty','shortage','reimb_qty','pending','status'];
    const header = cols.join(',');
    const rows = filteredRows.map(r =>
      cols.map(c => '"' + String(r[c] ?? '').replace(/"/g, '""') + '"').join(',')
    );
    const csv  = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'shipment-recon.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  let _dt;
  function debounce() { clearTimeout(_dt); _dt = setTimeout(applyFilters, 280); }

  // -- Render --
  function render(container) {
    container.innerHTML = `
      <div style="margin-bottom:16px">
        <div class="page-title">Shipment Recon</div>
        <div class="page-sub">FNSKU-based matching ? Lost_Inbound reimbursements</div>
      </div>

      <!-- Filter bar -->
      <div class="filter-bar" style="margin-bottom:16px">
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Shipment Status</div>
          <select id="sh-status" style="height:32px" onchange="window.__shipReconLoadRecon()">
            <option value="all">All</option>
            <option value="Closed">Closed</option>
            <option value="Receiving">Receiving</option>
            <option value="Working">Working</option>
            <option value="Shipped">Shipped</option>
            <option value="Unknown">Unknown</option>
          </select>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Shipment ID</div>
          <select id="sh-sid" style="height:32px;min-width:200px" onchange="window.__shipReconLoadRecon()">
            <option value="all">All Shipments</option>
          </select>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Recon Status</div>
          <select id="sh-recon" style="height:32px" onchange="window.__shipReconFilter()">
            <option value="all">All Status</option>
            <option value="matched">Matched</option>
            <option value="case_needed">Case Needed</option>
            <option value="partial">Partial</option>
            <option value="shortage">Shortage</option>
            <option value="excess">Excess</option>
          </select>
        </div>
        <div style="flex:1;min-width:180px">
          <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / FNSKU</div>
          <input id="sh-q" placeholder="Search?" style="height:32px;width:100%" oninput="window.__shipReconDebounce()">
        </div>
        <div style="align-self:flex-end;display:flex;gap:6px">
          <button class="btn btn-outline btn-sm" onclick="window.__shipReconClear()">? Clear</button>
          <button class="btn btn-danger btn-sm" onclick="window.__shipReconCasesNeeded()">Cases Needed</button>
        </div>
      </div>

      <!-- KPI Cards: dual SKU / Units -->
      <div id="sr-kpi-row" style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:16px">
        ${[
          ['sr-kpi-total',   'Total SKUs',    'var(--accent)'],
          ['sr-kpi-matched', 'Matched',       'var(--green)'],
          ['sr-kpi-short',   'Shortage',      'var(--red)'],
          ['sr-kpi-case',    'Cases Needed',  'var(--orange)'],
          ['sr-kpi-pending', 'Pending Units', 'var(--text3)'],
        ].map(([id, label, accent]) => `
          <div style="background:var(--surface);border:1px solid var(--border);
            border-top:3px solid ${accent};border-radius:8px;padding:10px 14px;
            box-shadow:var(--shadow-sm)">
            <div style="font-size:8.5px;font-weight:700;color:var(--text3);
              text-transform:uppercase;letter-spacing:.7px;margin-bottom:5px;text-align:center">
              ${label}
            </div>
            <div style="display:flex;align-items:center;justify-content:center;gap:8px">
              <div style="display:flex;flex-direction:column;align-items:center">
                <div id="${id}-skus" style="font-size:18px;font-weight:700;
                  font-family:monospace;color:${accent};line-height:1">?</div>
                <div style="font-size:8px;color:var(--text3);margin-top:2px">SKUs</div>
              </div>
              <div style="width:1px;height:22px;background:var(--border);flex-shrink:0"></div>
              <div style="display:flex;flex-direction:column;align-items:center">
                <div id="${id}-units" style="font-size:13px;font-weight:700;
                  font-family:monospace;color:${accent};line-height:1">?</div>
                <div style="font-size:8px;color:var(--text3);margin-top:2px">Units</div>
              </div>
            </div>
          </div>`
        ).join('')}
      </div>

      <!-- Table -->
      <div class="card">
        <div class="card-header">
          <span>Shipment Reconciliation ? By SKU</span>
          <span class="text-sm text-muted">FNSKU matching ? Lost_Inbound reimbursements</span>
        </div>
        <div id="sr-table-wrap">
          <div style="padding:12px" id="sh-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // ?? Topbar page actions (view toggle + export + refresh; Columns appended after VTable mounts)
    window.Topbar?.setPageActions(`
      <div id="sr-view-toggle" style="display:flex;gap:2px;background:var(--surface2,#f1f5f9);border:1px solid var(--border);border-radius:9px;padding:3px">
        <button id="sr-vt-sku" onclick="window.__srSetView('sku')"
          style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s;background:var(--surface,#fff);color:var(--text);box-shadow:0 1px 3px rgba(0,0,0,.1)">
          By SKU
        </button>
        <button id="sr-vt-ship" onclick="window.__srSetView('shipment')"
          style="padding:5px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;border:none;transition:all .15s;background:none;color:var(--text3)">
          By Shipment
        </button>
      </div>
      <button class="btn btn-outline btn-sm" onclick="window.__srExport()">&#11015; Export CSV</button>
      <button class="btn btn-outline btn-sm" onclick="window.__srRefresh()">&#8635; Refresh</button>
    `);

    const shV = document.getElementById('sh-vtable');
    if (shV && !shV._shVtableTotalsBound) {
      shV._shVtableTotalsBound = true;
      shV.addEventListener('vtable:rendered', updateColTotals);
    }

    window.__shipReconLoadRecon  = loadRecon;
    window.__shipReconFilter     = applyFilters;
    window.__shipReconDebounce   = debounce;
    window.__shipReconRefresh    = loadAll;
    window.__srOpenDrawer        = openRowDrawer;
    window.__srSetView           = setView;
    window.__srDrillDown         = drillDown;
    window.__srExport            = exportCSV;
    window.__srRefresh           = loadAll;
    window.__shipReconClear      = () => {
      ['sh-status','sh-sid','sh-recon','sh-q'].forEach(id => { const e = document.getElementById(id); if (e) e.value = id === 'sh-status' || id === 'sh-sid' ? 'all' : id === 'sh-recon' ? 'all' : ''; });
      loadRecon();
    };
    window.__shipReconCasesNeeded = () => {
      const e = document.getElementById('sh-recon');
      if (e) e.value = 'case_needed';
      applyFilters();
    };

    loadAll();
  }

  function refresh() { loadAll(); }

  window.__viewExport = { render, refresh };
})();
