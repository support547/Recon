/* ====================================================
   Upload Reports View
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

  /** Maps upload tab key ? uploaded_files.report_type (server UPLOAD_HISTORY_DATA_TABLE keys) */
  const REPORT_TYPE_BY_TAB = {
    shipped:             'shipped_to_fba',
    sales:               'sales_data',
    receipts:            'fba_receipts',
    returns:             'customer_returns',
    reimbursements:      'reimbursements',
    fctransfer:          'fc_transfers',
    replacements:        'replacements',
    gnr:                 'gnr_report',
    removals:            'fba_removals',
    'removal-shipments': 'removal_shipments',
    'shipment-receiving':'shipment_status',
    fbasummary:          'fba_summary',
    'payment-repository':'payment_repository',
    'settlement-report': 'settlement_report',
  };

  const REPORT_TYPES = [
    { key: 'shipped',             label: 'Shipped to FBA' },
    { key: 'sales',               label: 'Sales Data' },
    { key: 'receipts',            label: 'FBA Receipts' },
    { key: 'returns',             label: 'Customer Returns' },
    { key: 'reimbursements',      label: 'Reimbursements' },
    { key: 'fctransfer',          label: 'FC Transfers' },
    { key: 'replacements',        label: 'Replacements' },
    { key: 'gnr',                 label: 'Grade & Resell' },
    { key: 'removals',            label: 'Removals' },
    { key: 'removal-shipments',   label: 'Removal Shipments' },
    { key: 'shipment-receiving',  label: 'Shipment Receiving' },
    { key: 'fbasummary',          label: 'FBA Summary' },
    { key: 'payment-repository',  label: 'Payment Repository' },
    { key: 'settlement-report',   label: 'Settlement Report' },
  ];

  const MAX_MB = 50;
  let activeType = 'shipped';

  async function safeFetch(url) {
    const res = await fetch(url);
    if (!res.ok) {
      const text = await res.text();
      throw new Error(
        text.trim().startsWith('<') ? `API route not found or server returned HTML: ${url}` : text.slice(0, 200)
      );
    }
    return res.json();
  }

  function reportTypeForActiveTab() {
    return REPORT_TYPE_BY_TAB[activeType] || activeType.replace(/-/g, '_');
  }
  let historyTable = null;
  let historyData = [];

  // -- Formatters --
  function fmtDateTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(String(v).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // -- Read hash ?t= param --
  function getTypeFromHash() {
    const hash = window.location.hash; // e.g. #/upload?t=shipped
    const qIdx = hash.indexOf('?');
    if (qIdx === -1) return 'shipped';
    const params = new URLSearchParams(hash.slice(qIdx + 1));
    return params.get('t') || 'shipped';
  }

  function getLabelForKey(key) {
    return REPORT_TYPES.find(r => r.key === key)?.label || key;
  }

  // -- Main Render --
  function render(container) {
    activeType = getTypeFromHash();

    container.innerHTML = `
      <div class="page-header" style="margin-bottom:16px">
        <div>
          <div class="page-title">Upload Reports</div>
          <div class="page-sub">Upload CSV / TSV / Excel files for each report type</div>
        </div>
      </div>

      <!-- Tab pills -->
      <div id="upload-tabs" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:20px">
        ${REPORT_TYPES.map(r => `
          <button class="btn btn-sm ${r.key === activeType ? 'btn-primary' : 'btn-outline'}"
                  data-key="${r.key}" id="tab-${r.key}"
                  onclick="window.__uploadSelectTab('${r.key}')">
            ${r.label}
          </button>
        `).join('')}
      </div>

      <!-- Main 2-col grid -->
      <div id="upload-grid" style="display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-bottom:20px">
        <div id="upload-left-card"></div>
        <div id="upload-right-card"></div>
      </div>

      <!-- History table -->
      <div class="card">
        <div class="card-header">
          <span>Upload History — <span id="upload-history-type">${getLabelForKey(activeType)}</span></span>
          <span style="font-size:12px;color:var(--text3)" id="upload-history-meta"></span>
        </div>
        <div style="padding:12px" id="upload-history-wrap"></div>
      </div>
    `;

    // expose tab switcher globally for inline onclick
    window.__uploadSelectTab = selectTab;

    renderUploadCard();
    renderSummaryCard();
    loadHistory();
  }

  // -- Tab switch --
  function selectTab(key) {
    activeType = key;
    // Update hash without triggering full router navigation
    history.replaceState(null, '', '#/upload?t=' + key);
    // Update pills
    REPORT_TYPES.forEach(r => {
      const btn = document.getElementById('tab-' + r.key);
      if (btn) {
        btn.className = `btn btn-sm ${r.key === key ? 'btn-primary' : 'btn-outline'}`;
      }
    });
    const lbl = document.getElementById('upload-history-type');
    if (lbl) lbl.textContent = getLabelForKey(key);

    renderUploadCard();
    renderSummaryCard();
    loadHistory();
  }

  // -- Upload Card (left) --
  function renderUploadCard() {
    const card = document.getElementById('upload-left-card');
    if (!card) return;
    const label = getLabelForKey(activeType);

    card.innerHTML = `
      <div class="card" style="height:100%">
        <div class="card-header">
          <span>${label}</span>
          <a href="/upload-templates/${activeType}.csv" download
             style="font-size:12px;display:flex;align-items:center;gap:4px;color:var(--accent)">
            <i data-lucide="download" style="width:13px;height:13px"></i> Template
          </a>
        </div>
        <div class="card-body">
          <!-- Drop zone -->
          <div class="upload-zone" id="upload-dropzone">
            <div class="upload-zone-icon">
              <i data-lucide="upload-cloud" style="width:36px;height:36px"></i>
            </div>
            <div class="upload-zone-title">Drop file here or click to browse</div>
            <div class="upload-zone-sub">CSV, TSV, TXT, XLSX, XLS — max ${MAX_MB}MB</div>
          </div>
          <input type="file" id="upload-file-input" style="display:none"
                 accept=".csv,.tsv,.txt,.xlsx,.xls">

          <!-- Progress -->
          <div id="upload-progress-wrap" style="display:none;margin-top:14px">
            <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--text2);margin-bottom:4px">
              <span>Uploading…</span><span id="upload-pct">0%</span>
            </div>
            <div style="height:6px;background:var(--surface2);border-radius:99px;overflow:hidden">
              <div id="upload-progress-bar" style="height:100%;width:0%;background:var(--accent);border-radius:99px;transition:width .15s"></div>
            </div>
          </div>

          <!-- Inline result -->
          <div id="upload-result" style="display:none;margin-top:12px;padding:10px 14px;border-radius:8px;font-size:13px"></div>

          ${activeType === 'shipped' ? renderCostSection() : ''}
        </div>
      </div>
    `;

    // Bind drop zone
    const zone = document.getElementById('upload-dropzone');
    const input = document.getElementById('upload-file-input');

    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('dragover');
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    });
    input.addEventListener('change', () => {
      if (input.files[0]) handleFile(input.files[0]);
    });

    // Cost worksheet bindings (shipped only)
    if (activeType === 'shipped') {
      loadShipmentList();
      const costZone = document.getElementById('cost-dropzone');
      const costInput = document.getElementById('cost-file-input');
      if (costZone && costInput) {
        costZone.addEventListener('click', () => costInput.click());
        costZone.addEventListener('dragover', e => { e.preventDefault(); costZone.classList.add('dragover'); });
        costZone.addEventListener('dragleave', () => costZone.classList.remove('dragover'));
        costZone.addEventListener('drop', e => {
          e.preventDefault();
          costZone.classList.remove('dragover');
          const file = e.dataTransfer.files[0];
          if (file) handleCostFile(file);
        });
        costInput.addEventListener('change', () => {
          if (costInput.files[0]) handleCostFile(costInput.files[0]);
        });
      }
    }

    if (window.lucide) window.lucide.createIcons();
  }

  function renderCostSection() {
    return `
      <div style="margin-top:20px;padding-top:16px;border-top:1px solid var(--border)">
        <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">Cost Worksheet (Shipped)</div>
        <div style="display:flex;gap:8px;margin-bottom:10px;align-items:flex-end">
          <div style="flex:1">
            <div style="font-size:11px;color:var(--text3);margin-bottom:4px">Shipment ID</div>
            <select id="cost-shipment-select" class="w-full" style="width:100%">
              <option value="">Loading…</option>
            </select>
          </div>
          <button class="btn btn-outline btn-sm" onclick="window.__downloadCostSheet()" title="Download cost sheet CSV">
            <i data-lucide="download" style="width:13px;height:13px"></i> Get Sheet
          </button>
        </div>
        <div class="upload-zone" id="cost-dropzone" style="padding:20px">
          <div class="upload-zone-icon"><i data-lucide="file-spreadsheet" style="width:28px;height:28px"></i></div>
          <div class="upload-zone-title" style="font-size:13px">Drop Cost CSV here or click</div>
        </div>
        <input type="file" id="cost-file-input" style="display:none" accept=".csv,.xlsx,.xls">
        <div id="cost-result" style="display:none;margin-top:10px;padding:8px 12px;border-radius:8px;font-size:12.5px"></div>
      </div>
    `;
  }

  async function loadShipmentList() {
    const sel = document.getElementById('cost-shipment-select');
    if (!sel) return;
    try {
      const rows = await safeFetch(`${API}/shipped-to-fba/shipment-ids`);
      const list = rows.rows || [];
      sel.innerHTML = '<option value="">Select Shipment…</option>' +
        list.map(r => `<option value="${r.shipment_id}">${r.shipment_id}</option>`).join('');
    } catch {
      sel.innerHTML = '<option value="">Failed to load</option>';
    }
    window.__downloadCostSheet = async () => {
      const sid = sel.value;
      if (!sid) { window.Toast?.show('Select a shipment first', 'warning'); return; }
      window.open(`${API}/shipped-to-fba/cost-export?shipment_id=${encodeURIComponent(sid)}`, '_blank');
    };
  }

  // -- File upload handler --
  async function handleFile(file) {
    const sizeMb = file.size / 1024 / 1024;
    if (sizeMb > MAX_MB) {
      showResult('error', `File too large: ${sizeMb.toFixed(1)}MB (max ${MAX_MB}MB)`);
      window.Toast?.show(`File too large (${sizeMb.toFixed(1)}MB)`, 'error');
      return;
    }

    showProgress(0);
    showResult('hide');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API}/upload/${activeType}`);

      xhr.upload.addEventListener('progress', e => {
        if (e.lengthComputable) {
          const pct = Math.round(e.loaded / e.total * 100);
          showProgress(pct);
        }
      });

      const result = await new Promise((resolve, reject) => {
        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            if (xhr.status >= 200 && xhr.status < 300) resolve(data);
            else reject(new Error(data.error || data.message || `HTTP ${xhr.status}`));
          } catch {
            reject(new Error(xhr.responseText || 'Upload failed'));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });

      hideProgress();
      const rows = result.rows || result.inserted || result.rowCount || 0;
      const msg = `? ${rows.toLocaleString()} rows uploaded successfully`;
      showResult('success', msg);
      window.Toast?.show(msg, 'success');

      // Refresh summary and history
      renderSummaryCard();
      loadHistory();

    } catch (err) {
      hideProgress();
      showResult('error', err.message);
      window.Toast?.show(err.message, 'error');
    }
  }

  async function handleCostFile(file) {
    const costResult = document.getElementById('cost-result');
    const formData = new FormData();
    formData.append('file', file);
    if (costResult) { costResult.style.display = 'block'; costResult.style.background = 'var(--surface2)'; costResult.textContent = 'Uploading…'; }
    try {
      const data = await fetch(`${API}/upload/shipped-cost`, { method: 'POST', body: formData }).then(r => r.json());
      if (costResult) { costResult.style.background = 'var(--green-l)'; costResult.style.color = 'var(--green)'; costResult.textContent = `? Cost sheet uploaded (${(data.updated || 0)} rows updated)`; }
      window.Toast?.show('Cost sheet uploaded', 'success');
    } catch (e) {
      if (costResult) { costResult.style.background = 'var(--red-l)'; costResult.style.color = 'var(--red)'; costResult.textContent = `Error: ${e.message}`; }
      window.Toast?.show(e.message, 'error');
    }
  }

  function showProgress(pct) {
    const wrap = document.getElementById('upload-progress-wrap');
    const bar  = document.getElementById('upload-progress-bar');
    const txt  = document.getElementById('upload-pct');
    if (wrap) wrap.style.display = 'block';
    if (bar)  bar.style.width = pct + '%';
    if (txt)  txt.textContent = pct + '%';
  }
  function hideProgress() {
    const wrap = document.getElementById('upload-progress-wrap');
    if (wrap) wrap.style.display = 'none';
  }
  function showResult(type, msg) {
    const el = document.getElementById('upload-result');
    if (!el) return;
    if (type === 'hide') { el.style.display = 'none'; return; }
    el.style.display = 'block';
    el.style.background = type === 'success' ? 'var(--green-l)' : 'var(--red-l)';
    el.style.color      = type === 'success' ? 'var(--green)'  : 'var(--red)';
    el.textContent = msg;
  }

  // -- Summary Card (right) --
  async function renderSummaryCard() {
    const card = document.getElementById('upload-right-card');
    if (!card) return;

    card.innerHTML = `
      <div class="card" style="height:100%">
        <div class="card-header">Upload Summary</div>
        <div class="card-body" id="upload-summary-body">
          <div class="skeleton" style="height:160px;border-radius:8px"></div>
        </div>
      </div>
    `;

    try {
      const summ = await safeFetch(`${API}/upload-summary`);
      const rt = reportTypeForActiveTab();
      const d = (summ.rows || []).find(r => r.report_type === rt) || {};
      const hasData = (d.upload_count || 0) > 0;
      const body = document.getElementById('upload-summary-body');
      if (!body) return;

      const statRow = (label, val) => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <span style="font-size:12.5px;color:var(--text2)">${label}</span>
          <span style="font-size:13px;font-weight:600;color:var(--text);font-variant-numeric:tabular-nums">${val}</span>
        </div>
      `;

      body.innerHTML = `
        <div style="margin-bottom:14px">
          <span class="badge ${hasData ? 'badge-green' : 'badge-orange'}" style="font-size:12px;padding:4px 10px">
            ${hasData ? '? Data loaded' : '? No uploads yet'}
          </span>
        </div>
        ${statRow('Total Uploads',    (d.upload_count || 0).toLocaleString())}
        ${statRow('Total Rows',       (parseInt(d.total_rows, 10) || 0).toLocaleString())}
        ${statRow('Last Upload Rows', (parseInt(d.last_row_count, 10) || 0).toLocaleString())}
        ${statRow('Last Uploaded',    fmtDateTime(d.last_upload))}
        ${statRow('Latest in File',   fmtDate(d.last_report_latest_date))}
      `;
    } catch (e) {
      const body = document.getElementById('upload-summary-body');
      if (body) body.innerHTML = `<div style="color:var(--red);font-size:13px">${e.message}</div>`;
    }
  }

  // -- History Table --
  async function loadHistory() {
    const wrap = document.getElementById('upload-history-wrap');
    const meta = document.getElementById('upload-history-meta');
    if (!wrap) return;

    wrap.innerHTML = `<div class="skeleton" style="height:120px;border-radius:8px"></div>`;

    try {
      const rt = encodeURIComponent(reportTypeForActiveTab());
      const resp = await safeFetch(`${API}/upload-history?type=${rt}&limit=500`);
      const rows = (resp.rows || []).map((r, i) => ({ ...r, _n: i + 1 }));
      historyData = rows;

      if (meta) meta.textContent = `${rows.length} records`;

      wrap.innerHTML = '';
      historyTable = window.VTable.create(wrap, {
        columns: [
          { key: '_n',          label: '#',             width: 44,  sortable: false },
          { key: 'report_type', label: 'Report',        width: 150, render: v => (v||'').replace(/_/g,' ').replace(/\b\w/g, c=>c.toUpperCase()) },
          { key: 'filename',    label: 'Filename',      width: 220 },
          { key: 'row_count',   label: 'Rows Added',    width: 90,  render: v => `<span style="font-variant-numeric:tabular-nums">${(v||0).toLocaleString()}</span>` },
          { key: 'uploaded_at', label: 'Uploaded',      width: 150, render: v => fmtDateTime(v) },
          { key: 'report_latest_date', label: 'Latest in File', width: 120, render: v => fmtDate(v) },
          {
            key: 'id', label: 'Actions', width: 100, sortable: false,
            render: (v, row) => {
              const div = document.createElement('div');
              div.style.cssText = 'display:flex;gap:6px;align-items:center';
              const del = document.createElement('button');
              del.className = 'btn btn-sm btn-danger';
              del.innerHTML = '<i data-lucide="trash-2" style="width:12px;height:12px"></i>';
              del.title = 'Delete';
              del.onclick = async () => {
                const ok = await window.Modal?.confirm(
                  'Delete upload?',
                  `This will remove <strong>${(row.row_count||0).toLocaleString()}</strong> rows from the database.`
                );
                if (!ok) return;
                try {
                  const res = await fetch(`${API}/upload-history/${v}/delete`, { method: 'POST' });
                  if (!res.ok) throw new Error(await res.text());
                  window.Toast?.show('Upload deleted', 'success');
                  loadHistory();
                  renderSummaryCard();
                } catch (e) {
                  window.Toast?.show('Delete failed: ' + e.message, 'error');
                }
              };
              div.appendChild(del);
              if (window.lucide) setTimeout(() => window.lucide.createIcons(), 50);
              return div;
            }
          },
        ],
        data: rows,
        rowHeight: 38,
        searchable: true,
        exportable: true,
        columnToggle: false,
      });
    } catch (e) {
      if (wrap) wrap.innerHTML = `<div style="color:var(--red);font-size:13px;padding:16px">${e.message}</div>`;
    }
  }

  function refresh() {
    const t = getTypeFromHash();
    if (t !== activeType) {
      activeType = t;
    }
    renderSummaryCard();
    loadHistory();
  }

  window.__viewExport = { render, refresh };
})();
