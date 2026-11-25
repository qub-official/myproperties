U.page('themes', (function () {
  const { $, $$, esc } = U;
  let inited = false;
  let state = null;
  let segApps, segSystem;

  const APP_THEMES = [
    { id: 'paper', name: 'Paper', kr: '종이', bg: '#FFFFFF', card: '#F5F4F2', a: '#A87C3A', b: '#0C0F14' },
    { id: 'cream', name: 'Cream', kr: '크림', bg: '#F5F4F2', card: '#FFFFFF', a: '#A87C3A', b: '#FDEBB0' },
    { id: 'sand', name: 'Sand', kr: '모래', bg: '#E9E4E0', card: '#F7F5F3', a: '#B49A85', b: '#0C0F14' },
    { id: 'nude', name: 'Nude', kr: '누드', bg: '#EEE5E0', card: '#FFFFFF', a: '#B08A8A', b: '#A87C3A' },
    { id: 'ink', name: 'Ink', kr: '먹', bg: '#0C0F14', card: '#151820', a: '#C79A55', b: '#F5F4F2' }
  ];

  const ACCENTS = [
    ['#A87C3A', 'Caramel gold'], ['#B08A8A', 'Dusty mauve'], ['#B49A85', 'Taupe'], ['#2E2F33', 'Charcoal'],
    ['#0C0F14', 'Ink'], ['#8E6629', 'Deep gold'], ['#7F8C7A', 'Sage'], ['#6B7F99', 'Slate blue']
  ];

  function renderAppThemes(active) {
    $('#th-app').innerHTML = APP_THEMES.map((t) => `
      <button class="theme-card ${t.id === active ? 'on' : ''}" data-theme="${t.id}">
        <div class="sw" style="background:${t.bg}">
          <i style="left:10px;top:10px;width:46%;height:46px;background:${t.card}"></i>
          <i style="right:10px;top:12px;width:22px;height:22px;border-radius:50%;background:${t.a}"></i>
          <i style="right:10px;bottom:10px;width:32%;height:8px;background:${t.b}"></i>
        </div>
        <div class="nm">${t.name}<span>${t.kr}</span></div>
      </button>`).join('');
  }

  function renderAccents() {
    const cur = (state?.accent || '').toLowerCase();
    $('#th-swatches').innerHTML = ACCENTS.map(([c, n]) => `<button class="swatch ${cur === c.toLowerCase() ? 'on' : ''}" style="background:${c}" data-color="${c}" title="${n}"></button>`).join('') +
      `<label class="custom-color"><input type="color" id="th-custom" value="${/^#[0-9a-f]{6}$/i.test(cur) ? cur : '#a87c3a'}" title="Custom colour">Custom</label>`;
    $('#th-custom').addEventListener('change', (e) => setAccent(e.target.value));
  }

  function renderState() {
    if (!state) return;
    segApps.set(state.appsLight ? 'light' : 'dark');
    segSystem.set(state.systemLight ? 'light' : 'dark');
    $('#th-transp').checked = state.transparency;
    $('#th-acc-taskbar').checked = state.accentOnTaskbar;
    $('#th-acc-title').checked = state.accentOnTitleBars;
    $('#th-wp-current').textContent = 'Current: ' + (state.wallpaper ? state.wallpaper.split('\\').pop() : 'none / slideshow');
    $('#th-wp-style').value = state.wallpaperStyle || 'fill';
    renderAccents();
  }

  async function reload() {
    state = await U.safe(() => window.api.theme.state(), 'Could not read Windows theme');
    renderState();
  }

  async function setAccent(color) {
    state = await U.safe(() => window.api.theme.accent({ color }), 'Could not set accent');
    renderState();
    if (state) U.toast('Accent colour updated');
  }

  async function loadWinThemes() {
    const list = (await U.safe(() => window.api.theme.list())) || [];
    $('#th-win').innerHTML = list.length
      ? list.map((t) => `<button data-file="${esc(t.file)}"><b>${esc(t.name)}</b><small>${esc(t.source)}</small></button>`).join('')
      : '<p class="muted">No theme files found.</p>';
  }

  function setAppTheme(id) {
    document.documentElement.dataset.theme = id;
    window.api.settings.set({ appTheme: id });
    renderAppThemes(id);
  }

  function init() {
    inited = true;
    renderAppThemes(document.documentElement.dataset.theme);
    $('#th-app').addEventListener('click', (e) => { const b = e.target.closest('[data-theme]'); if (b) setAppTheme(b.dataset.theme); });

    segApps = U.seg($('#th-apps'), undefined, async (v) => { state = await U.safe(() => window.api.theme.mode({ appsLight: v === 'light' })); renderState(); });
    segSystem = U.seg($('#th-system'), undefined, async (v) => { state = await U.safe(() => window.api.theme.mode({ systemLight: v === 'light' })); renderState(); });
    $$('[data-preset]').forEach((b) => b.addEventListener('click', async () => {
      const light = b.dataset.preset === 'light';
      state = await U.safe(() => window.api.theme.mode({ appsLight: light, systemLight: light }));
      renderState();
      U.toast(light ? 'Windows is now light ☀' : 'Windows is now dark ☾');
    }));
    $('#th-transp').addEventListener('change', async (e) => { state = await U.safe(() => window.api.theme.transparency(e.target.checked)); renderState(); });
    $('#th-swatches').addEventListener('click', (e) => { const b = e.target.closest('[data-color]'); if (b) setAccent(b.dataset.color); });
    $('#th-acc-taskbar').addEventListener('change', async (e) => { state = await U.safe(() => window.api.theme.accent({ onTaskbar: e.target.checked })); renderState(); });
    $('#th-acc-title').addEventListener('change', async (e) => { state = await U.safe(() => window.api.theme.accent({ onTitleBars: e.target.checked })); renderState(); });
    $('#th-restart').addEventListener('click', async () => { await U.safe(() => window.api.theme.restartExplorer()); U.toast('Explorer restarted'); });
    $('#th-reload').addEventListener('click', reload);
    $('#th-wp-pick').addEventListener('click', async () => {
      const [f] = await window.api.dialog.files([{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'bmp', 'webp', 'gif'] }], false);
      if (!f) return;
      state = await U.safe(() => window.api.theme.wallpaper({ file: f, style: $('#th-wp-style').value }), 'Could not set wallpaper');
      renderState();
      if (state) U.toast('Wallpaper set');
    });
    $('#th-wp-style').addEventListener('change', async (e) => {
      state = await U.safe(() => window.api.theme.wallpaper({ style: e.target.value }));
      renderState();
    });
    $('#th-win').addEventListener('click', async (e) => {
      const b = e.target.closest('[data-file]');
      if (!b) return;
      const r = await U.safe(() => window.api.theme.apply(b.dataset.file), 'Could not apply theme');
      if (r) { U.toast('Applying theme…'); setTimeout(reload, 2500); }
    });
    reload();
    loadWinThemes();
  }

  return { show() { if (!inited) init(); else reload(); } };
})());
