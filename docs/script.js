/* Landing page behaviour: live scene previews, download links and small niceties. */
(function () {
  // ---------- repository detection ----------
  // On GitHub Pages (https://USER.github.io/REPO/) we can work out the repo automatically.
  // Otherwise edit FALLBACK_REPO below.
  const FALLBACK_REPO = 'qub-official/myproperties';
  let repo = FALLBACK_REPO;
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    const user = host.replace('.github.io', '');
    const first = location.pathname.split('/').filter(Boolean)[0];
    repo = `${user}/${first || host}`;
  }
  const repoUrl = `https://github.com/${repo}`;
  const releasesUrl = `${repoUrl}/releases/latest`;

  document.querySelectorAll('[data-repo-link]').forEach((a) => (a.href = repoUrl));
  document.querySelectorAll('[data-repo-git]').forEach((el) => (el.textContent = `${repoUrl}.git`));
  document.querySelectorAll('[data-download]').forEach((a) => (a.href = releasesUrl));

  // Point buttons straight at the latest release files when the GitHub API is reachable.
  if (!repo.startsWith('YOUR-USERNAME')) {
    fetch(`https://api.github.com/repos/${repo}/releases/latest`)
      .then((r) => (r.ok ? r.json() : null))
      .then((rel) => {
        if (!rel || !rel.assets) return;
        const find = (re) => rel.assets.find((a) => re.test(a.name));
        const setup = find(/setup.*\.exe$/i);
        const portable = find(/portable.*\.exe$/i);
        document.querySelectorAll('[data-download="setup"]').forEach((a) => setup && (a.href = setup.browser_download_url));
        document.querySelectorAll('[data-download="portable"]').forEach((a) => portable && (a.href = portable.browser_download_url));
        if (rel.tag_name) document.querySelectorAll('[data-version]').forEach((el) => (el.textContent = rel.tag_name));
      })
      .catch(() => {});
  }

  // ---------- live scenes ----------
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gallery = document.getElementById('gallery');
  if (window.Scenes && gallery) {
    gallery.innerHTML = Scenes.list.map((s) => `<figure class="reveal"><canvas data-scene="${s.id}"></canvas><figcaption>${s.name}<span>${s.kr}</span></figcaption></figure>`).join('');
  }
  const runs = new Map();
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const c = e.target;
      if (e.isIntersecting && !runs.has(c)) {
        const run = Scenes.start(c, c.dataset.scene, { preview: true, fps: 30 });
        if (reduce) setTimeout(() => run.pause(true), 300);
        runs.set(c, run);
      } else if (!e.isIntersecting && runs.has(c)) {
        runs.get(c).stop();
        runs.delete(c);
      }
    }
  }, { rootMargin: '100px' });
  if (window.Scenes) document.querySelectorAll('canvas[data-scene]').forEach((c) => io.observe(c));

  // ---------- reveal on scroll ----------
  document.querySelectorAll('.feature, .strip-grid > div, .steps > div, .download, .palette div, details').forEach((el) => el.classList.add('reveal'));
  const rio = new IntersectionObserver((entries) => entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); rio.unobserve(e.target); } }), { threshold: 0.12 });
  document.querySelectorAll('.reveal').forEach((el) => rio.observe(el));

  // ---------- nav border ----------
  const nav = document.querySelector('.nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 8);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
