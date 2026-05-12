/* ====================================================
   Removal Recon View
   APIs: /removal-recon, /removal-case-reimb
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

  let allRows = [], filteredRows = [];
  let activePill = '', activePillType = '';
  let colFilters = {};
  let receiptsMap = {};       // keyed by order_id
  let _receiptModalRow = null;
  const COL_TOTALS = [
    { key: 'requested_quantity' },
    { key: 'shipped_quantity'   },
    { key: 'received_qty'       },
    { key: 'reimb_qty'          },
    { key: 'reimb_amount',       currency: true },
    { key: 'removal_fee',        currency: true },
  ];

  function updateColTotals() {
    COL_TOTALS.forEach(col => {
      const el = document.getElementById('ct-' + col.key);
      if (!el) return;
      const total = filteredRows.reduce((s, r) => s + (col.currency ? (parseFloat(r[col.key]) || 0) : (parseInt(r[col.key]) || 0)), 0);
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
    applyLocal();
  }

  function fd(v) { if (!v) return '�'; return String(v).split('T')[0]; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '�' : n.toLocaleString(); }
  function fm(v) { const n = parseFloat(v); return isNaN(n) ? '�' : '$' + n.toFixed(2); }

  function receiptStatusBadge(s) {
    if (!s || s === 'Awaiting' || s === 'Not Applicable') return `<span class="badge badge-orange">Awaiting</span>`;
    if (s === 'Received')    return `<span class="badge badge-green">Received</span>`;
    if (s === 'Missing')     return `<span class="badge badge-red">Missing</span>`;
    if (s === 'Reimbursed')  return `<span class="badge badge-green">Reimbursed</span>`;
    return `<span class="badge badge-gray">${s}</span>`;
  }

  async function loadReceipts() {
    try {
      const d = await fetch(`${API}/removal-receipts`).then(r => r.json());
      receiptsMap = {};
      (d.rows || []).forEach(r => { if (r.order_id) receiptsMap[r.order_id] = r; });
    } catch (e) { console.warn('[RemovalRecon] receipts load:', e.message); }
  }

  async function loadOrders() {
    const wrap = document.getElementById('rm-vtable');
    if (wrap) wrap.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;

    const p = new URLSearchParams();
    const os = document.getElementById('f-ostatus')?.value;
    const fr = document.getElementById('f-from')?.value;
    const to = document.getElementById('f-to')?.value;
    const sr = document.getElementById('f-search')?.value;
    if (os) p.set('status', os);
    if (fr) p.set('from', fr);
    if (to) p.set('to', to);
    if (sr) p.set('search', sr);

    try {
      const [d, caseData] = await Promise.all([
        fetch(`${API}/removal-recon${p.toString() ? '?' + p : ''}`).then(r => r.json()),
        fetch(`${API}/removal-case-reimb`).then(r => r.json()).catch(() => ({ rows: [] })),
        loadReceipts(),
      ]);
      if (d.error) throw new Error(d.error);

      const caseMap = {};
      (caseData.rows || []).forEach(c => { if (c.order_id) caseMap[c.order_id] = c; });

      allRows = (d.rows || []).map(row => {
        const cr = caseMap[row.order_id];
        if (cr) {
          const ctQ = parseInt(cr.ct_reimb_qty) || 0;
          const ctA = parseFloat(cr.ct_reimb_amount) || 0;
          row.ct_reimb_qty    = ctQ;
          row.ct_reimb_amount = ctA;
          row.case_count      = row.case_count || parseInt(cr.case_count) || 0;
          const rrQ = parseInt(row.rr_reimb_qty) || 0;
          if (rrQ === 0 && ctQ > 0) {
            row.reimb_qty    = ctQ;
            row.reimb_amount = ctA;
            if (!row.receipt_status || row.receipt_status === 'Awaiting' || row.receipt_status === 'Not Applicable') {
              row.receipt_status = 'Reimbursed';
            }
          }
        }
        return row;
      });

      updatePills();
      colFilters = {};
      applyLocal();
    } catch (e) {
      window.Toast?.show('Failed to load removal recon: ' + e.message, 'error');
      if (wrap) wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function updatePills() {
    const counts = { all: allRows.length, awaiting: 0, received: 0, missing: 0, reimb: 0, cases: 0 };
    let totalFee = 0;
    allRows.forEach(r => {
      const s = r.receipt_status || 'Awaiting';
      if (s === 'Awaiting' || s === 'Not Applicable' || !r.receipt_status) counts.awaiting++;
      else if (s === 'Received') counts.received++;
      else if (s === 'Missing')  counts.missing++;
      else if (s === 'Reimbursed') counts.reimb++;
      if ((r.case_count || 0) > 0) counts.cases++;
      totalFee += parseFloat(r.removal_fee || 0);
    });

    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('pv-all',      counts.all);
    set('pv-await',    counts.awaiting);
    set('pv-rcv',      counts.received);
    set('pv-miss',     counts.missing);
    set('pv-reimb',    counts.reimb);
    set('pv-cases',    counts.cases);
    set('pill-fee',    `Total Fee: ${fm(totalFee)}`);

    // KPI stats
    set('st-total',    counts.all.toLocaleString());
    set('st-awaiting', counts.awaiting.toLocaleString());
    set('st-received', counts.received.toLocaleString());
    set('st-missing',  counts.missing.toLocaleString());
    set('st-reimb',    counts.reimb.toLocaleString());
  }

  function setPill(status, type) {
    activePill = status; activePillType = type || '';
    document.querySelectorAll('[data-pill]').forEach(p => p.classList.remove('active'));
    const pmap = { '': 'pill-all', 'Awaiting': 'pill-await', 'Received': 'pill-rcv', 'Missing': 'pill-miss', 'Reimbursed': 'pill-reimb' };
    const pid = type === 'case' ? 'pill-cases' : pmap[status];
    if (pid) document.getElementById(pid)?.classList.add('active');
    applyLocal();
  }

  function applyLocal() {
    const disp = (document.getElementById('f-disp')?.value || '').toLowerCase();
    const type = (document.getElementById('f-type')?.value || '').toLowerCase();
    const q    = (document.getElementById('f-search')?.value || '').toLowerCase();

    filteredRows = allRows.filter(r => {
      const s = r.receipt_status || 'Awaiting';
      if (activePillType === 'case') { if (!r.case_count) return false; }
      else if (activePill && s !== activePill) return false;
      if (disp && (r.disposition || '').toLowerCase() !== disp) return false;
      if (type && (r.removal_order_type || '').toLowerCase() !== type) return false;
      if (q && ![(r.msku||''),(r.fnsku||''),(r.order_id||'')].some(v => v.toLowerCase().includes(q))) return false;
      return true;
    });
    Object.keys(colFilters).forEach(key => {
      const isAmt = key === 'reimb_amount' || key === 'removal_fee';
      filteredRows = filteredRows.filter(r =>
        (isAmt ? (parseFloat(r[key]) || 0) : (parseInt(r[key]) || 0)) !== 0
      );
    });

    mountTable();
  }

  // -- Receipt modal --
  function openReceiptModal(idx) {
    const r = filteredRows[idx];
    if (!r) return;
    _receiptModalRow = r;
    const existing = receiptsMap[r.order_id] || {};

    const set = (id, v) => { const el = document.getElementById(id); if (el) el.value = v ?? ''; };
    set('rf-id',            existing.id || '');
    set('rf-order_id',      r.order_id || '');
    set('rf-msku',          r.msku || '');
    set('rf-fnsku',         r.fnsku || '');
    set('rf-shipped',       r.shipped_quantity || '');
    set('rf-qty_received',  existing.qty_received ?? r.shipped_quantity ?? '');
    set('rf-condition',     existing.condition || r.disposition || '');
    set('rf-receipt_date',  existing.receipt_date ? existing.receipt_date.split('T')[0] : new Date().toISOString().split('T')[0]);
    set('rf-notes',         existing.notes || '');

    document.getElementById('modal-receipt').style.display = 'flex';
  }

  function closeReceiptModal() {
    document.getElementById('modal-receipt').style.display = 'none';
    _receiptModalRow = null;
  }

  async function submitReceipt() {
    const r   = _receiptModalRow;
    if (!r) return;
    const id  = document.getElementById('rf-id').value;
    const qty = document.getElementById('rf-qty_received').value;
    if (!qty) { window.Toast?.show('Qty Received is required', 'error'); return; }

    const body = {
      order_id:     r.order_id,
      msku:         r.msku,
      fnsku:        r.fnsku,
      qty_received: parseInt(qty) || 0,
      condition:    document.getElementById('rf-condition').value    || null,
      receipt_date: document.getElementById('rf-receipt_date').value || null,
      notes:        document.getElementById('rf-notes').value        || null,
    };

    try {
      const res = await fetch(id ? `${API}/removal-receipts/${id}` : `${API}/removal-receipts`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      const saved = (await res.json()).row || body;

      // Patch in-place
      receiptsMap[r.order_id] = { ...saved, id: saved.id || id };
      const match = allRows.find(x => x.order_id === r.order_id);
      if (match) {
        match.received_qty    = parseInt(qty) || 0;
        match.receipt_status  = 'Received';
      }
      window.Toast?.show(id ? '? Receipt updated!' : '? Receipt saved!', 'success');
      closeReceiptModal();
      updatePills();
      applyLocal();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  function mountTable() {
    const el = document.getElementById('rm-vtable');
    if (!el) return;
    el.innerHTML = '';
    const data = filteredRows.map((r, i) => {
      const isReceived = r.receipt_status === 'Received' || r.receipt_status === 'Reimbursed';
      const _actions = isReceived
        ? `<span class="badge badge-green" style="gap:4px">&#x1F512; Received</span>`
        : `<button class="btn btn-xs btn-outline" style="white-space:nowrap"
             onclick="window.__rmReceive(${i})">&#x1F4E6; Receive</button>`;
      return { ...r, _actions };
    });
    window.VTable.create(el, {
      columns: [
        { key: 'request_date',       label: 'Request Date',   width: 100, render: v => fd(v) },
        { key: 'order_id',           label: 'Order ID',        width: 130 },
        { key: 'msku',               label: 'MSKU',            width: 140 },
        { key: 'fnsku',              label: 'FNSKU',           width: 120 },
        { key: 'removal_order_type', label: 'Type',            width: 80 },
        { key: 'order_status',       label: 'Order Status',    width: 100 },
        { key: 'disposition',        label: 'Disposition',     width: 110 },
        { key: 'requested_quantity', label: 'Req.',            width: 60,  numeric: true, render: v => fn(v) },
        { key: 'shipped_quantity',   label: 'Shipped',         width: 70,  numeric: true, render: v => fn(v) },
        { key: 'received_qty',       label: 'Received',        width: 80,  numeric: true, render: v => fn(v) },
        { key: 'reimb_qty',          label: 'Reimb.Qty',       width: 80,  numeric: true, render: v => fn(v) },
        { key: 'reimb_amount',       label: 'Reimb.$',         width: 80,  numeric: true, render: v => fm(v) },
        { key: 'removal_fee',        label: 'Fee',             width: 80,  numeric: true, render: v => fm(v) },
        { key: 'receipt_status',     label: 'Status',          width: 120, render: v => receiptStatusBadge(v) },
        { key: '_actions',           label: 'Actions',         width: 110, sortable: false, render: v => v },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  let _dt;
  function dbSearch() { clearTimeout(_dt); _dt = setTimeout(applyLocal, 300); }

  // -- Render --
  function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const d30 = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Removal Recon</div>
          <div class="page-sub">Removal orders reconciliation with warehouse receipts and case reimbursements</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__rmReconLoad()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI Stats -->
      <div class="stat-grid" style="margin-bottom:14px">
        <div class="stat-card">
          <div class="stat-label">Total Orders</div>
          <div class="stat-value" id="st-total" style="color:var(--accent)">�</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Awaiting</div>
          <div class="stat-value" id="st-awaiting" style="color:var(--orange)">�</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Received</div>
          <div class="stat-value" id="st-received" style="color:var(--green)">�</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Missing</div>
          <div class="stat-value" id="st-missing" style="color:var(--red)">�</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Reimbursed</div>
          <div class="stat-value" id="st-reimb" style="color:var(--green)">�</div>
        </div>
      </div>

      <!-- Pill filters -->
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:14px;align-items:center">
        <button class="btn btn-sm btn-outline active" data-pill id="pill-all"   onclick="window.__rmSetPill('','')">All <b id="pv-all">�</b></button>
        <button class="btn btn-sm btn-outline"        data-pill id="pill-await" onclick="window.__rmSetPill('Awaiting','')">Awaiting <b id="pv-await">�</b></button>
        <button class="btn btn-sm btn-outline"        data-pill id="pill-rcv"   onclick="window.__rmSetPill('Received','')">Received <b id="pv-rcv">�</b></button>
        <button class="btn btn-sm btn-outline"        data-pill id="pill-miss"  onclick="window.__rmSetPill('Missing','')">Missing <b id="pv-miss">�</b></button>
        <button class="btn btn-sm btn-outline"        data-pill id="pill-reimb" onclick="window.__rmSetPill('Reimbursed','')">Reimbursed <b id="pv-reimb">�</b></button>
        <button class="btn btn-sm btn-outline"        data-pill id="pill-cases" onclick="window.__rmSetPill('','case')">Has Case <b id="pv-cases">�</b></button>
        <span style="margin-left:auto;font-size:12px;color:var(--text3)" id="pill-fee">�</span>
      </div>

      <!-- Filter bar -->
      <div class="filter-bar" style="margin-bottom:16px">
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Order Status</div>
          <select id="f-ostatus" style="height:32px" onchange="window.__rmReconLoad()">
            <option value="">All</option>
            <option>Completed</option><option>In Progress</option>
            <option>Pending</option><option>Cancelled</option>
          </select>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Disposition</div>
          <select id="f-disp" style="height:32px" onchange="window.__rmApplyLocal()">
            <option value="">All</option>
            <option>Unsellable</option><option>Sellable</option>
            <option>Damaged</option><option>Customer Damaged</option>
          </select>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">Type</div>
          <select id="f-type" style="height:32px" onchange="window.__rmApplyLocal()">
            <option value="">All</option><option>Return</option><option>Disposal</option>
          </select>
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
          <input type="date" id="f-from" value="${d30}" style="height:32px" onchange="window.__rmReconLoad()">
        </div>
        <div>
          <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
          <input type="date" id="f-to" value="${today}" style="height:32px" onchange="window.__rmReconLoad()">
        </div>
        <div style="flex:1;min-width:160px">
          <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / FNSKU / Order ID</div>
          <input id="f-search" placeholder="Search�" style="height:32px;width:100%" oninput="window.__rmDbSearch()">
        </div>
        <div style="align-self:flex-end">
          <button class="btn btn-outline btn-sm" onclick="window.__rmClear()">? Clear</button>
        </div>
      </div>

      <!-- Table -->
      <div class="card">
        <div class="card-header">
          <span>Removal Orders + Tracking</span>
          <a href="#/upload?t=removals" style="font-size:12px">Upload Removals ?</a>
        </div>
        <div style="padding:12px" id="rm-vtable">
          <div class="skeleton" style="height:200px;border-radius:8px"></div>
        </div>
      </div>

      <!-- -- MODAL: Record Receipt -- -->
      <div id="modal-receipt" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:center;justify-content:center"
           onclick="if(event.target===this)window.__rmCloseReceipt()">
        <div style="background:var(--surface);border-radius:12px;width:480px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div style="font-weight:700;font-size:15px">?? Record Receipt</div>
            <button style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3)" onclick="window.__rmCloseReceipt()">?</button>
          </div>
          <input type="hidden" id="rf-id">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><label class="form-label">Order ID</label>
              <input id="rf-order_id" class="form-input" readonly style="background:var(--surface2);cursor:default"></div>
            <div><label class="form-label">Shipped Qty</label>
              <input id="rf-shipped" class="form-input" readonly style="background:var(--surface2);cursor:default"></div>
            <div><label class="form-label">MSKU</label>
              <input id="rf-msku" class="form-input" readonly style="background:var(--surface2);cursor:default"></div>
            <div><label class="form-label">FNSKU</label>
              <input id="rf-fnsku" class="form-input" readonly style="background:var(--surface2);cursor:default"></div>
            <div><label class="form-label">Qty Received *</label>
              <input type="number" id="rf-qty_received" class="form-input" min="0" placeholder="0"></div>
            <div><label class="form-label">Condition</label>
              <select id="rf-condition" class="form-input">
                <option value="">� Select �</option>
                <option value="Sellable">Sellable</option>
                <option value="Unsellable">Unsellable</option>
                <option value="Damaged">Damaged</option>
                <option value="Customer Damaged">Customer Damaged</option>
              </select>
            </div>
            <div style="grid-column:1/-1"><label class="form-label">Receipt Date</label>
              <input type="date" id="rf-receipt_date" class="form-input"></div>
          </div>
          <div style="margin-top:12px"><label class="form-label">Notes</label>
            <textarea id="rf-notes" class="form-input" rows="2" style="resize:vertical" placeholder="Any notes about this receipt�"></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
            <button class="btn btn-outline" onclick="window.__rmCloseReceipt()">Cancel</button>
            <button class="btn btn-primary" onclick="window.__rmSubmitReceipt()">Save Receipt</button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    const rmV = document.getElementById('rm-vtable');
    if (rmV && !rmV._rmVtableTotalsBound) {
      rmV._rmVtableTotalsBound = true;
      rmV.addEventListener('vtable:rendered', updateColTotals);
    }

    window.__rmReconLoad     = loadOrders;
    window.__rmApplyLocal    = applyLocal;
    window.__rmDbSearch      = dbSearch;
    window.__rmSetPill       = setPill;
    window.__rmReceive       = openReceiptModal;
    window.__rmCloseReceipt  = closeReceiptModal;
    window.__rmSubmitReceipt = submitReceipt;
    window.__rmClear      = () => {
      ['f-ostatus','f-disp','f-type','f-search'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      document.getElementById('f-from').value = d30;
      document.getElementById('f-to').value = today;
      activePill = ''; activePillType = '';
      document.querySelectorAll('[data-pill]').forEach(p => p.classList.remove('active'));
      document.getElementById('pill-all')?.classList.add('active');
      loadOrders();
    };

    loadOrders();
  }

  function refresh() { loadOrders(); }

  window.__viewExport = { render, refresh };
})();
