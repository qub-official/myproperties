(function () {
  const stage = document.getElementById('stage');
  const dim = document.getElementById('dim');
  const clock = document.getElementById('clock');
  const KR_DAYS = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];

  let sceneRun = null;
  let media = null;
  let key = '';
  let paused = false;
  let clockTimer = 0;

  function build(cfg) {
    const k = [cfg.type, cfg.srcUrl, cfg.scene].join('|');
    if (k !== key) {
      key = k;
      if (sceneRun) { sceneRun.stop(); sceneRun = null; }
      stage.innerHTML = '';
      media = null;
      // tell the main process when something is actually on screen, so it can
      // swap wallpapers without a black gap while a video warms up
      const ready = () => window.wallpaperApi.ready();
      if (cfg.type === 'video') {
        media = document.createElement('video');
        media.addEventListener('playing', ready, { once: true });
        media.addEventListener('error', ready, { once: true });
        media.src = cfg.srcUrl;
        media.loop = true;
        media.autoplay = true;
        media.playsInline = true;
        stage.appendChild(media);
      } else if (cfg.type === 'image') {
        media = document.createElement('img');
        media.addEventListener('load', ready, { once: true });
        media.addEventListener('error', ready, { once: true });
        media.src = cfg.srcUrl;
        stage.appendChild(media);
      } else {
        const canvas = document.createElement('canvas');
        stage.appendChild(canvas);
        sceneRun = window.Scenes.start(canvas, cfg.scene || 'clouds', { speed: cfg.speed || 1, fps: cfg.fps || 60 });
        requestAnimationFrame(() => requestAnimationFrame(ready));
      }
    }

    if (media) media.className = 'fit-' + (cfg.fit || 'cover');
    if (media && media.tagName === 'VIDEO') {
      media.muted = cfg.muted !== false;
      media.volume = Math.max(0, Math.min(1, (cfg.volume ?? 30) / 100));
      media.playbackRate = cfg.speed || 1;
      if (!paused) media.play().catch(() => {});
    }
    if (sceneRun) sceneRun.setSpeed(cfg.speed || 1);

    dim.style.opacity = String((cfg.dim || 0) / 100);

    clock.className = cfg.clock && cfg.clock !== 'off' ? cfg.clock : '';
    const scene = (window.Scenes.list.find((s) => s.id === cfg.scene) || {});
    if (cfg.type === 'scene' && !scene.dark && (cfg.dim || 0) < 30) clock.classList.add('on-light');
    clearInterval(clockTimer);
    if (clock.className) { tickClock(); clockTimer = setInterval(tickClock, 1000); }
  }

  function tickClock() {
    const d = new Date();
    clock.querySelector('.time').textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    clock.querySelector('.date').innerHTML =
      d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' }) + `<span class="kr">${KR_DAYS[d.getDay()]}</span>`;
  }

  function setPaused(v) {
    paused = !!v;
    if (sceneRun) sceneRun.pause(paused);
    if (media && media.tagName === 'VIDEO') paused ? media.pause() : media.play().catch(() => {});
  }

  window.wallpaperApi.onConfig(build);
  window.wallpaperApi.onPause(setPaused);
})();
