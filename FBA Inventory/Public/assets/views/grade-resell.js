/* ====================================================
   Grade & Resell View
   APIs: /grade-resell (GET/POST/PUT/DELETE),
         /msku-suggest
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

  let pipelineData = [], pipelineFiltered = [], activeTab = 'pipeline';
  let _pStatusF = '';
  let _grade = 'Like New', _channel = 'FBA';
  let colFilters = {};
  const COL_TOTALS = [
    { key: 'quantity'     },
    { key: 'resell_price', currency: true },
  ];

  function updateColTotals() {
    COL_TOTALS.forEach(col => {
      const el = document.getElementById('ct-' + col.key);
      if (!el) return;
      const total = pipelineFiltered.reduce((s, r) => s + (col.currency ? (parseFloat(r[col.key]) || 0) : (parseInt(r[col.key]) || 0)), 0);
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
    renderPipeline();
  }

  const _timers = {};
  function debounce(fn, ms) {
    return function () { clearTimeout(_timers[fn]); _timers[fn] = setTimeout(fn, ms); };
  }

  function fd(v) { return v ? String(v).split('T')[0] : '—'; }
  function fn(v) { const n = parseInt(v); return isNaN(n) ? '—' : n.toLocaleString(); }
  function fm(v) { const n = parseFloat(v); return isNaN(n) || n === 0 ? '—' : '$' + n.toFixed(2); }

  // -- KPIs --
  async function loadKPIs() {
    try {
      const d = await fetch(`${API}/grade-resell`).then(r => r.json());
      const s = d.stats || {};
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('k-total',   Number(s.total   || 0).toLocaleString());
      set('k-graded',  Number(s.graded  || 0).toLocaleString());
      set('k-listed',  Number(s.listed  || 0).toLocaleString());
      set('k-sold',    Number(s.sold    || 0).toLocaleString());
      set('k-disposed',Number(s.disposed || 0).toLocaleString());
      set('k-value',   '$' + Number(s.total_value || 0).toFixed(2));
    } catch (e) { console.warn('kpi:', e); }
  }

  // -- Intake --
  async function onMskuInput() {
    const q = document.getElementById('i-msku')?.value;
    if (!q || q.length < 2) { hideSuggest(); return; }
    try {
      const d = await fetch(`${API}/msku-suggest?q=${encodeURIComponent(q)}`).then(r => r.json());
      const list = document.getElementById('suggest-list');
      if (!list) return;
      const rows = d.rows || d || [];
      if (!rows.length) { hideSuggest(); return; }
      list.innerHTML = rows.slice(0, 10).map(r =>
        `<div class="suggest-item" onclick="window.__gnrPickSuggest('${(r.msku||'').replace(/'/g,"\\'")}','${(r.title||'').replace(/'/g,"\\'")}','${r.fnsku||''}','${r.asin||''}')">${r.msku}${r.title ? ' — ' + r.title.slice(0, 40) : ''}</div>`
      ).join('');
      list.style.display = 'block';
    } catch (e) { hideSuggest(); }
  }

  function hideSuggest() {
    const list = document.getElementById('suggest-list');
    if (list) list.style.display = 'none';
  }

  function pickSuggest(msku, title, fnsku, asin) {
    const set = (id, v) => { const e = document.getElementById(id); if (e) e.value = v; };
    set('i-msku', msku); set('i-title', title); set('i-fnsku', fnsku); set('i-asin', asin);
    hideSuggest();
  }

  function setGrade(val) {
    _grade = val;
    document.querySelectorAll('.gb').forEach(b => b.classList.toggle('active', b.dataset.v === val));
  }

  function setChannel(val) {
    _channel = val;
    document.querySelectorAll('.cb2').forEach(b => b.classList.toggle('active', b.dataset.v === val));
  }

  async function submitIntake() {
    const get = id => document.getElementById(id)?.value || '';
    const body = {
      msku:         get('i-msku'),
      title:        get('i-title'),
      fnsku:        get('i-fnsku'),
      asin:         get('i-asin'),
      quantity:     parseInt(get('i-qty')) || 1,
      grade:        _grade,
      channel:      _channel,
      resell_price: parseFloat(get('i-price')) || null,
      graded_date:  get('i-date'),
      graded_by:    get('i-by'),
      notes:        get('i-notes'),
      source:       get('i-source'),
      order_id:     get('i-order-id'),
      lpn:          get('i-lpn'),
      unit_status:  get('i-unit-status'),
      used_msku:    get('i-used-msku'),
      used_fnsku:   get('i-used-fnsku'),
      used_condition: get('i-used-condition'),
    };
    if (!body.msku) { window.Toast?.show('Original MSKU is required', 'error'); return; }
    const btn = document.getElementById('btn-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const d = await fetch(`${API}/grade-resell`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      }).then(r => r.json());
      window.Toast?.show(`? ${d.updated ? 'Qty added to existing' : 'New item saved'} — ${body.msku} (${body.grade} / ${body.channel})`, 'success');
      clearIntake();
      loadKPIs();
      if (activeTab === 'pipeline') loadPipeline();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '? Save Item'; }
    }
  }

  function clearIntake() {
    ['i-msku','i-title','i-fnsku','i-asin','i-order-id','i-notes','i-by','i-lpn','i-used-msku','i-used-fnsku'].forEach(id => {
      const e = document.getElementById(id); if (e) e.value = '';
    });
    const qty = document.getElementById('i-qty'); if (qty) qty.value = 1;
    const price = document.getElementById('i-price'); if (price) price.value = '';
    const dt = document.getElementById('i-date'); if (dt) dt.value = new Date().toISOString().split('T')[0];
    const src = document.getElementById('i-source'); if (src) src.value = 'manual';
    const us = document.getElementById('i-unit-status'); if (us) us.value = 'Succeeded';
    setGrade('Like New'); setChannel('FBA');
  }

  // -- Pipeline --
  async function loadPipeline() {
    const p = new URLSearchParams();
    const g  = document.getElementById('p-grade')?.value;
    const ch = document.getElementById('p-channel')?.value;
    const fr = document.getElementById('p-from')?.value;
    const to = document.getElementById('p-to')?.value;
    const sr = document.getElementById('p-search')?.value;
    if (_pStatusF) p.set('status', _pStatusF);
    if (g)  p.set('grade',   g);
    if (ch) p.set('channel', ch);
    if (fr) p.set('from', fr);
    if (to) p.set('to', to);
    if (sr) p.set('search', sr);

    const el = document.getElementById('pipe-vtable');
    if (el) el.innerHTML = `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
    try {
      const d = await fetch(`${API}/grade-resell${p.toString() ? '?' + p : ''}`).then(r => r.json());
      pipelineData = d.rows || [];
      const s = d.stats || {};
      const set = (id, v) => { const e = document.getElementById(id); if (e) e.textContent = v; };
      set('k-total',   Number(s.total    || 0).toLocaleString());
      set('k-graded',  Number(s.graded   || 0).toLocaleString());
      set('k-listed',  Number(s.listed   || 0).toLocaleString());
      set('k-sold',    Number(s.sold     || 0).toLocaleString());
      set('k-disposed',Number(s.disposed || 0).toLocaleString());
      set('k-value',   '$' + Number(s.total_value || 0).toFixed(2));
      colFilters = {};
      renderPipeline();
    } catch (e) {
      window.Toast?.show('Failed to load pipeline: ' + e.message, 'error');
      if (el) el.innerHTML = `<div style="padding:40px;text-align:center;color:var(--red)">${e.message}</div>`;
    }
  }

  function gradeBadge(g) {
    const map = { 'Like New': ['badge-green','Like New'], 'Good': ['badge-blue','Good'], 'Acceptable': ['badge-orange','Acceptable'], 'Poor': ['badge-red','Poor'], 'Unsellable': ['badge-gray','Unsellable'] };
    const [cls, label] = map[g] || ['badge-gray', g || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function statusBadge(s) {
    const map = { 'Graded': ['badge-orange','Graded'], 'Listed': ['badge-blue','Listed'], 'Sold': ['badge-green','Sold'], 'Disposed': ['badge-gray','Disposed'] };
    const [cls, label] = map[s] || ['badge-gray', s || '—'];
    return `<span class="badge ${cls}">${label}</span>`;
  }

  function channelBadge(c) {
    const map = { 'FBA': 'badge-blue', 'Local': 'badge-orange', 'Donate': 'badge-green', 'Dispose': 'badge-gray', 'Merchant': 'badge-blue' };
    return `<span class="badge ${map[c] || 'badge-gray'}">${c || '—'}</span>`;
  }

  function renderPipeline() {
    const el = document.getElementById('pipe-vtable');
    if (!el) return;
    el.innerHTML = '';
    if (!pipelineData.length) {
      el.innerHTML = `<div style="padding:48px;text-align:center;color:var(--text3)">No items in pipeline. Use the Intake tab to add items.</div>`;
      return;
    }
    pipelineFiltered = [...pipelineData];
    Object.keys(colFilters).forEach(key => {
      const isAmt = key === 'resell_price';
      pipelineFiltered = pipelineFiltered.filter(r =>
        (isAmt ? (parseFloat(r[key]) || 0) : (parseInt(r[key]) || 0)) !== 0
      );
    });
    const data = pipelineFiltered.map(r => ({
      ...r,
      _grade:   gradeBadge(r.grade),
      _status:  statusBadge(r.status),
      _channel: channelBadge(r.channel),
      _actions: `<button class="btn btn-sm btn-outline" onclick="window.__gnrEditItem(${r.id})" title="Edit">??</button>
                 <button class="btn btn-sm btn-danger"  onclick="window.__gnrDelItem(${r.id})"  title="Delete">??</button>`,
    }));
    window.VTable.create(el, {
      columns: [
        { key: 'graded_date',  label: 'Graded Date', width: 100, render: v => fd(v) },
        { key: 'msku',         label: 'MSKU',        width: 150 },
        { key: 'title',        label: 'Title',        width: 180 },
        { key: 'source',       label: 'Source',       width: 90 },
        { key: 'order_id',     label: 'Order ID(s)',  width: 140,
          render: (v, r) => {
            if (!v) return '<span style="color:var(--text3)">—</span>';
            const ids = String(v).split(',').map(s => s.trim()).filter(Boolean);
            if (ids.length <= 1) return '<span style="font-family:monospace;font-size:11px">' + escH(ids[0] || '—') + '</span>';
            const tip = '<b>' + ids.length + ' Order IDs</b><hr>' + ids.map(id => escH(id)).join('<br>');
            return dataTip(tip,
              '<span style="font-family:monospace;font-size:11px;cursor:help">'
              + escH(ids[0]) + ' <span style="color:var(--text3)">+' + (ids.length - 1) + ' more</span></span>',
              'cursor:help');
          }
        },
        { key: 'quantity',     label: 'Qty',          width: 60, numeric: true, render: v => fn(v) },
        { key: '_grade',       label: 'Grade',        width: 110, sortable: false, render: v => v },
        { key: '_channel',     label: 'Channel',      width: 100, sortable: false, render: v => v },
        { key: 'resell_price', label: 'Price',        width: 80, numeric: true, render: v => fm(v) },
        { key: '_status',      label: 'Pipeline',     width: 100, sortable: false, render: v => v },
        { key: 'unit_status',  label: 'Unit Status',  width: 110,
          render: (v, r) => {
            if (!v) return '<span style="color:var(--text3)">—</span>';
            const color = v === 'Succeeded' ? '#10b981' : v === 'Failed' ? '#ef4444' : '#f59e0b';
            const tip = '<b>Status</b>: ' + escH(v || '—')
              + (r.failure_reason ? '<br><b>Reason</b>: ' + escH(r.failure_reason) : '');
            return dataTip(tip,
              '<span style="color:' + color + ';font-weight:600">' + escH(v || '—') + '</span>',
              'cursor:help');
          }
        },
        { key: 'used_msku',    label: 'Used MSKU',    width: 150 },
        { key: 'notes',        label: 'Notes',        width: 140 },
        { key: '_actions',     label: 'Actions',      width: 100, sortable: false, render: v => v },
      ],
      data,
      rowHeight: 38,
      exportable: true,
      columnToggle: true,
    });
  }

  async function editItem(id) {
    const r = pipelineData.find(x => x.id === id);
    if (!r) return;
    const newStatus = prompt('Update status (Graded / Listed / Sold / Disposed):', r.status);
    if (!newStatus) return;
    const newPrice  = prompt('Update resell price:', r.resell_price || '');
    try {
      await fetch(`${API}/grade-resell/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, resell_price: parseFloat(newPrice) || r.resell_price }),
      }).then(r => r.json());
      window.Toast?.show('Item updated', 'success');
      loadPipeline();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  async function deleteItem(id) {
    const ok = await window.Modal?.confirm('Delete item', 'This will permanently remove this grade & resell entry. Continue?');
    if (!ok) return;
    try {
      await fetch(`${API}/grade-resell/${id}`, { method: 'DELETE' }).then(r => r.json());
      window.Toast?.show('Item deleted', 'success');
      loadPipeline(); loadKPIs();
    } catch (e) {
      window.Toast?.show('Error: ' + e.message, 'error');
    }
  }

  function filterStatus(v) {
    _pStatusF = v;
    document.querySelectorAll('.spill').forEach(p => p.classList.remove('active'));
    document.querySelector(`.spill[data-st="${v}"]`)?.classList.add('active');
    loadPipeline();
  }

  function switchTab(t) {
    activeTab = t;
    ['intake', 'pipeline', 'summary'].forEach(x => {
      const p = document.getElementById(`panel-${x}`);
      if (p) p.style.display = x === t ? '' : 'none';
    });
    document.querySelectorAll('.gnr-tab').forEach(b => b.classList.remove('active'));
    document.getElementById(`gtab-${t}`)?.classList.add('active');
    if (t === 'pipeline') loadPipeline();
    if (t === 'summary')  loadKPIs();
  }

  // -- Render --
  function render(container) {
    const today = new Date().toISOString().split('T')[0];
    const d30   = new Date(Date.now() - 30 * 864e5).toISOString().split('T')[0];

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Grade & Resell</div>
          <div class="page-sub">Track removed/returned items through grading, listing, and resale pipeline</div>
        </div>
        <button class="btn btn-outline btn-sm" onclick="window.__gnrRefresh()">
          <i data-lucide="refresh-cw" style="width:13px;height:13px"></i> Refresh
        </button>
      </div>

      <!-- KPI Stats -->
      <div class="stat-grid" style="margin-bottom:16px">
        <div class="stat-card">
          <div class="stat-label">Total Items</div>
          <div class="stat-value" id="k-total" style="color:var(--accent)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Graded</div>
          <div class="stat-value" id="k-graded" style="color:var(--orange)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Listed</div>
          <div class="stat-value" id="k-listed" style="color:var(--accent)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Sold</div>
          <div class="stat-value" id="k-sold" style="color:var(--green)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Disposed</div>
          <div class="stat-value" id="k-disposed" style="color:var(--text3)">—</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Est. Total Value</div>
          <div class="stat-value" id="k-value" style="color:var(--green)">—</div>
        </div>
      </div>

      <!-- Tab bar -->
      <div style="display:flex;gap:8px;margin-bottom:14px">
        <button class="btn btn-sm btn-outline gnr-tab"        id="gtab-intake"    onclick="window.__gnrSwitch('intake')">Intake / Grade Item</button>
        <button class="btn btn-sm btn-outline gnr-tab active" id="gtab-pipeline"  onclick="window.__gnrSwitch('pipeline')">Pipeline</button>
      </div>

      <!-- INTAKE TAB -->
      <div id="panel-intake" style="display:none">
        <div class="card">
          <div class="card-header">
            <span>Grade a New Item</span>
            <span class="text-sm text-muted">Items with Used MSKU will also appear in GNR Recon</span>
          </div>
          <div class="card-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:16px">
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Original MSKU *</div>
                <div style="position:relative">
                  <input id="i-msku" placeholder="Type MSKU or scan barcode…" style="height:32px;width:100%" oninput="window.__gnrMskuInput()" autocomplete="off">
                  <div id="suggest-list" style="display:none;position:absolute;top:34px;left:0;right:0;background:var(--surface);border:1px solid var(--border);border-radius:8px;z-index:50;max-height:200px;overflow-y:auto;box-shadow:0 4px 12px rgba(0,0,0,.1)"></div>
                </div>
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Title</div>
                <input id="i-title" placeholder="Auto-filled or enter manually" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Original FNSKU</div>
                <input id="i-fnsku" placeholder="e.g. X004XXXXXX" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">ASIN</div>
                <input id="i-asin" placeholder="e.g. B0XXXXXXXX" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Source</div>
                <select id="i-source" style="height:32px;width:100%">
                  <option value="manual">Manual Intake</option><option value="removal">From Removal</option>
                  <option value="return">From Customer Return</option><option value="gnr">Amazon GNR</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Order ID / Reference</div>
                <input id="i-order-id" placeholder="e.g. 113-XXXXXXX" style="height:32px;width:100%">
              </div>
            </div>

            <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px">Amazon GNR Details</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px;margin-bottom:16px">
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">LPN</div>
                <input id="i-lpn" placeholder="e.g. LPNXXXXXXXXXX" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Unit Status</div>
                <select id="i-unit-status" style="height:32px;width:100%">
                  <option value="Succeeded">Succeeded</option><option value="Failed">Failed</option>
                </select>
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Used MSKU</div>
                <input id="i-used-msku" placeholder="amzn.gr.…" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Used FNSKU</div>
                <input id="i-used-fnsku" placeholder="e.g. X004XXXXXX" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Used Condition</div>
                <select id="i-used-condition" style="height:32px;width:100%">
                  <option value="">— Select —</option>
                  <option>Used - Like New</option><option>Used - Very Good</option>
                  <option>Used - Good</option><option>Used - Acceptable</option><option>Used - Poor</option>
                </select>
              </div>
            </div>

            <div style="font-size:12px;font-weight:700;color:var(--text2);margin-bottom:8px">Physical Grading</div>
            <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:14px;margin-bottom:14px">
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Quantity</div>
                <input type="number" id="i-qty" value="1" min="1" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Graded Date</div>
                <input type="date" id="i-date" value="${today}" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Graded By</div>
                <input id="i-by" placeholder="Staff name" style="height:32px;width:100%">
              </div>
            </div>
            <div style="margin-bottom:14px">
              <div class="text-sm text-muted" style="margin-bottom:6px">Warehouse Grade *</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${['Like New','Good','Acceptable','Poor','Unsellable'].map(g =>
                  `<button class="btn btn-sm btn-outline gb${g === 'Like New' ? ' active' : ''}" data-v="${g}" onclick="window.__gnrGrade('${g}')">${g}</button>`
                ).join('')}
              </div>
            </div>
            <div style="margin-bottom:14px">
              <div class="text-sm text-muted" style="margin-bottom:6px">Resale Channel *</div>
              <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${['FBA','Merchant','Local','Donate','Dispose'].map(c =>
                  `<button class="btn btn-sm btn-outline cb2${c === 'FBA' ? ' active' : ''}" data-v="${c}" onclick="window.__gnrChannel('${c}')">${c}</button>`
                ).join('')}
              </div>
            </div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:14px">
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Estimated Resell Price ($)</div>
                <input type="number" id="i-price" step="0.01" min="0" placeholder="0.00" style="height:32px;width:100%">
              </div>
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Notes</div>
                <input id="i-notes" placeholder="Internal notes…" style="height:32px;width:100%">
              </div>
            </div>
            <div style="display:flex;gap:10px">
              <button id="btn-submit" class="btn btn-primary" onclick="window.__gnrSubmit()">? Save Item</button>
              <button class="btn btn-outline" onclick="window.__gnrClear()">Clear Form</button>
            </div>
          </div>
        </div>
      </div>

      <!-- PIPELINE TAB -->
      <div id="panel-pipeline">
        <!-- Status filter pills -->
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px">
          <button class="btn btn-sm btn-outline spill active" data-st="" onclick="window.__gnrFilterStatus('')">All</button>
          <button class="btn btn-sm btn-outline spill" data-st="Graded"   onclick="window.__gnrFilterStatus('Graded')">Graded</button>
          <button class="btn btn-sm btn-outline spill" data-st="Listed"   onclick="window.__gnrFilterStatus('Listed')">Listed</button>
          <button class="btn btn-sm btn-outline spill" data-st="Sold"     onclick="window.__gnrFilterStatus('Sold')">Sold</button>
          <button class="btn btn-sm btn-outline spill" data-st="Disposed" onclick="window.__gnrFilterStatus('Disposed')">Disposed</button>
        </div>

        <!-- Pipeline filters -->
        <div class="filter-bar" style="margin-bottom:14px">
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Grade</div>
            <select id="p-grade" style="height:32px" onchange="window.__gnrPipe()">
              <option value="">All Grades</option>
              <option>Like New</option><option>Good</option><option>Acceptable</option>
              <option>Poor</option><option>Unsellable</option>
            </select>
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">Channel</div>
            <select id="p-channel" style="height:32px" onchange="window.__gnrPipe()">
              <option value="">All Channels</option>
              <option>FBA</option><option>Merchant</option><option>Local</option>
              <option>Donate</option><option>Dispose</option>
            </select>
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="p-from" style="height:32px" onchange="window.__gnrPipe()">
          </div>
          <div>
            <div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="p-to" style="height:32px" onchange="window.__gnrPipe()">
          </div>
          <div style="flex:1;min-width:160px">
            <div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / Title</div>
            <input id="p-search" placeholder="Search…" style="height:32px;width:100%" oninput="window.__gnrDbPipe()">
          </div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__gnrClearPipe()">? Clear</button>
          </div>
        </div>
        <div class="card">
          <div class="card-header"><span>Grade & Resell Pipeline</span></div>
          <div style="padding:12px" id="pipe-vtable">
            <div class="skeleton" style="height:200px;border-radius:8px"></div>
          </div>
        </div>
      </div>
    `;

    // inject suggest item style
    const style = document.createElement('style');
    style.textContent = `.suggest-item{padding:8px 12px;cursor:pointer;font-size:12px;color:var(--text)}.suggest-item:hover{background:var(--surface2)}`;
    container.appendChild(style);

    if (window.lucide) window.lucide.createIcons();

    const pipeV = document.getElementById('pipe-vtable');
    if (pipeV && !pipeV._gnrPipeTotalsBound) {
      pipeV._gnrPipeTotalsBound = true;
      pipeV.addEventListener('vtable:rendered', updateColTotals);
    }

    window.__gnrRefresh      = () => { loadKPIs(); loadPipeline(); };
    window.__gnrSwitch       = switchTab;
    window.__gnrMskuInput    = onMskuInput;
    window.__gnrPickSuggest  = pickSuggest;
    window.__gnrGrade        = setGrade;
    window.__gnrChannel      = setChannel;
    window.__gnrSubmit       = submitIntake;
    window.__gnrClear        = clearIntake;
    window.__gnrPipe         = loadPipeline;
    window.__gnrDbPipe       = debounce(loadPipeline, 400);
    window.__gnrFilterStatus = filterStatus;
    window.__gnrEditItem     = editItem;
    window.__gnrDelItem      = deleteItem;
    window.__gnrClearPipe    = () => {
      ['p-grade','p-channel','p-from','p-to','p-search'].forEach(id => {
        const e = document.getElementById(id); if (e) e.value = '';
      });
      _pStatusF = '';
      document.querySelectorAll('.spill').forEach(p => p.classList.remove('active'));
      document.querySelector('.spill[data-st=""]')?.classList.add('active');
      loadPipeline();
    };

    document.addEventListener('click', e => {
      if (!e.target.closest('#suggest-list') && !e.target.closest('#i-msku')) hideSuggest();
    });

    loadKPIs();
    loadPipeline();
  }

  function refresh() { loadKPIs(); loadPipeline(); }

  window.__viewExport = { render, refresh };
})();
