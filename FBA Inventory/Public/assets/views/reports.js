/* ====================================================
   Reports View — full port of reports.html
   All 11 report tabs with filtering, stats, VTable
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

  // -- Shared formatters --
  function fd(v) {
    if (!v) return '—';
    const d = new Date(String(v).slice(0, 10) + 'T12:00:00');
    return isNaN(d) ? '—' : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fn(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n.toLocaleString() : '—';
  }
  function fm(v) {
    const n = parseFloat(v);
    if (!Number.isFinite(n)) return '—';
    return '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function disCls(d) {
    const s = (d || '').toUpperCase();
    if (s === 'SELLABLE')  return 'badge badge-green';
    if (s.includes('DEFECT') || s.includes('DAMAGED') || s.includes('UNSELL')) return 'badge badge-red';
    if (s.includes('EXPIRED')) return 'badge badge-orange';
    return 'badge badge-gray';
  }

  // -- Tabs config --
  const TABS = [
    { key: 'shipped_to_fba',    label: 'Shipped to FBA' },
    { key: 'sales_data',        label: 'Sales Data' },
    { key: 'fba_receipts',      label: 'FBA Receipts' },
    { key: 'customer_returns',  label: 'Returns' },
    { key: 'reimbursements',    label: 'Reimbursements' },
    { key: 'fc_transfers',      label: 'FC Transfers' },
    { key: 'fba_removals',      label: 'FBA Removals' },
    { key: 'shipment_status',   label: 'Shipment Status' },
    { key: 'fba_summary',       label: 'FBA Summary' },
    { key: 'payment_repository',label: 'Payment Repo' },
    { key: 'settlement_report', label: 'Settlement' },
  ];

  let activeTab = 'shipped_to_fba';

  // -- State per report (reset on tab switch) --
  let allRows = [], filteredRows = [];

  function getTabFromHash() {
    const hash = window.location.hash;
    const q = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
    const p = new URLSearchParams(q);
    const r = p.get('r');
    if (!r) return 'shipped_to_fba';
    // Normalise
    if (r === 'payment-repository') return 'payment_repository';
    if (r === 'settlement-report')  return 'settlement_report';
    return r;
  }

  // -- Container refs --
  function cid(id) { return document.getElementById(id); }

  // -- Render shell --
  function render(container) {
    activeTab = getTabFromHash();
    container.innerHTML = `
      <div class="page-header" style="margin-bottom:0">
        <div class="page-title">Reports</div>
      </div>

      <!-- Tab bar -->
      <div id="rpt-tabbar" style="display:flex;flex-wrap:wrap;gap:6px;padding:14px 0 16px;position:sticky;top:0;z-index:20;background:var(--bg)">
        ${TABS.map(t => `
          <button class="btn btn-sm ${t.key === activeTab ? 'btn-primary' : 'btn-outline'}"
                  id="rtab-${t.key}" data-key="${t.key}" onclick="window.__rptSelectTab('${t.key}')">
            ${t.label}
          </button>
        `).join('')}
      </div>

      <div id="rpt-content"></div>
    `;

    window.__rptSelectTab = selectTab;
    renderReport(activeTab);
  }

  function selectTab(key) {
    activeTab = key;
    TABS.forEach(t => {
      const btn = cid('rtab-' + t.key);
      if (btn) btn.className = `btn btn-sm ${t.key === key ? 'btn-primary' : 'btn-outline'}`;
    });
    history.replaceState(null, '', '#/reports?r=' + key);
    allRows = []; filteredRows = [];
    renderReport(key);
  }

  function renderReport(key) {
    const content = cid('rpt-content');
    if (!content) return;
    if (key === 'settlement_report') { renderSettlement(content); return; }
    RENDERERS[key] ? RENDERERS[key](content) : renderGeneric(key, content);
  }

  // -- Shared helpers --
  function statCards(cards) {
    return `<div class="stat-grid" style="margin-bottom:16px">${cards.map(c => `
      <div class="stat-card">
        <div class="stat-label">${c.label}</div>
        <div class="stat-value" style="font-size:20px;color:${c.color || 'var(--text)'}">${c.val}</div>
        ${c.sub ? `<div class="stat-sub">${c.sub}</div>` : ''}
      </div>`).join('')}</div>`;
  }

  function filterBar(fields) {
    return `<div class="filter-bar" style="margin-bottom:16px">
      ${fields.map(f => {
        if (f.type === 'date') return `<div><div class="text-sm text-muted" style="margin-bottom:3px">${f.label}</div>
          <input type="date" id="${f.id}" style="height:32px" oninput="window.__rptFilter()"></div>`;
        if (f.type === 'select') return `<div><div class="text-sm text-muted" style="margin-bottom:3px">${f.label}</div>
          <select id="${f.id}" style="height:32px" onchange="window.__rptFilter()">
            <option value="">All</option>
            ${(f.options || []).map(o => `<option>${o}</option>`).join('')}
          </select></div>`;
        return `<div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">${f.label}</div>
          <input id="${f.id}" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>`;
      }).join('')}
      <div style="align-self:flex-end">
        <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button>
      </div>
    </div>`;
  }

  function vtableCard(title, vtId, extraButtons) {
    return `<div class="card"><div class="card-header">
      <span>${title}</span>
      <div style="display:flex;gap:6px">
        ${extraButtons || ''}
      </div>
    </div>
    <div style="padding:12px" id="${vtId}"></div></div>`;
  }

  function loading() {
    return `<div class="skeleton" style="height:200px;border-radius:8px"></div>`;
  }

  // -------------------------------------------
  //  REPORT 1: SHIPPED TO FBA
  // -------------------------------------------
  function renderShipped(content) {
    content.innerHTML = loading();
    fetch(`${API}/report-summary/shipped_to_fba`)
      .then(r => r.json())
      .then(sum => {
        return fetch(`${API}/report/shipped_to_fba`).then(r => r.json()).then(rd => {
          allRows = rd.rows || [];
          filteredRows = [...allRows];
          const shipList = sum.shipment_list || [];

          content.innerHTML = `
            ${statCards([
              { label: 'Shipments',    val: fn(sum.shipments),   color: 'var(--accent)' },
              { label: 'Unique SKUs',  val: fn(sum.skus),        color: 'var(--green)' },
              { label: 'Total Shipped',val: fn(sum.total_units), color: 'var(--text)' },
              { label: 'First Date',   val: fd(sum.first_date),  color: 'var(--text2)' },
              { label: 'Last Date',    val: fd(sum.last_date),   color: 'var(--text2)' },
            ])}
            <div class="filter-bar" style="margin-bottom:16px">
              <div>
                <div class="text-sm text-muted" style="margin-bottom:3px">Shipment</div>
                <select id="sh-sid" style="height:32px" onchange="window.__rptFilter()">
                  <option value="">All</option>
                  ${shipList.map(s => `<option value="${s.shipment_id}">${s.shipment_id} (${s.qty} units)</option>`).join('')}
                </select>
              </div>
              <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
                <input type="date" id="sh-from" style="height:32px" onchange="window.__rptFilter()"></div>
              <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
                <input type="date" id="sh-to" style="height:32px" onchange="window.__rptFilter()"></div>
              <div style="flex:1;min-width:180px"><div class="text-sm text-muted" style="margin-bottom:3px">Search SKU / Title / Publisher</div>
                <input id="sh-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
              <div style="align-self:flex-end">
                <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button>
              </div>
            </div>
            ${vtableCard('Shipped to FBA', 'sh-vtable')}
          `;

          window.__rptFilter = debounce(() => {
            const sid  = (cid('sh-sid')?.value || '').trim();
            const from = cid('sh-from')?.value;
            const to   = cid('sh-to')?.value;
            const q    = (cid('sh-q')?.value || '').toLowerCase();
            filteredRows = allRows.filter(r => {
              if (sid  && (r.shipment_id || '') !== sid) return false;
              if (from && (r.ship_date || '').split('T')[0] < from) return false;
              if (to   && (r.ship_date || '').split('T')[0] > to)   return false;
              if (q    && ![(r.msku||''),(r.asin||''),(r.fnsku||''),(r.title||''),(r.publisher_name||''),(r.supplier_name||'')]
                .some(v => v.toLowerCase().includes(q))) return false;
              return true;
            });
            mountTable();
          }, 300);
          window.__rptClear = () => { ['sh-sid','sh-from','sh-to','sh-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

          function mountTable() {
            const el = cid('sh-vtable');
            if (!el) return;
            el.innerHTML = '';
            window.VTable.create(el, {
              columns: [
                { key: 'shipment_id', label: 'Shipment', width: 130 },
                { key: 'ship_date',   label: 'Ship Date', width: 100, render: v => fd(v) },
                { key: 'msku',        label: 'MSKU',      width: 140 },
                { key: 'asin',        label: 'ASIN',      width: 110 },
                { key: 'fnsku',       label: 'FNSKU',     width: 110 },
                { key: 'quantity',    label: 'Qty',        width: 70,  render: v => fn(v) },
                { key: 'title',       label: 'Title',      width: 160 },
                { key: 'publisher_name',  label: 'Publisher', width: 110 },
                { key: 'supplier_name',   label: 'Supplier',  width: 110 },
                { key: 'delivery_location',label: 'Del Loc',  width: 90 },
                { key: 'final_net_price_usd',    label: 'Net $',   width: 80, render: v => fm(v) },
                { key: 'commission_usd',         label: 'Comm $',  width: 80, render: v => fm(v) },
                { key: 'supplier_shipping_usd',  label: 'Supp $',  width: 80, render: v => fm(v) },
                { key: 'warehouse_prep_usd',     label: 'Prep $',  width: 80, render: v => fm(v) },
              ],
              data: filteredRows,
              rowHeight: 36,
              exportable: true,
              columnToggle: true,
            });
          }
          mountTable();
        });
      })
      .catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 2: SALES DATA
  // -------------------------------------------
  function renderSales(content) {
    content.innerHTML = loading();
    Promise.all([
      fetch(`${API}/report/sales_data`).then(r => r.json()),
      fetch(`${API}/report-summary/sales_data`).then(r => r.json()),
    ]).then(([rd, sum]) => {
      allRows = rd.rows || [];
      filteredRows = [...allRows];
      const fcs = [...new Set(allRows.map(r => (r.fc || '').trim()).filter(Boolean))].sort();

      content.innerHTML = `
        ${statCards([
          { label: 'Total Orders', val: fn(sum.orders || new Set(allRows.map(r=>r.order_id)).size), color: 'var(--green)' },
          { label: 'Units Sold',   val: fn(sum.units  || allRows.reduce((s,r)=>s+(parseInt(r.quantity)||0),0)), color: 'var(--green)' },
          { label: 'Unique SKUs',  val: fn(new Set(allRows.map(r=>r.msku)).size), color: 'var(--accent)' },
          { label: 'Unique ASINs', val: fn(new Set(allRows.map(r=>r.asin)).size), color: 'var(--accent)' },
          { label: 'Date Range',   val: fd(sum.first_date), sub: '? ' + fd(sum.last_date), color: 'var(--text2)' },
        ])}
        <div class="filter-bar" style="margin-bottom:16px">
          <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="sl-from" style="height:32px" onchange="window.__rptFilter()"></div>
          <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="sl-to" style="height:32px" onchange="window.__rptFilter()"></div>
          <div><div class="text-sm text-muted" style="margin-bottom:3px">FC</div>
            <select id="sl-fc" style="height:32px" onchange="window.__rptFilter()">
              <option value="">All FCs</option>
              ${fcs.map(f => `<option>${f}</option>`).join('')}
            </select></div>
          <div style="flex:1;min-width:180px"><div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / Order</div>
            <input id="sl-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
        </div>
        ${vtableCard('Sales Data', 'sl-vtable')}
      `;

      window.__rptFilter = debounce(() => {
        const from = cid('sl-from')?.value;
        const to   = cid('sl-to')?.value;
        const fc   = (cid('sl-fc')?.value || '').trim();
        const q    = (cid('sl-q')?.value || '').toLowerCase();
        filteredRows = allRows.filter(r => {
          const rd = (r.sale_date || '').split('T')[0];
          if (from && rd < from) return false;
          if (to   && rd > to)   return false;
          if (fc   && (r.fc || '').trim() !== fc) return false;
          if (q    && ![(r.msku||''),(r.asin||''),(r.fnsku||''),(r.order_id||'')].some(v => v.toLowerCase().includes(q))) return false;
          return true;
        });
        mountTable();
      }, 300);
      window.__rptClear = () => { ['sl-from','sl-to','sl-fc','sl-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

      function mountTable() {
        const el = cid('sl-vtable');
        if (!el) return;
        el.innerHTML = '';
        window.VTable.create(el, {
          columns: [
            { key: 'sale_date',  label: 'Sale Date', width: 100, render: v => fd(v) },
            { key: 'order_id',   label: 'Order ID',  width: 140 },
            { key: 'msku',       label: 'MSKU',      width: 140 },
            { key: 'asin',       label: 'ASIN',      width: 110 },
            { key: 'fnsku',      label: 'FNSKU',     width: 110 },
            { key: 'quantity',   label: 'Qty',       width: 60,  render: v => fn(v) },
            { key: 'product_amount', label: 'Amount', width: 90, render: v => fm(v) },
            { key: 'fc',         label: 'FC',        width: 80 },
            { key: 'ship_city',  label: 'Ship City', width: 110 },
            { key: 'ship_state', label: 'State',     width: 70 },
          ],
          data: filteredRows,
          rowHeight: 36,
          exportable: true,
          columnToggle: true,
        });
      }
      mountTable();
    }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 3: FBA RECEIPTS
  // -------------------------------------------
  function renderReceipts(content) {
    content.innerHTML = loading();
    Promise.all([
      fetch(`${API}/report/fba_receipts?limit=5000`).then(r => r.json()),
      fetch(`${API}/report-summary/fba_receipts`).then(r => r.json()),
    ]).then(([rd, sum]) => {
      allRows = rd.rows || [];
      filteredRows = [...allRows];
      const shipList = sum.shipment_list || [];

      content.innerHTML = `
        ${statCards([
          { label: 'Shipments',   val: fn(sum.shipments), color: 'var(--accent)' },
          { label: 'Unique SKUs', val: fn(sum.skus),      color: 'var(--green)' },
          { label: 'Total Rcvd',  val: fn(sum.total_received), color: 'var(--text)' },
          { label: 'Date Range',  val: fd(sum.first_date), sub: '? ' + fd(sum.last_date), color: 'var(--text2)' },
        ])}
        <div class="filter-bar" style="margin-bottom:16px">
          <div><div class="text-sm text-muted" style="margin-bottom:3px">Shipment</div>
            <select id="rc-sid" style="height:32px" onchange="window.__rptFilter()">
              <option value="">All</option>
              ${shipList.map(s => `<option value="${s.shipment_id}">${s.shipment_id}</option>`).join('')}
            </select></div>
          <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
            <input type="date" id="rc-from" style="height:32px" onchange="window.__rptFilter()"></div>
          <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
            <input type="date" id="rc-to" style="height:32px" onchange="window.__rptFilter()"></div>
          <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search FNSKU / MSKU</div>
            <input id="rc-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
          <div style="align-self:flex-end">
            <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
        </div>
        ${vtableCard('FBA Receipts', 'rc-vtable')}
      `;

      window.__rptFilter = debounce(() => {
        const sid  = (cid('rc-sid')?.value || '').trim();
        const from = cid('rc-from')?.value;
        const to   = cid('rc-to')?.value;
        const q    = (cid('rc-q')?.value || '').toLowerCase();
        filteredRows = allRows.filter(r => {
          if (sid  && (r.shipment_id || '') !== sid) return false;
          if (from && (r.receipt_date || '').split('T')[0] < from) return false;
          if (to   && (r.receipt_date || '').split('T')[0] > to)   return false;
          if (q    && ![(r.fnsku||''),(r.msku||''),(r.asin||'')].some(v => v.toLowerCase().includes(q))) return false;
          return true;
        });
        mountTable();
      }, 300);
      window.__rptClear = () => { ['rc-sid','rc-from','rc-to','rc-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

      function mountTable() {
        const el = cid('rc-vtable');
        if (!el) return;
        el.innerHTML = '';
        window.VTable.create(el, {
          columns: [
            { key: 'receipt_date', label: 'Receipt Date', width: 110, render: v => fd(v) },
            { key: 'shipment_id',  label: 'Shipment',     width: 130 },
            { key: 'fnsku',        label: 'FNSKU',        width: 120 },
            { key: 'msku',         label: 'MSKU',         width: 140 },
            { key: 'asin',         label: 'ASIN',         width: 110 },
            { key: 'quantity',     label: 'Qty',          width: 60, render: v => fn(v) },
            { key: 'fc_id',        label: 'FC',           width: 80 },
          ],
          data: filteredRows,
          rowHeight: 36,
          exportable: true,
          columnToggle: true,
        });
      }
      mountTable();
    }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 4: CUSTOMER RETURNS
  // -------------------------------------------
  function renderReturns(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/customer_returns?limit=5000`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];
        const reasons = [...new Set(allRows.map(r => (r.reason || '').trim()).filter(Boolean))].sort();

        content.innerHTML = `
          ${statCards([
            { label: 'Total Returns',  val: fn(allRows.reduce((s,r)=>s+(parseInt(r.quantity)||0),0)), color: 'var(--red)' },
            { label: 'Unique FNSKUs',  val: fn(new Set(allRows.map(r=>r.fnsku)).size), color: 'var(--accent)' },
            { label: 'Unique SKUs',    val: fn(new Set(allRows.map(r=>r.msku)).size),  color: 'var(--text)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
              <input type="date" id="ret-from" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
              <input type="date" id="ret-to" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Disposition</div>
              <select id="ret-disp" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                <option>SELLABLE</option><option>DEFECTIVE</option><option>CUSTOMER_DAMAGED</option>
                <option>UNSELLABLE</option><option>DAMAGED</option><option>EXPIRED</option>
              </select></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Reason</div>
              <select id="ret-reason" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                ${reasons.map(v => `<option>${v}</option>`).join('')}
              </select></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search FNSKU / ASIN / MSKU</div>
              <input id="ret-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('Customer Returns', 'ret-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const from  = cid('ret-from')?.value;
          const to    = cid('ret-to')?.value;
          const disp  = (cid('ret-disp')?.value || '').toLowerCase();
          const rsn   = (cid('ret-reason')?.value || '').toLowerCase();
          const q     = (cid('ret-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            const rd = (r.return_date || '').split('T')[0];
            if (from && rd < from) return false;
            if (to   && rd > to)   return false;
            if (disp && (r.disposition || '').toLowerCase() !== disp) return false;
            if (rsn  && (r.reason || '').toLowerCase() !== rsn)       return false;
            if (q    && ![(r.fnsku||''),(r.asin||''),(r.msku||'')].some(v => v.toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['ret-from','ret-to','ret-disp','ret-reason','ret-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('ret-vtable');
          if (!el) return;
          el.innerHTML = '';
          window.VTable.create(el, {
            columns: [
              { key: 'return_date',   label: 'Return Date',  width: 100, render: v => fd(v) },
              { key: 'order_id',      label: 'Order ID',     width: 140 },
              { key: 'fnsku',         label: 'FNSKU',        width: 120 },
              { key: 'msku',          label: 'MSKU',         width: 140 },
              { key: 'asin',          label: 'ASIN',         width: 110 },
              { key: 'quantity',      label: 'Qty',          width: 60, render: v => fn(v) },
              { key: 'disposition',   label: 'Disposition',  width: 130, render: v => `<span class="${disCls(v)}">${v || '—'}</span>` },
              { key: 'reason',        label: 'Reason',       width: 160 },
              { key: 'fc_id',         label: 'FC',           width: 80 },
            ],
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 5: REIMBURSEMENTS
  // -------------------------------------------
  function renderReimb(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/reimbursements?limit=10000`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];
        const reasons = [...new Set(allRows.map(r => (r.reason || '').trim()).filter(Boolean))].sort();

        const totalAmt = allRows.reduce((s,r) => s + (parseFloat(r.amount_total) || 0), 0);
        const totalQty = allRows.reduce((s,r) => s + (parseInt(r.quantity_reimbursed_total) || 0), 0);

        content.innerHTML = `
          ${statCards([
            { label: 'Unique SKUs',       val: fn(new Set(allRows.map(r=>r.msku)).size), color: 'var(--accent)' },
            { label: 'Reimbursed Qty',    val: fn(totalQty),   color: 'var(--green)' },
            { label: 'Reimbursed Amount', val: fm(totalAmt),   color: 'var(--green)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Reason</div>
              <select id="rb-reason" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                ${reasons.map(v => `<option>${v}</option>`).join('')}
              </select></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
              <input type="date" id="rb-from" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
              <input type="date" id="rb-to" style="height:32px" onchange="window.__rptFilter()"></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search FNSKU / MSKU / Reimb ID</div>
              <input id="rb-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('Reimbursements', 'rb-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const rsn  = (cid('rb-reason')?.value || '').toLowerCase();
          const from = cid('rb-from')?.value;
          const to   = cid('rb-to')?.value;
          const q    = (cid('rb-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            const ud = (r.approval_date || '').split('T')[0];
            if (rsn  && (r.reason || '').toLowerCase() !== rsn) return false;
            if (from && ud < from) return false;
            if (to   && ud > to)   return false;
            if (q    && ![(r.fnsku||''),(r.msku||''),(r.asin||''),(r.reimbursement_id||'')].some(v => v.toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['rb-reason','rb-from','rb-to','rb-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('rb-vtable');
          if (!el) return;
          el.innerHTML = '';
          window.VTable.create(el, {
            columns: [
              { key: 'approval_date',   label: 'Date',      width: 100, render: v => fd(v) },
              { key: 'reimbursement_id',label: 'Reimb ID',  width: 130 },
              { key: 'case_id',         label: 'Case ID',   width: 110 },
              { key: 'fnsku',           label: 'FNSKU',     width: 120 },
              { key: 'msku',            label: 'MSKU',      width: 140 },
              { key: 'asin',            label: 'ASIN',      width: 110 },
              { key: 'reason',          label: 'Reason',    width: 160 },
              { key: 'quantity_reimbursed_total', label: 'Qty',   width: 60, render: v => fn(v) },
              { key: 'amount_total',    label: 'Amount',    width: 90, render: v => fm(v) },
            ],
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 6: FC TRANSFERS
  // -------------------------------------------
  function renderFCTransfers(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/fc_transfers?limit=10000`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];

        content.innerHTML = `
          ${statCards([
            { label: 'Total Transfers', val: fn(allRows.length),  color: 'var(--accent)' },
            { label: 'Unique SKUs',     val: fn(new Set(allRows.map(r=>r.msku)).size), color: 'var(--green)' },
            { label: 'Total Qty',       val: fn(allRows.reduce((s,r)=>s+(parseInt(r.transferred_quantity)||0),0)), color: 'var(--text)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
              <input type="date" id="fct-from" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
              <input type="date" id="fct-to" style="height:32px" onchange="window.__rptFilter()"></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / ASIN / FNSKU</div>
              <input id="fct-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('FC Transfers', 'fct-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const from = cid('fct-from')?.value;
          const to   = cid('fct-to')?.value;
          const q    = (cid('fct-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            const td = (r.transfer_date || r.shipment_date || '').split('T')[0];
            if (from && td < from) return false;
            if (to   && td > to)   return false;
            if (q    && ![(r.msku||''),(r.asin||''),(r.fnsku||'')].some(v => v.toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['fct-from','fct-to','fct-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('fct-vtable');
          if (!el) return;
          el.innerHTML = '';
          window.VTable.create(el, {
            columns: [
              { key: 'transfer_date', label: 'Date',        width: 100, render: v => fd(v) },
              { key: 'msku',          label: 'MSKU',        width: 140 },
              { key: 'fnsku',         label: 'FNSKU',       width: 120 },
              { key: 'asin',          label: 'ASIN',        width: 110 },
              { key: 'transferred_quantity', label: 'Qty',  width: 70, render: v => fn(v) },
              { key: 'source_fc',     label: 'From FC',     width: 90 },
              { key: 'destination_fc',label: 'To FC',       width: 90 },
              { key: 'shipment_id',   label: 'Shipment',    width: 130 },
            ],
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 7: FBA REMOVALS
  // -------------------------------------------
  function renderRemovals(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/fba_removals`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];

        const totalFee = allRows.reduce((s,r) => s + (parseFloat(r.removal_fee) || 0), 0);
        content.innerHTML = `
          ${statCards([
            { label: 'Total Orders', val: fn(new Set(allRows.map(r=>r.order_id)).size), color: 'var(--red)' },
            { label: 'Unique SKUs',  val: fn(new Set(allRows.map(r=>r.msku)).size),     color: 'var(--accent)' },
            { label: 'Units Removed',val: fn(allRows.reduce((s,r)=>s+(parseInt(r.quantity)||0),0)), color: 'var(--orange)' },
            { label: 'Removal Fee',  val: fm(totalFee), color: 'var(--text2)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Status</div>
              <select id="rm-status" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                <option>Completed</option><option>Cancelled</option><option>Pending</option><option>Processing</option>
              </select></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Order Type</div>
              <select id="rm-type" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option><option>Return</option><option>Disposal</option>
              </select></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
              <input type="date" id="rm-from" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
              <input type="date" id="rm-to" style="height:32px" onchange="window.__rptFilter()"></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search MSKU / Order ID</div>
              <input id="rm-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('FBA Removals', 'rm-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const st   = (cid('rm-status')?.value || '').toLowerCase();
          const tp   = (cid('rm-type')?.value || '').toLowerCase();
          const from = cid('rm-from')?.value;
          const to   = cid('rm-to')?.value;
          const q    = (cid('rm-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            const rd = (r.request_date || '').split('T')[0];
            if (st   && (r.order_status || '').toLowerCase() !== st) return false;
            if (tp   && (r.removal_order_type || '').toLowerCase() !== tp) return false;
            if (from && rd < from) return false;
            if (to   && rd > to)   return false;
            if (q    && ![(r.msku||''),(r.order_id||'')].some(v => v.toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['rm-status','rm-type','rm-from','rm-to','rm-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('rm-vtable');
          if (!el) return;
          el.innerHTML = '';
          window.VTable.create(el, {
            columns: [
              { key: 'request_date', label: 'Date',        width: 100, render: v => fd(v) },
              { key: 'order_id',     label: 'Order ID',    width: 130 },
              { key: 'msku',         label: 'MSKU',        width: 140 },
              { key: 'fnsku',        label: 'FNSKU',       width: 120 },
              { key: 'asin',         label: 'ASIN',        width: 110 },
              { key: 'quantity',     label: 'Qty',         width: 60, render: v => fn(v) },
              { key: 'removal_order_type', label: 'Type',  width: 90 },
              { key: 'order_status', label: 'Status',      width: 100 },
              { key: 'removal_fee',  label: 'Fee',         width: 80, render: v => fm(v) },
            ],
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 8: SHIPMENT STATUS
  // -------------------------------------------
  function renderShipmentStatus(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/shipment_status`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];

        content.innerHTML = `
          ${statCards([
            { label: 'Total Shipments', val: fn(new Set(allRows.map(r=>r.shipment_id)).size), color: 'var(--accent)' },
            { label: 'Total SKUs',      val: fn(new Set(allRows.map(r=>r.msku)).size),        color: 'var(--green)' },
            { label: 'Total Qty',       val: fn(allRows.reduce((s,r)=>s+(parseInt(r.quantity)||0),0)), color: 'var(--text)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Status</div>
              <select id="ss-status" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                <option>CHECKED_IN</option><option>RECEIVING</option><option>CLOSED</option><option>WORKING</option>
              </select></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search Shipment / MSKU</div>
              <input id="ss-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('Shipment Status', 'ss-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const st = (cid('ss-status')?.value || '').toUpperCase();
          const q  = (cid('ss-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            if (st && (r.shipment_status || '').toUpperCase() !== st) return false;
            if (q  && ![(r.shipment_id||''),(r.msku||'')].some(v => v.toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['ss-status','ss-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('ss-vtable');
          if (!el) return;
          el.innerHTML = '';
          window.VTable.create(el, {
            columns: [
              { key: 'shipment_id',     label: 'Shipment',  width: 130 },
              { key: 'msku',            label: 'MSKU',      width: 140 },
              { key: 'fnsku',           label: 'FNSKU',     width: 120 },
              { key: 'asin',            label: 'ASIN',      width: 110 },
              { key: 'quantity',        label: 'Qty',       width: 60, render: v => fn(v) },
              { key: 'received_qty',    label: 'Received',  width: 80, render: v => fn(v) },
              { key: 'shipment_status', label: 'Status',    width: 120 },
              { key: 'fc_id',           label: 'FC',        width: 80 },
            ],
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 9: FBA SUMMARY
  // -------------------------------------------
  function renderFBASummary(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/fba_summary?limit=10000`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];
        const dispositions = [...new Set(allRows.map(r => (r.disposition || '').trim()).filter(Boolean))].sort();

        // Compute in-stock from latest SELLABLE ending_balance per FNSKU
        function computeInStock(rows) {
          const m = {};
          rows.filter(r => (r.disposition||'').toUpperCase() === 'SELLABLE').forEach(r => {
            const k = r.fnsku || r.msku || '';
            const d = r.summary_date ? new Date(r.summary_date) : null;
            if (!d) return;
            if (!m[k] || d > m[k].d) m[k] = { d, qty: parseInt(r.ending_balance) || 0 };
          });
          return Object.values(m).reduce((s, x) => s + x.qty, 0);
        }

        content.innerHTML = `
          ${statCards([
            { label: 'Unique FNSKUs', val: fn(new Set(allRows.map(r=>r.fnsku||r.msku)).size), color: 'var(--accent)' },
            { label: 'Total Receipts',val: fn(allRows.reduce((s,r)=>s+(parseInt(r.receipts)||0),0)), color: 'var(--green)' },
            { label: 'In Stock (Sellable)', val: fn(computeInStock(allRows)), color: 'var(--green)' },
            { label: 'Total Shipped', val: fn(allRows.reduce((s,r)=>s+(parseInt(r.customer_shipments)||0),0)), color: 'var(--red)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Disposition</div>
              <select id="fbs-disp" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                ${dispositions.map(d => `<option>${d}</option>`).join('')}
              </select></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
              <input type="date" id="fbs-from" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
              <input type="date" id="fbs-to" style="height:32px" onchange="window.__rptFilter()"></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search FNSKU / MSKU / ASIN</div>
              <input id="fbs-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('FBA Summary', 'fbs-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const disp = (cid('fbs-disp')?.value || '').toUpperCase();
          const from = cid('fbs-from')?.value;
          const to   = cid('fbs-to')?.value;
          const q    = (cid('fbs-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            if (disp && (r.disposition || '').toUpperCase() !== disp) return false;
            const sd = (r.summary_date || '').split('T')[0];
            if (from && sd < from) return false;
            if (to   && sd > to)   return false;
            if (q    && ![(r.fnsku||''),(r.msku||''),(r.asin||'')].some(v => v.toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['fbs-disp','fbs-from','fbs-to','fbs-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('fbs-vtable');
          if (!el) return;
          el.innerHTML = '';
          window.VTable.create(el, {
            columns: [
              { key: 'summary_date',      label: 'Date',       width: 100, render: v => fd(v) },
              { key: 'fnsku',             label: 'FNSKU',      width: 120 },
              { key: 'msku',              label: 'MSKU',       width: 140 },
              { key: 'asin',              label: 'ASIN',       width: 110 },
              { key: 'disposition',       label: 'Disposition',width: 130, render: v => `<span class="${disCls(v)}">${v||'—'}</span>` },
              { key: 'starting_balance',  label: 'Start Bal',  width: 80, render: v => fn(v) },
              { key: 'receipts',          label: 'Receipts',   width: 80, render: v => fn(v) },
              { key: 'customer_shipments',label: 'Shipped',    width: 80, render: v => fn(v) },
              { key: 'customer_returns',  label: 'Returns',    width: 80, render: v => fn(v) },
              { key: 'ending_balance',    label: 'End Bal',    width: 80, render: v => fn(v) },
            ],
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 10: PAYMENT REPOSITORY
  // -------------------------------------------
  function renderPaymentRepo(content) {
    content.innerHTML = loading();
    fetch(`${API}/report/payment_repository?limit=10000`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];

        if (!allRows.length) {
          content.innerHTML = `
            <div style="text-align:center;padding:60px;color:var(--text3)">
              <i data-lucide="credit-card" style="width:40px;height:40px;display:block;margin:0 auto 16px;color:var(--border)"></i>
              <div style="font-size:16px;font-weight:600;margin-bottom:8px">No payment data yet</div>
              <a href="#/upload?t=payment-repository" class="btn btn-primary btn-sm">Upload Payment Repository</a>
            </div>`;
          if (window.lucide) window.lucide.createIcons();
          return;
        }

        const types = [...new Set(allRows.map(r => (r.transaction_type || '').trim()).filter(Boolean))].sort();
        content.innerHTML = `
          ${statCards([
            { label: 'Total Records', val: fn(allRows.length), color: 'var(--accent)' },
            { label: 'Unique Types',  val: fn(types.length),   color: 'var(--text)' },
            { label: 'Total Amount',  val: fm(allRows.reduce((s,r)=>s+(parseFloat(r.amount)||0),0)), color: 'var(--green)' },
          ])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div><div class="text-sm text-muted" style="margin-bottom:3px">Type</div>
              <select id="pr-type" style="height:32px" onchange="window.__rptFilter()">
                <option value="">All</option>
                ${types.map(t => `<option>${t}</option>`).join('')}
              </select></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">From</div>
              <input type="date" id="pr-from" style="height:32px" onchange="window.__rptFilter()"></div>
            <div><div class="text-sm text-muted" style="margin-bottom:3px">To</div>
              <input type="date" id="pr-to" style="height:32px" onchange="window.__rptFilter()"></div>
            <div style="flex:1;min-width:160px"><div class="text-sm text-muted" style="margin-bottom:3px">Search</div>
              <input id="pr-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard('Payment Repository', 'pr-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const tp   = (cid('pr-type')?.value || '');
          const from = cid('pr-from')?.value;
          const to   = cid('pr-to')?.value;
          const q    = (cid('pr-q')?.value || '').toLowerCase();
          filteredRows = allRows.filter(r => {
            const pd = (r.posted_date || r.transaction_date || '').split('T')[0];
            if (tp   && r.transaction_type !== tp) return false;
            if (from && pd < from) return false;
            if (to   && pd > to)   return false;
            if (q    && !Object.values(r).some(v => String(v || '').toLowerCase().includes(q))) return false;
            return true;
          });
          mountTable();
        }, 300);
        window.__rptClear = () => { ['pr-type','pr-from','pr-to','pr-q'].forEach(id => { const e = cid(id); if (e) e.value = ''; }); window.__rptFilter(); };

        function mountTable() {
          const el = cid('pr-vtable');
          if (!el) return;
          el.innerHTML = '';
          // Use all available columns dynamically
          const sampleKeys = Object.keys(allRows[0] || {}).slice(0, 12);
          window.VTable.create(el, {
            columns: sampleKeys.map(k => ({
              key: k,
              label: k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
              width: 120,
              render: k.toLowerCase().includes('amount') || k.toLowerCase().includes('total')
                ? v => fm(v)
                : k.toLowerCase().includes('date')
                ? v => fd(v)
                : undefined,
            })),
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -------------------------------------------
  //  REPORT 11: SETTLEMENT REPORT (iframe)
  // -------------------------------------------
  function renderSettlement(content) {
    content.innerHTML = `
      <iframe src="/settlement-report.html?embed=1"
              style="width:100%;height:calc(100vh - 160px);min-height:480px;border:none;display:block;background:var(--surface);border-radius:var(--radius);box-shadow:var(--shadow-sm)"
              title="Settlement Report"></iframe>
    `;
  }

  // -- Renderer map --
  const RENDERERS = {
    shipped_to_fba:    renderShipped,
    sales_data:        renderSales,
    fba_receipts:      renderReceipts,
    customer_returns:  renderReturns,
    reimbursements:    renderReimb,
    fc_transfers:      renderFCTransfers,
    fba_removals:      renderRemovals,
    shipment_status:   renderShipmentStatus,
    fba_summary:       renderFBASummary,
    payment_repository:renderPaymentRepo,
    settlement_report: renderSettlement,
  };

  // -- Generic fallback (uses /report/{table} endpoint) --
  function renderGeneric(table, content) {
    content.innerHTML = loading();
    fetch(`${API}/report/${table}?limit=5000`)
      .then(r => r.json())
      .then(rd => {
        allRows = rd.rows || [];
        filteredRows = [...allRows];
        const title = table.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase());
        content.innerHTML = `
          ${statCards([{ label: 'Total Records', val: fn(allRows.length), color: 'var(--accent)' }])}
          <div class="filter-bar" style="margin-bottom:16px">
            <div style="flex:1"><div class="text-sm text-muted" style="margin-bottom:3px">Search</div>
              <input id="gen-q" placeholder="Search…" style="height:32px;width:100%" oninput="window.__rptFilter()"></div>
            <div style="align-self:flex-end">
              <button class="btn btn-outline btn-sm" onclick="window.__rptClear()">? Clear</button></div>
          </div>
          ${vtableCard(title, 'gen-vtable')}
        `;

        window.__rptFilter = debounce(() => {
          const q = (cid('gen-q')?.value || '').toLowerCase();
          filteredRows = q ? allRows.filter(r => Object.values(r).some(v => String(v||'').toLowerCase().includes(q))) : [...allRows];
          mountTable();
        }, 300);
        window.__rptClear = () => { const e = cid('gen-q'); if (e) e.value = ''; window.__rptFilter(); };

        function mountTable() {
          const el = cid('gen-vtable');
          if (!el) return;
          el.innerHTML = '';
          const sampleKeys = Object.keys(allRows[0] || {}).slice(0, 10);
          window.VTable.create(el, {
            columns: sampleKeys.map(k => ({
              key: k,
              label: k.replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()),
              width: 120,
            })),
            data: filteredRows,
            rowHeight: 36,
            exportable: true,
            columnToggle: true,
          });
        }
        mountTable();
      }).catch(e => { content.innerHTML = errBox(e); });
  }

  // -- Helpers --
  function errBox(e) {
    return `<div style="padding:40px;text-align:center;color:var(--red)">
      <div style="font-size:16px;font-weight:600;margin-bottom:8px">Failed to load report</div>
      <div style="font-size:13px;color:var(--text3)">${e.message || String(e)}</div>
    </div>`;
  }

  function debounce(fn, delay) {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  function refresh() {
    const t = getTabFromHash();
    selectTab(t);
  }

  window.__viewExport = { render, refresh };
})();
