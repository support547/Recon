/* ====================================================
   Cases & Adjustments View
   APIs: /cases, /manual-adjustments, /case-reimb-summary
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

  let activeTab  = 'cases';
  let casesData  = [];
  let adjData    = [];

  // -- Helpers --
  function escH(s) { return (window.escH || (x => String(x||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')))(s); }
  function escA(s) { return (window.escAttr || (x => String(x||'').replace(/"/g,'&quot;').replace(/'/g,'&#39;')))(s); }
  function fd(v)   { return v ? String(v).split('T')[0] : '�'; }
  function fm(v)   { const n = parseFloat(v); return isNaN(n) || n === 0 ? '�' : '$' + n.toFixed(2); }
  function fn(v)   { const n = parseInt(v);   return isNaN(n) ? '�' : n.toLocaleString(); }

  const _dt = {};
  function debounce(key, cb, ms) { clearTimeout(_dt[key]); _dt[key] = setTimeout(cb, ms); }

  // -- Badge helpers --
  const RECON_BADGE = {
    shipment:      'badge-blue',   removal:       'badge-orange',
    return:        'badge-green',  replacement:   'badge-teal',
    fc_transfer:   'badge-blue',   reimbursement: 'badge-green',
    gnr:           'badge-purple', other:         'badge-gray',
  };
  const RECON_LABEL = {
    shipment: 'Shipment', removal: 'Removal', return: 'Return',
    replacement: 'Replacement', fc_transfer: 'FC Transfer',
    reimbursement: 'Reimbursement', gnr: 'GNR', other: 'Other',
  };
  const STATUS_BADGE = {
    pending: 'badge-orange', raised: 'badge-blue', approved: 'badge-green',
    partial: 'badge-teal',   rejected: 'badge-red', closed: 'badge-gray',
  };
  const ADJ_BADGE = {
    loss: 'badge-red', found: 'badge-green', damage: 'badge-orange',
    correction: 'badge-blue', other: 'badge-gray',
  };

  function reconBadge(rt)  { return `<span class="badge ${RECON_BADGE[rt]||'badge-gray'}">${escH(RECON_LABEL[rt]||rt||'�')}</span>`; }
  function statusBadge(s)  { return `<span class="badge ${STATUS_BADGE[s] ||'badge-gray'}">${escH(s||'�')}</span>`; }
  function adjTypeBadge(t) { return `<span class="badge ${ADJ_BADGE[t]   ||'badge-gray'}">${escH(t||'�')}</span>`; }

  function mskuCell(r) {
    return `<div>
      <div style="font-weight:600;font-size:12px;font-family:monospace">${escH(r.msku||'�')}</div>
      <div style="font-size:10px;color:var(--text3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:175px"
           title="${escA(r.title||'')}">${escH(r.title||'')}</div>
    </div>`;
  }

  // ----------------------------------------
  // CASES
  // ----------------------------------------
  async function loadCases() {
    const rt = document.getElementById('ca-rt')?.value || '';
    const st = document.getElementById('ca-st')?.value || '';
    const sq = (document.getElementById('ca-q')?.value || '').trim();
    const p  = new URLSearchParams();
    if (rt) p.set('recon_type', rt);
    if (st) p.set('status', st);
    if (sq) p.set('search', sq);

    const wrap = document.getElementById('ca-table');
    if (wrap) wrap.innerHTML = `<div class="skeleton" style="height:160px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/cases${p.toString() ? '?' + p : ''}`).then(r => r.json());
      casesData = d.rows || [];
      updateCasesKPIs();
      renderCasesTable();
    } catch (e) {
      window.Toast?.show('Failed to load cases: ' + e.message, 'error');
      if (wrap) wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${escH(e.message)}</div>`;
    }
  }

  function updateCasesKPIs() {
    const total    = casesData.length;
    const pending  = casesData.filter(r => r.status === 'pending').length;
    const raised   = casesData.filter(r => r.status === 'raised').length;
    const approved = casesData.filter(r => r.status === 'approved' || r.status === 'partial').length;
    const totalAmt = casesData.reduce((s, r) => s + (parseFloat(r.amount_approved) || 0), 0);
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('ca-k-total',    total);
    set('ca-k-pending',  pending);
    set('ca-k-raised',   raised);
    set('ca-k-approved', approved);
    set('ca-k-amount',   '$' + totalAmt.toFixed(2));
  }

  function renderCasesTable() {
    const el = document.getElementById('ca-table');
    if (!el) return;
    el.innerHTML = '';
    if (!casesData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">No cases found � click "+ New Case" to add one</div>`;
      return;
    }
    const data = casesData.map((r, i) => {
      const tipHtml = [
        r.case_id     ? `<div class="htip-row"><span class="htip-lbl">Case ID</span><span class="htip-val">${escH(r.case_id)}</span></div>` : '',
        r.case_reason ? `<div class="htip-row"><span class="htip-lbl">Reason</span><span class="htip-val">${escH(r.case_reason)}</span></div>` : '',
        `<div class="htip-sep"></div>`,
        `<div class="htip-row"><span class="htip-lbl">Claimed</span><span class="htip-val">${fn(r.units_claimed)} units � ${fm(r.amount_claimed)}</span></div>`,
        `<div class="htip-row"><span class="htip-lbl">Approved</span><span class="htip-val">${fn(r.units_approved)} units � ${fm(r.amount_approved)}</span></div>`,
        r.issue_date  ? `<div class="htip-row"><span class="htip-lbl">Issue Date</span><span class="htip-val">${fd(r.issue_date)}</span></div>` : '',
        r.raised_date ? `<div class="htip-row"><span class="htip-lbl">Raised Date</span><span class="htip-val">${fd(r.raised_date)}</span></div>` : '',
        r.notes       ? `<div class="htip-sep"></div><div class="htip-row"><span class="htip-lbl">Notes</span><span class="htip-val">${escH(r.notes)}</span></div>` : '',
      ].join('');
      return {
        ...r,
        _msku:       mskuCell(r),
        _recon:      reconBadge(r.recon_type),
        _ship_order: escH(r.shipment_id || r.order_id || '�'),
        _status_tip: `<div class="htip">${statusBadge(r.status)}<div class="htip-box">${tipHtml}</div></div>`,
        _created:    fd(r.created_at),
        _actions:    `<div style="display:flex;gap:4px">
          <button class="btn btn-xs btn-outline" onclick="window.__caEditCase(${i})">Edit</button>
          <button class="btn btn-xs btn-danger"  onclick="window.__caDeleteCase(${r.id})">Del</button>
        </div>`,
      };
    });
    window.VTable.create(el, {
      columns: [
        { key: '_msku',        label: 'MSKU / Title',     width: 185, sortable: false, render: v => v },
        { key: '_recon',       label: 'Recon Type',        width: 120, sortable: false, render: v => v },
        { key: '_ship_order',  label: 'Shipment / Order',  width: 145 },
        { key: 'case_reason',  label: 'Case Reason',       width: 140 },
        { key: 'case_id',      label: 'Case ID',           width: 130 },
        { key: 'units_claimed',  label: 'Claimed',         width: 80,  numeric: true, render: v => fn(v) },
        { key: 'units_approved', label: 'Approved',        width: 80,  numeric: true, render: v => fn(v) },
        { key: 'amount_approved',label: '$ Approved',      width: 95,  numeric: true, render: v => fm(v) },
        { key: '_status_tip',  label: 'Status',            width: 130, sortable: false, render: v => v },
        { key: '_created',     label: 'Created',           width: 100 },
        { key: '_actions',     label: '',                  width: 110, sortable: false, render: v => v },
      ],
      data,
      rowHeight: 44,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Case modal --
  const CASE_FIELDS = ['msku','asin','fnsku','title','recon_type','case_reason','shipment_id','order_id','case_id','status','units_claimed','units_approved','amount_claimed','amount_approved','issue_date','raised_date','notes'];

  function openCaseModal(row) {
    const m = document.getElementById('modal-case');
    if (!m) return;
    CASE_FIELDS.forEach(f => {
      const el = document.getElementById('cf-' + f);
      if (!el) return;
      el.value = row ? (row[f] != null ? row[f] : '') : (f === 'status' ? 'pending' : '');
    });
    document.getElementById('cf-id').value = row?.id || '';
    document.getElementById('modal-case-title').textContent = row ? 'Edit Case' : 'New Case';
    m.style.display = 'flex';
  }

  function closeCaseModal() {
    const m = document.getElementById('modal-case');
    if (m) m.style.display = 'none';
  }

  async function submitCase() {
    const id   = document.getElementById('cf-id').value;
    const msku = document.getElementById('cf-msku').value.trim();
    const rt   = document.getElementById('cf-recon_type').value;
    if (!msku) { window.Toast?.show('MSKU is required', 'error'); return; }
    if (!rt)   { window.Toast?.show('Recon Type is required', 'error'); return; }
    const body = {};
    CASE_FIELDS.forEach(f => { const el = document.getElementById('cf-' + f); if (el) body[f] = el.value || null; });
    try {
      const res = await fetch(id ? `${API}/cases/${id}` : `${API}/cases`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      window.Toast?.show(id ? '? Case updated!' : '? Case saved!', 'success');
      closeCaseModal();
      loadCases();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  async function deleteCase(id) {
    if (!confirm('Delete this case? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API}/cases/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      window.Toast?.show('?? Case deleted', 'success');
      loadCases();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  // ----------------------------------------
  // MANUAL ADJUSTMENTS
  // ----------------------------------------
  async function loadAdjs() {
    const rt = document.getElementById('adj-rt')?.value || '';
    const at = document.getElementById('adj-at')?.value || '';
    const sq = (document.getElementById('adj-q')?.value || '').trim();
    const p  = new URLSearchParams();
    if (rt) p.set('recon_type', rt);
    if (at) p.set('adj_type', at);
    if (sq) p.set('search', sq);

    const wrap = document.getElementById('adj-table');
    if (wrap) wrap.innerHTML = `<div class="skeleton" style="height:160px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/manual-adjustments${p.toString() ? '?' + p : ''}`).then(r => r.json());
      adjData = d.rows || [];
      updateAdjKPIs();
      renderAdjTable();
    } catch (e) {
      window.Toast?.show('Failed to load adjustments: ' + e.message, 'error');
      if (wrap) wrap.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${escH(e.message)}</div>`;
    }
  }

  function updateAdjKPIs() {
    const total = adjData.length;
    const pos   = adjData.filter(r => (parseInt(r.qty_adjusted) || 0) > 0).length;
    const neg   = adjData.filter(r => (parseInt(r.qty_adjusted) || 0) < 0).length;
    const net   = adjData.reduce((s, r) => s + (parseInt(r.qty_adjusted) || 0), 0);
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
    set('adj-k-total', total);
    set('adj-k-pos',   pos);
    set('adj-k-neg',   neg);
    set('adj-k-net',   (net >= 0 ? '+' : '') + net);
  }

  function renderAdjTable() {
    const el = document.getElementById('adj-table');
    if (!el) return;
    el.innerHTML = '';
    if (!adjData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">No adjustments found � click "+ New Adjustment" to add one</div>`;
      return;
    }
    const data = adjData.map((r, i) => {
      const qa = parseInt(r.qty_adjusted) || 0;
      const qc = qa > 0 ? 'var(--green)' : qa < 0 ? 'var(--red)' : 'var(--text3)';
      return {
        ...r,
        _msku:       mskuCell(r),
        _recon:      reconBadge(r.recon_type),
        _adj_type:   adjTypeBadge(r.adj_type),
        _ship_order: escH(r.shipment_id || r.order_id || '�'),
        _qty_adj:    `<span style="color:${qc};font-weight:700;font-family:monospace">${qa > 0 ? '+' : ''}${qa}</span>`,
        _created:    fd(r.created_at),
        _actions:    `<div style="display:flex;gap:4px">
          <button class="btn btn-xs btn-outline" onclick="window.__adjEdit(${i})">Edit</button>
          <button class="btn btn-xs btn-danger"  onclick="window.__adjDelete(${r.id})">Del</button>
        </div>`,
      };
    });
    window.VTable.create(el, {
      columns: [
        { key: '_msku',       label: 'MSKU / Title',    width: 185, sortable: false, render: v => v },
        { key: '_recon',      label: 'Recon Type',       width: 120, sortable: false, render: v => v },
        { key: '_adj_type',   label: 'Adj Type',         width: 105, sortable: false, render: v => v },
        { key: '_ship_order', label: 'Shipment / Order', width: 145 },
        { key: 'qty_before',  label: 'Qty Before',       width: 90,  numeric: true, render: v => fn(v) },
        { key: '_qty_adj',    label: 'Qty Adjusted',     width: 105, sortable: false, render: v => v },
        { key: 'qty_after',   label: 'Qty After',        width: 85,  numeric: true, render: v => fn(v) },
        { key: 'reason',      label: 'Reason',           width: 150 },
        { key: '_created',    label: 'Created',          width: 100 },
        { key: '_actions',    label: '',                 width: 110, sortable: false, render: v => v },
      ],
      data,
      rowHeight: 44,
      exportable: true,
      columnToggle: true,
    });
  }

  // -- Adjustment modal --
  const ADJ_FIELDS = ['msku','asin','fnsku','title','recon_type','adj_type','shipment_id','order_id','qty_before','qty_adjusted','reason','notes'];

  function openAdjModal(row) {
    const m = document.getElementById('modal-adj');
    if (!m) return;
    ADJ_FIELDS.forEach(f => {
      const el = document.getElementById('af-' + f);
      if (!el) return;
      el.value = row ? (row[f] != null ? row[f] : '') : '';
    });
    document.getElementById('af-id').value = row?.id || '';
    document.getElementById('modal-adj-title').textContent = row ? 'Edit Adjustment' : 'New Adjustment';
    m.style.display = 'flex';
  }

  function closeAdjModal() {
    const m = document.getElementById('modal-adj');
    if (m) m.style.display = 'none';
  }

  async function submitAdj() {
    const id   = document.getElementById('af-id').value;
    const msku = document.getElementById('af-msku').value.trim();
    const rt   = document.getElementById('af-recon_type').value;
    const at   = document.getElementById('af-adj_type').value;
    const qa   = document.getElementById('af-qty_adjusted').value;
    const rsn  = document.getElementById('af-reason').value.trim();
    if (!msku) { window.Toast?.show('MSKU is required', 'error'); return; }
    if (!rt)   { window.Toast?.show('Recon Type is required', 'error'); return; }
    if (!at)   { window.Toast?.show('Adj Type is required', 'error'); return; }
    if (!qa)   { window.Toast?.show('Qty Adjusted is required', 'error'); return; }
    if (!rsn)  { window.Toast?.show('Reason is required', 'error'); return; }
    const body = {};
    ADJ_FIELDS.forEach(f => { const el = document.getElementById('af-' + f); if (el) body[f] = el.value || null; });
    try {
      const res = await fetch(id ? `${API}/manual-adjustments/${id}` : `${API}/manual-adjustments`, {
        method: id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      window.Toast?.show(id ? '? Updated!' : '? Adjustment saved!', 'success');
      closeAdjModal();
      loadAdjs();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  async function deleteAdj(id) {
    if (!confirm('Delete this adjustment? This cannot be undone.')) return;
    try {
      const res = await fetch(`${API}/manual-adjustments/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json()).error || res.statusText);
      window.Toast?.show('?? Adjustment deleted', 'success');
      loadAdjs();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  // -- Tab switch --
  function switchTab(t) {
    activeTab = t;
    ['cases','adj'].forEach(id => {
      const p = document.getElementById('ca-panel-' + id);
      if (p) p.style.display = t === id ? '' : 'none';
      const b = document.getElementById('ca-tab-' + id);
      if (b) b.classList.toggle('active', t === id);
    });
    if (t === 'adj' && !adjData.length) loadAdjs();
  }

  // ----------------------------------------
  // RENDER
  // ----------------------------------------
  function render(container) {
    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Cases &amp; Adjustments</div>
          <div class="page-sub">Manage reimbursement cases and manual inventory adjustments</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__caRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:8px;margin-bottom:16px">
        <button class="btn btn-sm btn-outline active" id="ca-tab-cases" onclick="window.__caSwitch('cases')">Cases</button>
        <button class="btn btn-sm btn-outline"        id="ca-tab-adj"   onclick="window.__caSwitch('adj')">Manual Adjustments</button>
      </div>

      <!-- -- CASES PANEL -- -->
      <div id="ca-panel-cases">
        <div class="stat-grid" style="margin-bottom:14px">
          <div class="stat-card"><div class="stat-label">Total Cases</div><div class="stat-value" id="ca-k-total"    style="color:var(--accent)">�</div></div>
          <div class="stat-card"><div class="stat-label">Pending</div>    <div class="stat-value" id="ca-k-pending"  style="color:var(--orange)">�</div></div>
          <div class="stat-card"><div class="stat-label">Raised</div>     <div class="stat-value" id="ca-k-raised"   style="color:var(--accent)">�</div></div>
          <div class="stat-card"><div class="stat-label">Approved</div>   <div class="stat-value" id="ca-k-approved" style="color:var(--green)">�</div></div>
          <div class="stat-card"><div class="stat-label">Total $ Approved</div><div class="stat-value" id="ca-k-amount" style="color:var(--green)">�</div></div>
        </div>

        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Recon Type</div>
            <select id="ca-rt" style="height:32px" onchange="window.__caLoadCases()">
              <option value="">All Types</option>
              <option value="shipment">Shipment</option>
              <option value="removal">Removal</option>
              <option value="return">Return</option>
              <option value="replacement">Replacement</option>
              <option value="fc_transfer">FC Transfer</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Status</div>
            <select id="ca-st" style="height:32px" onchange="window.__caLoadCases()">
              <option value="">All Statuses</option>
              <option value="pending">Pending</option>
              <option value="raised">Raised</option>
              <option value="approved">Approved</option>
              <option value="partial">Partial</option>
              <option value="rejected">Rejected</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div style="flex:1;min-width:180px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / Case ID</div>
            <input id="ca-q" placeholder="Search�" style="height:32px;width:100%" oninput="window.__caDbCases()">
          </div>
          <div style="align-self:flex-end;display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="window.__caClearCases()">? Clear</button>
            <button class="btn btn-primary btn-sm" onclick="window.__caNewCase()">+ New Case</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span>Cases</span></div>
          <div style="padding:12px" id="ca-table">
            <div class="skeleton" style="height:160px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- -- ADJUSTMENTS PANEL -- -->
      <div id="ca-panel-adj" style="display:none">
        <div class="stat-grid" style="margin-bottom:14px">
          <div class="stat-card"><div class="stat-label">Total Adjustments</div><div class="stat-value" id="adj-k-total" style="color:var(--accent)">�</div></div>
          <div class="stat-card"><div class="stat-label">Positive (+qty)</div>    <div class="stat-value" id="adj-k-pos"   style="color:var(--green)">�</div></div>
          <div class="stat-card"><div class="stat-label">Negative (-qty)</div>    <div class="stat-value" id="adj-k-neg"   style="color:var(--red)">�</div></div>
          <div class="stat-card"><div class="stat-label">Net Qty</div>             <div class="stat-value" id="adj-k-net"   style="color:var(--text)">�</div></div>
        </div>

        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Recon Type</div>
            <select id="adj-rt" style="height:32px" onchange="window.__adjLoad()">
              <option value="">All Types</option>
              <option value="shipment">Shipment</option>
              <option value="removal">Removal</option>
              <option value="return">Return</option>
              <option value="replacement">Replacement</option>
              <option value="fc_transfer">FC Transfer</option>
              <option value="reimbursement">Reimbursement</option>
              <option value="gnr">GNR</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Adj Type</div>
            <select id="adj-at" style="height:32px" onchange="window.__adjLoad()">
              <option value="">All Types</option>
              <option value="loss">Loss</option>
              <option value="found">Found</option>
              <option value="damage">Damage</option>
              <option value="correction">Correction</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div style="flex:1;min-width:180px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / FNSKU</div>
            <input id="adj-q" placeholder="Search�" style="height:32px;width:100%" oninput="window.__adjDb()">
          </div>
          <div style="align-self:flex-end;display:flex;gap:6px">
            <button class="btn btn-outline btn-sm" onclick="window.__adjClear()">? Clear</button>
            <button class="btn btn-primary btn-sm" onclick="window.__adjNew()">+ New Adjustment</button>
          </div>
        </div>

        <div class="card">
          <div class="card-header"><span>Manual Adjustments</span></div>
          <div style="padding:12px" id="adj-table">
            <div class="skeleton" style="height:160px;border-radius:8px"></div>
          </div>
        </div>
      </div>

      <!-- -- MODAL: New / Edit Case -- -->
      <div id="modal-case" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:center;justify-content:center"
           onclick="if(event.target===this)window.__caCloseCase()">
        <div style="background:var(--surface);border-radius:12px;width:620px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div style="font-weight:700;font-size:15px" id="modal-case-title">New Case</div>
            <button style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3)" onclick="window.__caCloseCase()">?</button>
          </div>
          <input type="hidden" id="cf-id">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><label class="form-label">MSKU *</label><input id="cf-msku" class="form-input" placeholder="MSKU"></div>
            <div><label class="form-label">ASIN</label><input id="cf-asin" class="form-input" placeholder="ASIN"></div>
            <div><label class="form-label">FNSKU</label><input id="cf-fnsku" class="form-input" placeholder="FNSKU"></div>
            <div><label class="form-label">Title</label><input id="cf-title" class="form-input" placeholder="Product title"></div>
            <div>
              <label class="form-label">Recon Type *</label>
              <select id="cf-recon_type" class="form-input">
                <option value="">� Select �</option>
                <option value="shipment">Shipment</option>
                <option value="removal">Removal</option>
                <option value="return">Return</option>
                <option value="replacement">Replacement</option>
                <option value="fc_transfer">FC Transfer</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label class="form-label">Case Reason</label><input id="cf-case_reason" class="form-input" placeholder="e.g. Lost_Inbound"></div>
            <div><label class="form-label">Shipment ID</label><input id="cf-shipment_id" class="form-input" placeholder="FBA�"></div>
            <div><label class="form-label">Order ID</label><input id="cf-order_id" class="form-input" placeholder="Order ID"></div>
            <div><label class="form-label">Case ID</label><input id="cf-case_id" class="form-input" placeholder="Amazon case #"></div>
            <div>
              <label class="form-label">Status</label>
              <select id="cf-status" class="form-input">
                <option value="pending">Pending</option>
                <option value="raised">Raised</option>
                <option value="approved">Approved</option>
                <option value="partial">Partial</option>
                <option value="rejected">Rejected</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <div><label class="form-label">Units Claimed</label><input type="number" id="cf-units_claimed"   class="form-input" placeholder="0"></div>
            <div><label class="form-label">Units Approved</label><input type="number" id="cf-units_approved"  class="form-input" placeholder="0"></div>
            <div><label class="form-label">Amount Claimed ($)</label><input type="number" step="0.01" id="cf-amount_claimed"   class="form-input" placeholder="0.00"></div>
            <div><label class="form-label">Amount Approved ($)</label><input type="number" step="0.01" id="cf-amount_approved"  class="form-input" placeholder="0.00"></div>
            <div><label class="form-label">Issue Date</label><input type="date" id="cf-issue_date"   class="form-input"></div>
            <div><label class="form-label">Raised Date</label><input type="date" id="cf-raised_date"  class="form-input"></div>
          </div>
          <div style="margin-top:12px">
            <label class="form-label">Notes</label>
            <textarea id="cf-notes" class="form-input" rows="3" style="resize:vertical" placeholder="Additional notes�"></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
            <button class="btn btn-outline" onclick="window.__caCloseCase()">Cancel</button>
            <button class="btn btn-primary" onclick="window.__caSubmitCase()">Save Case</button>
          </div>
        </div>
      </div>

      <!-- -- MODAL: New / Edit Adjustment -- -->
      <div id="modal-adj" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:200;align-items:center;justify-content:center"
           onclick="if(event.target===this)window.__adjCloseModal()">
        <div style="background:var(--surface);border-radius:12px;width:600px;max-width:95vw;max-height:90vh;overflow-y:auto;padding:24px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px">
            <div style="font-weight:700;font-size:15px" id="modal-adj-title">New Adjustment</div>
            <button style="background:none;border:none;font-size:18px;cursor:pointer;color:var(--text3)" onclick="window.__adjCloseModal()">?</button>
          </div>
          <input type="hidden" id="af-id">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
            <div><label class="form-label">MSKU *</label><input id="af-msku" class="form-input" placeholder="MSKU"></div>
            <div><label class="form-label">ASIN</label><input id="af-asin" class="form-input" placeholder="ASIN"></div>
            <div><label class="form-label">FNSKU</label><input id="af-fnsku" class="form-input" placeholder="FNSKU"></div>
            <div><label class="form-label">Title</label><input id="af-title" class="form-input" placeholder="Product title"></div>
            <div>
              <label class="form-label">Recon Type *</label>
              <select id="af-recon_type" class="form-input">
                <option value="">� Select �</option>
                <option value="shipment">Shipment</option>
                <option value="removal">Removal</option>
                <option value="return">Return</option>
                <option value="replacement">Replacement</option>
                <option value="fc_transfer">FC Transfer</option>
                <option value="reimbursement">Reimbursement</option>
                <option value="gnr">GNR</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label class="form-label">Adj Type *</label>
              <select id="af-adj_type" class="form-input">
                <option value="">� Select �</option>
                <option value="loss">Loss</option>
                <option value="found">Found</option>
                <option value="damage">Damage</option>
                <option value="correction">Correction</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div><label class="form-label">Shipment ID</label><input id="af-shipment_id" class="form-input" placeholder="FBA�"></div>
            <div><label class="form-label">Order ID</label><input id="af-order_id" class="form-input" placeholder="Order ID"></div>
            <div><label class="form-label">Qty Before</label><input type="number" id="af-qty_before"    class="form-input" placeholder="0"></div>
            <div><label class="form-label">Qty Adjusted *</label><input type="number" id="af-qty_adjusted" class="form-input" placeholder="e.g. -3 or +5"></div>
          </div>
          <div style="margin-top:12px">
            <label class="form-label">Reason *</label>
            <input id="af-reason" class="form-input" placeholder="Reason for adjustment">
          </div>
          <div style="margin-top:10px">
            <label class="form-label">Notes</label>
            <textarea id="af-notes" class="form-input" rows="2" style="resize:vertical" placeholder="Additional notes�"></textarea>
          </div>
          <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:18px">
            <button class="btn btn-outline" onclick="window.__adjCloseModal()">Cancel</button>
            <button class="btn btn-primary" onclick="window.__adjSubmit()">Save Adjustment</button>
          </div>
        </div>
      </div>
    `;

    if (window.lucide) window.lucide.createIcons();

    // -- Globals --
    window.__caRefresh     = () => { loadCases(); if (activeTab === 'adj') loadAdjs(); };
    window.__caSwitch      = switchTab;
    window.__caLoadCases   = loadCases;
    window.__caDbCases     = () => debounce('ca', loadCases, 400);
    window.__caClearCases  = () => {
      ['ca-rt','ca-st','ca-q'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      loadCases();
    };
    window.__caNewCase     = () => openCaseModal(null);
    window.__caEditCase    = idx => openCaseModal(casesData[idx]);
    window.__caDeleteCase  = deleteCase;
    window.__caCloseCase   = closeCaseModal;
    window.__caSubmitCase  = submitCase;

    window.__adjLoad       = loadAdjs;
    window.__adjDb         = () => debounce('adj', loadAdjs, 400);
    window.__adjClear      = () => {
      ['adj-rt','adj-at','adj-q'].forEach(id => { const e = document.getElementById(id); if (e) e.value = ''; });
      loadAdjs();
    };
    window.__adjNew        = () => openAdjModal(null);
    window.__adjEdit       = idx => openAdjModal(adjData[idx]);
    window.__adjDelete     = deleteAdj;
    window.__adjCloseModal = closeAdjModal;
    window.__adjSubmit     = submitAdj;

    loadCases();
  }

  function refresh() {
    if (activeTab === 'cases') loadCases();
    else loadAdjs();
  }

  window.__viewExport = { render, refresh };
})();
