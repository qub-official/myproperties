U.page('wallpaper', (function () {
  const { $, $$, esc } = U;
  let inited = false;
  let runs = [];
  let choice = { type: 'scene', scene: 'clouds' };
  let segs = {};

  const fileUrl = (p) => 'file:///' + encodeURI(p.replace(/\\/g, '/')).replace(/#/g, '%23').replace(/\?/g, '%3F');

  function renderScenes() {
    $('#wp-scenes').innerHTML = Scenes.list.map((s) => `
      <button class="scene ${choice.type === 'scene' && choice.scene === s.id ? 'selected' : ''}" data-scene="${s.id}">
        <canvas></canvas>
        <div class="cap">${esc(s.name)}<span>${esc(s.kr)}</span></div>
      </button>`).join('');
  }

  function startPreviews() {
    stopPreviews();
    $$('#wp-scenes .scene').forEach((el) => runs.push(Scenes.start(el.querySelector('canvas'), el.dataset.scene, { preview: true, fps: 30 })));
  }
  function stopPreviews() { runs.forEach((r) => r.stop()); runs = []; }

  function select(c) {
    choice = c;
    $$('#wp-scenes .scene').forEach((el) => el.classList.toggle('selected', c.type === 'scene' && el.dataset.scene === c.scene));
    const prev = $('#wp-media-preview');
    if (c.type === 'video') {
      prev.innerHTML = `<video src="${fileUrl(c.src)}" autoplay muted loop playsinline></video>`;
      $('#wp-media-name').textContent = c.src;
    } else if (c.type === 'image') {
      prev.innerHTML = `<img src="${fileUrl(c.src)}" alt="">`;
      $('#wp-media-name').textContent = c.src;
    } else {
      prev.innerHTML = '<div class="empty" style="color:#B49A85;display:grid;place-items:center">Using an animated scene</div>';
      $('#wp-media-name').textContent = '';
    }
  }

  function config() {
    return {
      ...choice,
      fit: segs.fit.get(),
      displays: segs.displays.get(),
      clock: segs.clock.get(),
      speed: +$('#wp-speed').value,
      dim: +$('#wp-dim').value,
      muted: $('#wp-muted').checked,
      volume: 40,
      pauseOnBattery: $('#wp-battery').checked
    };
  }

  function setStatus(s) {
    const on = !!s?.active;
    $('#wp-dot').classList.toggle('on', on);
    let what = '';
    if (on) {
      const c = s.config || {};
      what = c.type === 'scene' ? (Scenes.list.find((x) => x.id === c.scene)?.name || 'Scene') : (c.src || '').split('\\').pop();
    }
    $('#wp-status').textContent = on ? `Running · ${what}` : 'Not running';
  }

  async function apply() {
    const btn = $('#wp-apply');
    const label = btn.innerHTML;
    btn.disabled = true;
    // videos can take a few seconds to warm up; the current wallpaper stays until then
    btn.textContent = choice.type === 'video' ? 'Loading video…' : 'Applying…';
    const r = await U.safe(() => window.api.wp.apply(config()), 'Could not set the wallpaper');
    btn.innerHTML = label;
    btn.disabled = false;
    if (r?.ok) {
      U.toast(`Live wallpaper applied on ${r.displays} monitor${r.displays > 1 ? 's' : ''} ✨`);
      setStatus(await window.api.wp.status());
    }
  }

  async function liveUpdate() {
    const s = await window.api.wp.status();
    if (s.active) {
      const c = config();
      // only tweak settings live; media/scene changes need "Apply"
      window.api.wp.update({ fit: c.fit, clock: c.clock, speed: c.speed, dim: c.dim, muted: c.muted, pauseOnBattery: c.pauseOnBattery });
    }
  }

  function init() {
    inited = true;
    renderScenes();
    segs.fit = U.seg($('#wp-fit'), 'cover', liveUpdate);
    segs.displays = U.seg($('#wp-displays'), 'all');
    segs.clock = U.seg($('#wp-clock'), 'off', liveUpdate);
    $('#wp-scenes').addEventListener('click', (e) => { const b = e.target.closest('.scene'); if (b) select({ type: 'scene', scene: b.dataset.scene }); });
    $('#wp-pick-video').addEventListener('click', async () => {
      const [f] = await window.api.dialog.files([{ name: 'Videos', extensions: ['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv'] }], false);
      if (f) select({ type: 'video', src: f });
    });
    $('#wp-pick-image').addEventListener('click', async () => {
      const [f] = await window.api.dialog.files([{ name: 'GIF & images', extensions: ['gif', 'webp', 'apng', 'png', 'jpg', 'jpeg', 'avif', 'bmp'] }], false);
      if (f) select({ type: 'image', src: f });
    });
    $('#wp-speed').addEventListener('input', () => { $('#wp-speed-v').textContent = (+$('#wp-speed').value).toFixed(2).replace(/0$/, '') + '×'; });
    $('#wp-speed').addEventListener('change', liveUpdate);
    $('#wp-dim').addEventListener('input', () => { $('#wp-dim-v').textContent = $('#wp-dim').value + '%'; });
    $('#wp-dim').addEventListener('change', liveUpdate);
    $('#wp-muted').addEventListener('change', liveUpdate);
    $('#wp-battery').addEventListener('change', liveUpdate);
    $('#wp-apply').addEventListener('click', apply);
    $('#wp-stop').addEventListener('click', async () => {
      await window.api.wp.stop();
      setStatus({ active: false });
      U.toast('Live wallpaper stopped');
    });
    window.api.wp.onStatus(setStatus);

    window.api.wp.status().then((s) => {
      setStatus(s);
      const c = s.config || null;
      window.api.settings.get().then((st) => {
        const cfg = c || st.wallpaper;
        if (!cfg) return;
        select(cfg.type === 'scene' ? { type: 'scene', scene: cfg.scene } : { type: cfg.type, src: cfg.src });
        segs.fit.set(cfg.fit || 'cover');
        segs.displays.set(cfg.displays || 'all');
        segs.clock.set(cfg.clock || 'off');
        $('#wp-speed').value = cfg.speed || 1; $('#wp-speed').dispatchEvent(new Event('input'));
        $('#wp-dim').value = cfg.dim || 0; $('#wp-dim').dispatchEvent(new Event('input'));
        $('#wp-muted').checked = cfg.muted !== false;
        $('#wp-battery').checked = cfg.pauseOnBattery !== false;
      });
    });
  }

  return {
    show() { if (!inited) init(); startPreviews(); },
    hide() { stopPreviews(); const v = $('#wp-media-preview video'); if (v) v.pause(); }
  };
})());
