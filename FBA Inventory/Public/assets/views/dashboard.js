/* ====================================================
   Dashboard View
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

  // -- Formatters --
  function fmt(n) {
    if (n == null || n === '') return '—';
    const num = parseFloat(n);
    if (!Number.isFinite(num)) return '—';
    return num.toLocaleString();
  }
  function fmtMoney(n) {
    if (n == null || n === '') return '—';
    const num = parseFloat(n);
    if (!Number.isFinite(num)) return '—';
    return '$' + Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function fmtDate(v) {
    if (!v) return '—';
    const d = new Date(String(v).slice(0, 10) + 'T12:00:00');
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  function fmtDateTime(v) {
    if (!v) return '—';
    const d = new Date(v);
    if (isNaN(d)) return '—';
    return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
      + ' ' + d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }

  // -- Skeleton helpers --
  function skeletonKpi() {
    return Array(5).fill(0).map(() => `
      <div class="stat-card">
        <div class="skeleton skeleton-text" style="width:60%;margin-bottom:12px"></div>
        <div class="skeleton skeleton-text" style="width:50%;height:32px;margin-bottom:8px"></div>
        <div class="skeleton skeleton-text" style="width:40%"></div>
      </div>
    `).join('');
  }

  // -- KPI Section --
  async function loadKpis(container) {
    const grid = container.querySelector('#dash-kpi-grid');
    grid.innerHTML = skeletonKpi();
    try {
      const d = await safeFetch(`${API}/stats`);
      const s = d.summary || {};
      const cards = [
        { icon: 'package',           label: 'Total SKUs',      val: fmt(s.total_skus),       color: 'var(--accent)' },
        { icon: 'check-circle',      label: 'Matched SKUs',    val: fmt(s.matched),          color: 'var(--green)' },
        { icon: 'alert-triangle',    label: 'Mismatches',      val: fmt(s.mismatches),     color: 'var(--red)' },
        { icon: 'clock',             label: 'Pending',         val: fmt(s.pending),        color: 'var(--orange)' },
        { icon: 'trending-up',       label: 'Total Variance',  val: fmtMoney(s.total_variance), color: parseFloat(s.total_variance) >= 0 ? 'var(--green)' : 'var(--red)' },
      ];
      grid.innerHTML = cards.map(c => `
        <div class="stat-card">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
            <div style="width:34px;height:34px;border-radius:9px;background:${c.color}18;display:flex;align-items:center;justify-content:center;color:${c.color}">
              <i data-lucide="${c.icon}" style="width:17px;height:17px"></i>
            </div>
            <div class="stat-label" style="margin:0">${c.label}</div>
          </div>
          <div class="stat-value" style="color:${c.color};font-variant-numeric:tabular-nums">${c.val}</div>
        </div>
      `).join('');
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      grid.innerHTML = `<div style="color:var(--red);font-size:13px;padding:16px">Failed to load KPIs: ${e.message}</div>`;
    }
  }

  // -- Coverage Section --
  async function loadCoverage(container) {
    const area = container.querySelector('#dash-coverage-body');
    area.innerHTML = `<div class="skeleton skeleton-text" style="height:160px;border-radius:8px"></div>`;
    try {
      const cov = await safeFetch(`${API}/upload-summary`);
      const rows = cov.rows || [];
      if (!rows.length) {
        area.innerHTML = `
          <div style="text-align:center;padding:40px;color:var(--text3)">
            <i data-lucide="database" style="width:32px;height:32px;display:block;margin:0 auto 12px;color:var(--border)"></i>
            <div style="font-size:14px;font-weight:500;margin-bottom:6px">No data uploaded yet</div>
            <a href="#/upload" style="font-size:13px">Upload your first report ?</a>
          </div>`;
        if (window.lucide) window.lucide.createIcons();
        return;
      }
      const maxCount = Math.max(...rows.map(r => parseInt(r.total_rows, 10) || 0), 1);
      area.innerHTML = rows.map(r => {
        const n = parseInt(r.total_rows, 10) || 0;
        const pct = Math.round(n / maxCount * 100);
        const label = (r.report_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `
          <div style="display:grid;grid-template-columns:180px 1fr 90px 120px;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--border)">
            <div style="font-size:12.5px;color:var(--text2);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
            <div style="background:var(--surface2);border-radius:99px;height:8px;overflow:hidden">
              <div style="height:100%;width:${pct}%;background:var(--accent);border-radius:99px;transition:width .3s"></div>
            </div>
            <div style="font-size:12px;font-weight:600;color:var(--text);text-align:right;font-variant-numeric:tabular-nums">${n.toLocaleString()}</div>
            <div style="font-size:11px;color:var(--text3);text-align:right">${fmtDate(r.last_report_latest_date)}</div>
          </div>`;
      }).join('');
      if (window.lucide) window.lucide.createIcons();
    } catch (e) {
      area.innerHTML = `<div style="color:var(--red);font-size:13px;padding:8px">Failed to load coverage: ${e.message}</div>`;
    }
  }

  // -- Recent Uploads --
  let uploadTable = null;
  async function loadRecentUploads(container) {
    const wrap = container.querySelector('#dash-uploads-wrap');
    wrap.innerHTML = '';
    try {
      const rows = await safeFetch(`${API}/upload-history?limit=10`);
      const data = (rows.rows || []).map((r, i) => ({
        _n:           i + 1,
        report_type:  (r.report_type || '').replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        filename:     r.filename || '—',
        row_count:    r.row_count,
        uploaded_at:  r.uploaded_at,
      }));
      uploadTable = window.VTable.create(wrap, {
        columns: [
          { key: '_n',          label: '#',             width: 44, sortable: false },
          { key: 'report_type', label: 'Report Type',  width: 180 },
          { key: 'filename',    label: 'Filename',      width: 220 },
          { key: 'row_count',   label: 'Rows',          width: 80, render: v => `<span style="font-variant-numeric:tabular-nums">${(v||0).toLocaleString()}</span>` },
          { key: 'uploaded_at', label: 'Uploaded At',   width: 160, render: v => fmtDateTime(v) },
        ],
        data,
        rowHeight: 38,
        searchable: false,
        exportable: false,
        columnToggle: false,
      });
    } catch (e) {
      wrap.innerHTML = `<div style="color:var(--red);font-size:13px;padding:16px">Failed to load uploads: ${e.message}</div>`;
    }
  }

  // -- Render --
  function render(container) {
    container.innerHTML = `
      <div class="page-header">
        <div>
          <div class="page-title">Dashboard</div>
          <div class="page-sub">Inventory health overview</div>
        </div>
      </div>

      <!-- KPIs -->
      <div class="stat-grid mb-4" id="dash-kpi-grid" style="margin-bottom:20px">
        ${skeletonKpi()}
      </div>

      <!-- Coverage -->
      <div class="card mb-4" style="margin-bottom:20px">
        <div class="card-header">
          <span>Data Coverage</span>
          <span style="font-size:12px;color:var(--text3);font-weight:400">Rows per report type</span>
        </div>
        <div class="card-body" id="dash-coverage-body">
          <div class="skeleton" style="height:180px;border-radius:8px"></div>
        </div>
      </div>

      <!-- Recent Uploads -->
      <div class="card">
        <div class="card-header">
          <span>Recent Uploads</span>
          <a href="#/upload" style="font-size:12px;font-weight:400">View all uploads ?</a>
        </div>
        <div style="padding:12px" id="dash-uploads-wrap"></div>
      </div>
    `;

    loadKpis(container);
    loadCoverage(container);
    loadRecentUploads(container);
  }

  async function refresh() {
    const container = document.getElementById('app-view');
    if (!container) return;
    render(container);
  }

  window.__viewExport = { render, refresh };
})();
