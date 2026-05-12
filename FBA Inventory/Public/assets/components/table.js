/* ====================================================
   VTable — paginated <table> with a JS-managed fixed header clone
   The clone uses position:fixed (not sticky) so it is always anchored
   to the viewport regardless of any overflow ancestor.  It appears only
   when the real thead has scrolled above the topbar.
   window.VTable.create(containerEl, options) → instance
   ==================================================== */

(function () {
  function create(containerEl, options) {
    const {
      columns         = [],
      data            = [],
      perPage:        _initPerPage = 30,
      searchable      = true,
      exportable      = true,
      columnToggle    = true,
      colTotalPrefix  = '',
    } = options;
    let perPage = _initPerPage;   // mutable — changed by the rows-per-page selector

    let allData      = [...data];
    let filteredData = [...data];
    let sortKey      = null;
    let sortDir      = 'asc';
    let searchQuery  = '';
    let curPage      = 0;
    let visibleCols  = columns.map(c => c.key);
    let loading      = false;
    let searchTimer  = null;
    let colDropOpen  = false;

    function dispatchRendered() {
      containerEl.dispatchEvent(new CustomEvent('vtable:rendered', {
        bubbles: true,
        detail: { filteredData },
      }));
    }

    // ── Build DOM ──
    containerEl.innerHTML = '';
    containerEl.classList.add('vtable-wrap');

    // ── Toolbar ──
    const toolbar = document.createElement('div');
    toolbar.className = 'vtable-toolbar';

    if (searchable) {
      const si = document.createElement('input');
      si.type = 'text';
      si.placeholder = 'Search…';
      si.className = 'vtable-search';
      si.addEventListener('input', () => {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(() => {
          searchQuery = si.value.toLowerCase();
          curPage = 0;
          applyFilter();
          renderAll();
        }, 250);
      });
      toolbar.appendChild(si);
    }

    const metaEl = document.createElement('span');
    metaEl.className = 'vtable-meta';
    toolbar.appendChild(metaEl);

    if (exportable) {
      const expBtn = document.createElement('button');
      expBtn.className = 'btn btn-outline btn-sm';
      expBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
        <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg> Export CSV`;
      expBtn.addEventListener('click', exportCsv);
      toolbar.appendChild(expBtn);
    }

    if (columnToggle) {
      const colWrap = document.createElement('div');
      colWrap.className = 'col-toggle-wrap';
      const colBtn = document.createElement('button');
      colBtn.className = 'btn btn-outline btn-sm';
      colBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13"
        viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round">
        <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
        <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
        <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
        </svg> Columns`;
      const dropdown = document.createElement('div');
      dropdown.className = 'col-toggle-dropdown';
      dropdown.style.display = 'none';
      columns.forEach(col => {
        const lbl = document.createElement('label');
        lbl.className = 'col-toggle-item';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = true;
        cb.addEventListener('change', () => {
          if (cb.checked) { if (!visibleCols.includes(col.key)) visibleCols.push(col.key); }
          else { visibleCols = visibleCols.filter(k => k !== col.key); }
          curPage = 0;
          renderHeader();
          renderBody();
          renderPag();
          dispatchRendered();
        });
        lbl.appendChild(cb);
        lbl.appendChild(document.createTextNode(' ' + col.label));
        dropdown.appendChild(lbl);
      });
      colBtn.addEventListener('click', e => {
        e.stopPropagation();
        colDropOpen = !colDropOpen;
        dropdown.style.display = colDropOpen ? 'block' : 'none';
      });
      document.addEventListener('click', () => {
        colDropOpen = false;
        dropdown.style.display = 'none';
      });
      colWrap.appendChild(colBtn);
      colWrap.appendChild(dropdown);
      toolbar.appendChild(colWrap);
    }

    containerEl.appendChild(toolbar);

    // ── Main table wrap ──
    const tblWrap = document.createElement('div');
    tblWrap.className = 'vtable-tbl-wrap';
    containerEl.appendChild(tblWrap);

    const table = document.createElement('table');
    table.className = 'vtable-table';
    tblWrap.appendChild(table);

    const thead = document.createElement('thead');
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    table.appendChild(tbody);

    // ── Fixed header clone ───────────────────────────────────────────────────
    // Uses position:fixed (not sticky) — fixed always anchors to the viewport,
    // no overflow:auto ancestor can interfere.
    // Hidden by default; JS shows it only when the real thead has scrolled
    // above the topbar.
    // ─────────────────────────────────────────────────────────────────────────
    const stickyHead = document.createElement('div');
    stickyHead.className = 'vtable-sticky-head';
    stickyHead.style.display = 'none';
    document.body.appendChild(stickyHead); // attach to body so fixed works cleanly

    const stickyTbl = document.createElement('table');
    stickyTbl.className = 'vtable-table';
    const stickyThead = document.createElement('thead');
    stickyTbl.appendChild(stickyThead);
    stickyHead.appendChild(stickyTbl);

    // Sync horizontal scroll: when data table scrolls, mirror to clone
    tblWrap.addEventListener('scroll', () => {
      stickyHead.scrollLeft = tblWrap.scrollLeft;
      updateClonePos();
    });

    // ── Skeleton / empty / pag ──
    const skeletonEl = document.createElement('div');
    skeletonEl.style.cssText = 'display:none;padding:4px 0';
    for (let i = 0; i < 8; i++) {
      const s = document.createElement('div');
      s.className = 'skeleton skeleton-row';
      s.style.margin = '2px 12px';
      skeletonEl.appendChild(s);
    }
    containerEl.appendChild(skeletonEl);

    const emptyEl = document.createElement('div');
    emptyEl.className = 'vtable-empty';
    emptyEl.style.display = 'none';
    emptyEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="36" height="36"
      viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
      stroke-linecap="round" stroke-linejoin="round" style="margin-bottom:8px;opacity:.3">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/>
      <polyline points="13 2 13 9 20 9"/></svg><span>No data found</span>`;
    containerEl.appendChild(emptyEl);

    const pagEl = document.createElement('div');
    pagEl.className = 'vtable-pag';
    containerEl.appendChild(pagEl);

    // ── Fixed clone position manager ──
    function getTopbarH() {
      const v = getComputedStyle(document.documentElement).getPropertyValue('--topbar-h');
      return parseInt(v) || 52;
    }

    function updateClonePos() {
      if (!filteredData.length) { stickyHead.style.display = 'none'; return; }
      const topbarH  = getTopbarH();
      const theadBox = thead.getBoundingClientRect();

      if (theadBox.bottom <= topbarH) {
        // Real thead has fully scrolled above the topbar → show fixed clone
        const wrapBox = tblWrap.getBoundingClientRect();
        stickyHead.style.display  = '';
        stickyHead.style.position = 'fixed';
        stickyHead.style.top      = topbarH + 'px';
        stickyHead.style.left     = wrapBox.left + 'px';
        stickyHead.style.width    = wrapBox.width + 'px';
        stickyHead.scrollLeft     = tblWrap.scrollLeft;
      } else {
        // Real thead is still visible → hide clone
        stickyHead.style.display = 'none';
      }
    }

    const appView = document.getElementById('app-view');
    if (appView) appView.addEventListener('scroll', updateClonePos, { passive: true });
    window.addEventListener('resize', updateClonePos, { passive: true });

    // ── Column helpers ──
    function visCols() { return columns.filter(c => visibleCols.includes(c.key)); }

    // Build one <th> (shared by real thead and clone thead)
    function buildTh(col, addColTotalId) {
      const th = document.createElement('th');
      th.className = 'vtable-th' + (col.numeric ? ' th-num' : '');
      th.dataset.col = col.key;

      const labelSpan = document.createElement('span');
      labelSpan.textContent = col.label;
      th.appendChild(labelSpan);

      if (col.sortable !== false) {
        th.style.cursor = 'pointer';
        if (sortKey === col.key) {
          const arr = document.createElement('span');
          arr.style.marginLeft = '4px';
          arr.textContent = sortDir === 'asc' ? '↑' : '↓';
          arr.style.color = 'var(--accent)';
          th.appendChild(arr);
        }
        th.addEventListener('click', () => {
          if (sortKey === col.key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortKey = col.key; sortDir = 'asc'; }
          curPage = 0;
          applyFilter();
          renderHeader();
          renderBody();
          renderPag();
          dispatchRendered();
        });
      }

      if (col.numeric) {
        const totalDiv = document.createElement('div');
        totalDiv.className = 'col-total';
        // Only the clone carries ct-* IDs so view-file queries find them
        if (addColTotalId) totalDiv.id = colTotalPrefix + 'ct-' + col.key;
        totalDiv.title = 'Click to filter non-zero rows';
        th.appendChild(totalDiv);
      }

      return th;
    }

    // ── Render both real thead and clone thead ──
    function renderHeader() {
      const vc = visCols();
      thead.innerHTML      = '';
      stickyThead.innerHTML = '';

      const realTr  = document.createElement('tr');
      const cloneTr = document.createElement('tr');

      vc.forEach(col => {
        realTr.appendChild(buildTh(col, false));  // real: no ct-* IDs
        cloneTr.appendChild(buildTh(col, true));  // clone: has ct-* IDs
      });

      thead.appendChild(realTr);
      stickyThead.appendChild(cloneTr);
    }

    // ── Sync clone column widths from real thead after layout ──
    function syncColWidths() {
      const realThs  = Array.from(thead.querySelectorAll('th'));
      const cloneThs = Array.from(stickyThead.querySelectorAll('th'));
      let totalW = 0;

      realThs.forEach((th, i) => {
        const w = th.getBoundingClientRect().width;
        if (cloneThs[i]) {
          cloneThs[i].style.width    = w + 'px';
          cloneThs[i].style.minWidth = w + 'px';
        }
        totalW += w;
      });

      if (totalW > 0) {
        stickyTbl.style.tableLayout = 'fixed';
        stickyTbl.style.width = totalW + 'px';
      }
    }

    // ── Render body rows ──
    function renderBody() {
      const vc       = visCols();
      const pageRows = filteredData.slice(curPage * perPage, (curPage + 1) * perPage);

      if (filteredData.length === 0) {
        tbody.innerHTML          = '';
        tblWrap.style.display    = 'none';
        stickyHead.style.display = 'none';
        emptyEl.style.display    = 'flex';
        pagEl.innerHTML = '';
        updateMeta();
        return;
      }
      tblWrap.style.display = '';
      emptyEl.style.display = 'none';

      const frag = document.createDocumentFragment();
      pageRows.forEach((row, ri) => {
        const tr = document.createElement('tr');
        tr.style.background = (curPage * perPage + ri) % 2 === 0
          ? 'var(--surface)' : 'var(--surface2)';
        vc.forEach(col => {
          const td = document.createElement('td');
          td.className = 'vtable-td' + (col.numeric ? ' r' : '');
          const val = row[col.key];
          if (col.render) {
            const rendered = col.render(val, row);
            if (rendered instanceof HTMLElement) td.appendChild(rendered);
            else td.innerHTML = rendered ?? '';
          } else {
            td.textContent = val ?? '';
          }
          tr.appendChild(td);
        });
        frag.appendChild(tr);
      });
      tbody.innerHTML = '';
      tbody.appendChild(frag);
      updateMeta();

      // Sync clone widths after browser computes layout
      requestAnimationFrame(() => {
        syncColWidths();
        updateClonePos();
      });
    }

    function renderPag() {
      const pages = Math.ceil(filteredData.length / perPage);
      const from  = filteredData.length ? curPage * perPage + 1 : 0;
      const to    = Math.min((curPage + 1) * perPage, filteredData.length);

      let h = `<span class="vtable-pag-info">${from}–${to} of ${filteredData.length.toLocaleString()}</span>`;

      if (pages > 1) {
        h += `<button type="button" class="pbb" ${curPage === 0 ? 'disabled' : ''}
              data-vpage="${curPage - 1}">← Prev</button>`;
        const s = Math.max(0, curPage - 3);
        const e = Math.min(pages - 1, curPage + 3);
        for (let i = s; i <= e; i++) {
          h += `<button type="button" class="pbb${i === curPage ? ' active' : ''}"
                data-vpage="${i}">${i + 1}</button>`;
        }
        h += `<button type="button" class="pbb" ${curPage >= pages - 1 ? 'disabled' : ''}
              data-vpage="${curPage + 1}">Next →</button>`;
      }

      // Rows-per-page selector — always visible
      h += `<span class="vtable-pag-sep"></span>
            <span class="vtable-pag-rpp">Rows:
              <select class="vtable-rpp-sel">
                ${[30, 50, 100].map(n =>
                  `<option value="${n}"${perPage === n ? ' selected' : ''}>${n}</option>`
                ).join('')}
              </select>
            </span>`;

      pagEl.innerHTML = h;

      pagEl.querySelectorAll('[data-vpage]').forEach(btn => {
        btn.addEventListener('click', () => {
          if (btn.disabled) return;
          goPage(parseInt(btn.getAttribute('data-vpage'), 10));
        });
      });

      const rppSel = pagEl.querySelector('.vtable-rpp-sel');
      if (rppSel) {
        rppSel.addEventListener('change', () => {
          perPage = parseInt(rppSel.value, 10);
          curPage = 0;
          renderBody();
          renderPag();
          dispatchRendered();
        });
      }
    }

    function goPage(p) {
      curPage = p;
      renderBody();
      renderPag();
      containerEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      dispatchRendered();
    }

    function applyFilter() {
      let result = [...allData];
      if (searchQuery) {
        result = result.filter(row =>
          columns.some(col => {
            const val = row[col.key];
            return val != null && String(val).toLowerCase().includes(searchQuery);
          })
        );
      }
      if (sortKey) {
        result.sort((a, b) => {
          const va = a[sortKey] ?? '', vb = b[sortKey] ?? '';
          const na = parseFloat(va), nb = parseFloat(vb);
          const cmp = !isNaN(na) && !isNaN(nb) && String(va).trim() !== '' && String(vb).trim() !== ''
            ? na - nb
            : String(va).localeCompare(String(vb));
          return sortDir === 'asc' ? cmp : -cmp;
        });
      }
      filteredData = result;
    }

    function updateMeta() {
      metaEl.textContent = `${filteredData.length.toLocaleString()} rows`;
    }

    function renderAll() {
      renderHeader();
      renderBody();
      renderPag();
      dispatchRendered();
    }

    function exportCsv() {
      const vc     = visCols();
      const header = vc.map(c => `"${c.label}"`).join(',');
      const rows   = filteredData.map(row =>
        vc.map(c => `"${String(row[c.key] ?? '').replace(/"/g, '""')}"`).join(',')
      );
      const csv  = [header, ...rows].join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'export.csv';
      a.click();
      URL.revokeObjectURL(url);
    }

    applyFilter();
    renderAll();

    return {
      setData(newData) {
        allData = [...newData];
        curPage = 0;
        applyFilter();
        renderAll();
      },
      setLoading(state) {
        loading = state;
        skeletonEl.style.display = state ? 'block' : 'none';
        if (state) {
          tblWrap.style.display    = 'none';
          stickyHead.style.display = 'none';
          pagEl.style.display      = 'none';
          emptyEl.style.display    = 'none';
          toolbar.style.opacity       = '0.5';
          toolbar.style.pointerEvents = 'none';
        } else {
          toolbar.style.opacity       = '1';
          toolbar.style.pointerEvents = '';
          pagEl.style.display         = '';
          if (filteredData.length === 0) {
            tblWrap.style.display    = 'none';
            stickyHead.style.display = 'none';
            emptyEl.style.display    = 'flex';
            pagEl.innerHTML          = '';
          } else {
            tblWrap.style.display = '';
            emptyEl.style.display = 'none';
            renderBody();
            renderPag();
          }
        }
      },
      refresh() {
        applyFilter();
        renderAll();
      },
      getData() { return filteredData; },
      // Clean up listeners when the view is destroyed
      destroy() {
        if (appView) appView.removeEventListener('scroll', updateClonePos);
        window.removeEventListener('resize', updateClonePos);
        if (stickyHead.parentNode) stickyHead.parentNode.removeChild(stickyHead);
      },
    };
  }

  window.VTable = { create };
})();
