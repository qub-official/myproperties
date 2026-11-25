/* App shell: navigation, theme, settings page. */
(async function () {
  const { $, $$ } = U;
  const settings = await window.api.settings.get();
  document.documentElement.dataset.theme = settings.appTheme || 'cream';

  $('#logo').innerHTML = Icons.logo();
  $('#side-mascot').innerHTML = Icons.mascot();
  $('#hero-mascot').innerHTML = Icons.mascot();
  $('#about-mascot').innerHTML = Icons.mascot();
  U.icons();

  const tips = ['Have a calm day ☁', 'Drink some water 💧', 'Big files hide in Downloads', 'Try the Ink theme at night', 'Stretch your shoulders ☺'];
  $('#side-tip').textContent = tips[Math.floor(Math.random() * tips.length)];

  let currentPage = null;
  function go(name) {
    if (currentPage === name) return;
    const prev = U.pages[currentPage];
    if (prev && prev.hide) prev.hide();
    currentPage = name;
    $$('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.nav === name));
    $$('.page').forEach((p) => p.classList.toggle('active', p.dataset.page === name));
    $('#content').scrollTop = 0;
    const mod = U.pages[name];
    if (mod && mod.show) mod.show();
  }
  document.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-nav], [data-goto]');
    if (nav) go(nav.dataset.nav || nav.dataset.goto);
  });

  // settings page
  $('#set-login').checked = !!settings.openAtLogin;
  $('#set-restore').checked = settings.restoreWallpaper !== false;
  $('#set-tray').checked = settings.closeToTray !== false;
  $('#set-login').addEventListener('change', (e) => window.api.settings.set({ openAtLogin: e.target.checked }));
  $('#set-restore').addEventListener('change', (e) => window.api.settings.set({ restoreWallpaper: e.target.checked }));
  $('#set-tray').addEventListener('change', (e) => window.api.settings.set({ closeToTray: e.target.checked }));
  const info = await window.api.app.info();
  $('#about-ver').textContent = 'v' + info.version;
  $('#about-env').textContent = `Electron ${info.electron} · ${info.platform}`;

  // keep files dropped outside drop zones from navigating the window away
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => e.preventDefault());

  go('home');
})();
