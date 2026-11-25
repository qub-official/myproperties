U.page('explorer', (function () {
  const { $, $$, esc, bytes, num, date } = U;
  let inited = false;
  let sources = [];
  let selected = null;
  let summary = null;
  let sort = 'size';
  let scanStart = 0;
  let timer = 0;

  const KIND = {
    local: { icon: 'drive', label: 'Local disk' },
    external: { icon: 'usb', label: 'External / USB' },
    removable: { icon: 'usb', label: 'Removable' },
    network: { icon: 'network', label: 'Network drive' },
    optical: { icon: 'disc', label: 'CD / DVD' },
    ram: { icon: 'memory', label: 'RAM disk' },
    unknown: { icon: 'drive', label: 'Drive' }
  };

  async function loadSources() {
    $('#ex-sources').innerHTML = '<div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px"></div><div class="skeleton" style="height:90px"></div>';
    const r = await U.safe(() => window.api.drives.list(), 'Could not list drives');
    const drives = (r?.drives || []).filter((d) => d.ready);
    const total = drives.reduce((a, d) => a + (d.size || 0), 0);
    const used = drives.reduce((a, d) => a + ((d.size || 0) - (d.free || 0)), 0);
    sources = [
      { key: 'computer', kind: 'computer', label: 'Entire computer', icon: 'computer', meta: `${drives.length} drive${drives.length === 1 ? '' : 's'} ·${bytes(used)} used of ${bytes(total)}`, paths: drives.filter((d) => d.kind !== 'network' && d.kind !== 'optical').map((d) => d.path), pct: total ? used / total : 0 },
      ...drives.map((d) => ({
        key: 'drive:' + d.id,
        kind: 'path',
        label: `${d.label || KIND[d.kind]?.label || 'Drive'} (${d.id})`,
        icon: KIND[d.kind]?.icon || 'drive',
        meta: `${KIND[d.kind]?.label || 'Drive'}${d.fs ? ' · ' + d.fs : ''} · ${bytes(d.size - d.free)} / ${bytes(d.size)}`,
        paths: [d.path],
        pct: d.size ? (d.size - d.free) / d.size : 0,
        chip: d.kind === 'external' || d.kind === 'removable' ? 'External' : d.kind === 'network' ? 'Network' : ''
      })),
      ...(r?.devices || []).map((d) => ({ key: 'device:' + d.name, kind: 'device', label: d.name, icon: 'phone', meta: `${d.type} · via Windows Shell (slower)`, paths: [], chip: 'Device' })),
      { key: 'folder', kind: 'path', label: 'Choose a folder…', icon: 'folder', meta: 'Any folder on any drive', paths: [], pick: true }
    ];
    renderSources();
  }

  function renderSources() {
    $('#ex-sources').innerHTML = sources.map((s) => `
      <button class="source ${selected?.key === s.key ? 'selected' : ''}" data-key="${esc(s.key)}">
        <div class="top"><i data-icon="${s.icon}"></i><div class="name">${esc(s.label)}</div>${s.chip ? `<span class="chip ${s.chip === 'Device' ? 'rose' : 'gold'}" style="margin-left:auto">${s.chip}</span>` : ''}</div>
        ${s.pct !== undefined ? `<div class="bar"><i style="width:${Math.round(s.pct * 100)}%"></i></div>` : ''}
        <div class="meta">${esc(s.meta)}</div>
      </button>`).join('');
    U.icons($('#ex-sources'));
    $('#ex-scan').disabled = !selected || (selected.kind === 'path' && !selected.paths.length);
  }

  async function onSourceClick(e) {
    const btn = e.target.closest('.source');
    if (!btn) return;
    const s = sources.find((x) => x.key === btn.dataset.key);
    if (!s) return;
    if (s.pick) {
      const folder = await window.api.dialog.folder();
      if (!folder) return;
      s.paths = [folder];
      s.label = folder.split(/[\\/]/).filter(Boolean).pop() || folder;
      s.meta = folder;
    }
    selected = s;
    renderSources();
  }

  async function startScan() {
    if (!selected) return;
    const source = { kind: selected.kind, paths: selected.paths, label: selected.kind === 'device' ? selected.label : selected.kind === 'computer' ? 'This PC' : selected.paths[0] };
    $('#ex-result').classList.add('hidden');
    $('#ex-progress').classList.remove('hidden');
    $('#ex-scan-name').textContent = selected.label;
    $('#ex-scan').disabled = true;
    scanStart = Date.now();
    clearInterval(timer);
    timer = setInterval(() => { $('#ex-p-time').textContent = U.duration((Date.now() - scanStart) / 1000); }, 500);
    await U.safe(() => window.api.scan.start(source, $('#ex-files').checked), 'Scan failed');
  }

  function onProgress(p) {
    $('#ex-p-files').textContent = num(p.files);
    $('#ex-p-dirs').textContent = num(p.dirs);
    $('#ex-p-bytes').textContent = bytes(p.bytes);
    if (p.current) $('#ex-p-path').textContent = p.current;
  }

  async function onDone(s) {
    clearInterval(timer);
    summary = s;
    $('#ex-progress').classList.add('hidden');
    $('#ex-result').classList.remove('hidden');
    $('#ex-scan').disabled = false;
    $('#ex-r-title').textContent = `${s.rootName}: ${bytes(s.rootSize)}`;
    $('#ex-r-sub').innerHTML = `${num(s.rootFiles)} files · ${num(s.rootDirs)} folders · scanned in ${U.duration(s.ms / 1000)}${s.errors ? ` · <span title="Protected system folders are skipped">${num(s.errors)} not accessible</span>` : ''}${s.links ? ` · ${num(s.links)} links skipped` : ''}`;
    switchTab('tree');
    renderRoot();
    U.toast('Scan complete · ' + bytes(s.rootSize));
  }

  // ---- tree ------------------------------------------------------------------
  function rowHtml(n, depth) {
    return `
      <div class="tree-row ${n.dir ? 'dir' : ''}" data-id="${n.id}" data-depth="${depth}">
        <div class="nm" style="padding-left:${depth * 18}px">
          ${n.dir && n.hasKids ? `<button class="chev" data-toggle>${Icons.chevron}</button>` : '<span style="width:18px;flex:none"></span>'}
          <span class="fi">${n.dir ? Icons.folder : Icons.file}</span>
          <span class="t" title="${esc(n.name)}">${esc(n.name)}</span>
          ${n.err ? '<span class="err" title="Access denied">locked</span>' : ''}
        </div>
        <div class="sizecol"><div class="bar ${n.dir ? '' : 'butter'}"><i style="width:${Math.max(1, Math.round(n.pct * 100))}%"></i></div><span class="num" style="min-width:68px;text-align:right">${bytes(n.size)}</span></div>
        <div class="r num">${n.dir ? num(n.files) : ''}</div>
        <div class="r num">${n.dir ? num(n.dirs) : ''}</div>
        <div class="r muted">${date(n.mtime)}</div>
      </div>
      ${n.dir ? `<div class="kids hidden" data-kids="${n.id}"></div>` : ''}`;
  }

  async function loadChildren(id, container, depth, offset = 0) {
    const r = await U.safe(() => window.api.scan.children({ id, sort, offset, limit: 300 }));
    if (!r) return;
    const more = container.querySelector(':scope > .tree-more');
    if (more) more.remove();
    container.insertAdjacentHTML('beforeend', r.items.map((n) => rowHtml(n, depth)).join(''));
    const shown = offset + r.items.length;
    if (shown < r.total) {
      container.insertAdjacentHTML('beforeend', `<div class="tree-more" style="padding-left:${depth * 18 + 40}px"><button class="btn sm" data-more="${id}" data-offset="${shown}" data-depth="${depth}">Show ${Math.min(300, r.total - shown)} more of ${num(r.total - shown)}</button></div>`);
    }
  }

  async function renderRoot() {
    const tree = $('#ex-tree');
    tree.innerHTML = '';
    if (summary.virtualRoot) {
      await loadChildren(0, tree, 0);
    } else {
      tree.innerHTML = rowHtml({ id: 0, name: summary.rootName, dir: true, size: summary.rootSize, files: summary.rootFiles, dirs: summary.rootDirs, hasKids: true, pct: 1 }, 0);
      await toggle(tree.querySelector('.tree-row'));
    }
  }

  async function toggle(row) {
    const id = row.dataset.id;
    const kidsEl = row.nextElementSibling;
    const chev = row.querySelector('.chev');
    if (!kidsEl || !kidsEl.dataset.kids) return;
    if (!kidsEl.dataset.loaded) {
      kidsEl.dataset.loaded = '1';
      await loadChildren(+id, kidsEl, +row.dataset.depth + 1);
    }
    kidsEl.classList.toggle('hidden');
    chev && chev.classList.toggle('open', !kidsEl.classList.contains('hidden'));
  }

  async function onTreeClick(e) {
    const more = e.target.closest('[data-more]');
    if (more) {
      const container = more.closest('.kids') || $('#ex-tree');
      await loadChildren(+more.dataset.more, container, +more.dataset.depth, +more.dataset.offset);
      return;
    }
    const row = e.target.closest('.tree-row');
    if (row && (e.target.closest('[data-toggle]') || row.classList.contains('dir'))) toggle(row);
  }

  async function reveal(e) {
    const row = e.target.closest('.tree-row, tr[data-id]');
    if (!row) return;
    const p = row.dataset.path || (await window.api.scan.path(+row.dataset.id));
    if (p && /^[a-z]:\\|^\\\\/i.test(p)) window.api.shell.reveal(p);
  }

  // ---- tabs ------------------------------------------------------------------
  async function switchTab(tab) {
    $$('#ex-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
    $$('[data-tabpane]').forEach((p) => p.classList.toggle('hidden', p.dataset.tabpane !== tab));
    if (tab === 'largest') {
      const el = $('#ex-largest');
      el.innerHTML = '<div class="skeleton"></div>';
      const list = await U.safe(() => window.api.scan.largest({ limit: 200 }));
      el.innerHTML = list && list.length ? table(list) : `<div class="empty">${summary?.includeFiles === false ? 'Individual files were not listed in this scan.' : 'No files found.'}</div>`;
    }
    if (tab === 'types') {
      const el = $('#ex-types');
      const list = await U.safe(() => window.api.scan.types());
      const max = list?.[0]?.size || 1;
      el.innerHTML = list && list.length ? `<table class="list-table"><tr><th>Type</th><th style="width:45%"></th><th class="r">Files</th><th class="r">Size</th></tr>${list.map((t) => `
        <tr><td><span class="chip">${t.ext === '(none)' ? 'no extension' : '.' + esc(t.ext)}</span></td><td><div class="bar"><i style="width:${(t.size / max) * 100}%"></i></div></td><td class="r num">${num(t.count)}</td><td class="r num">${bytes(t.size)}</td></tr>`).join('')}</table>`
        : `<div class="empty">${summary?.includeFiles === false ? 'Individual files were not listed in this scan.' : 'No files found.'}</div>`;
    }
  }

  function table(list) {
    return `<table class="list-table"><tr><th>Name</th><th class="r">Size</th><th class="r">Modified</th></tr>${list.map((n) => `
      <tr data-id="${n.id}" data-path="${esc(n.path)}" title="Double-click to show in Explorer"><td><b>${n.dir ? '📁 ' : ''}${esc(n.name)}</b><div class="p">${esc(n.path)}</div></td><td class="r num">${bytes(n.size)}</td><td class="r muted">${date(n.mtime)}</td></tr>`).join('')}</table>`;
  }

  async function doSearch() {
    const q = $('#ex-q').value.trim();
    if (!q) return;
    const el = $('#ex-search');
    el.innerHTML = '<div class="skeleton"></div>';
    const list = await U.safe(() => window.api.scan.search(q));
    el.innerHTML = list && list.length ? table(list) : '<div class="empty">Nothing matched.</div>';
  }

  async function doExport(format) {
    if (!summary) return;
    const suggested = (summary.rootName || 'tree').replace(/[\\/:*?"<>|]+/g, '_').replace(/_+$/, '') + '-tree';
    const r = await U.safe(() => window.api.scan.export({ format, maxDepth: +$('#ex-depth').value, includeFiles: summary.includeFiles, suggested }), 'Export failed');
    if (r?.file) {
      U.toast('Saved ' + r.file.split('\\').pop());
      window.api.shell.reveal(r.file);
    }
  }

  function init() {
    inited = true;
    $('#ex-sources').addEventListener('click', onSourceClick);
    $('#ex-scan').addEventListener('click', startScan);
    $('#ex-refresh').addEventListener('click', loadSources);
    $('#ex-cancel').addEventListener('click', async () => {
      await window.api.scan.cancel();
      clearInterval(timer);
      $('#ex-progress').classList.add('hidden');
      $('#ex-scan').disabled = false;
      U.toast('Scan cancelled');
    });
    $('#ex-tree').addEventListener('click', onTreeClick);
    for (const id of ['#ex-tree', '#ex-largest', '#ex-search']) $(id).addEventListener('dblclick', reveal);
    $('#ex-tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) switchTab(b.dataset.tab); });
    $$('[data-sort]').forEach((b) => b.addEventListener('click', () => {
      sort = b.dataset.sort;
      $$('[data-sort]').forEach((x) => x.classList.toggle('on', x === b));
      if (summary) renderRoot();
    }));
    $$('[data-export]').forEach((b) => b.addEventListener('click', () => doExport(b.dataset.export)));
    $('#ex-q-go').addEventListener('click', doSearch);
    $('#ex-q').addEventListener('keydown', (e) => e.key === 'Enter' && doSearch());
    window.api.scan.onProgress(onProgress);
    window.api.scan.onDone(onDone);
    window.api.scan.onError((m) => { clearInterval(timer); $('#ex-scan').disabled = false; U.toast('Scan error: ' + m, 'err', 6000); });
    loadSources();
  }

  return { show() { if (!inited) init(); } };
})());
