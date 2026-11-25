U.page('home', (function () {
  let loaded = false;

  function greet() {
    const h = new Date().getHours();
    const text = h < 5 ? 'Still up? Let\'s keep it calm' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
    U.$('#greeting').textContent = text + ' ☁';
  }

  async function load() {
    greet();
    if (loaded) return;
    loaded = true;
    const d = await U.safe(() => window.api.sys.section('overview'), 'Could not read system info');
    if (!d) { loaded = false; return; }
    window.__overview = d;
    const set = (k, html) => { const el = U.$(`[data-stat="${k}"]`); if (el) el.innerHTML = html; };
    const win = d.win || {};
    set('os', `${U.esc(win.edition || d.osInfo?.distro || 'Windows')}<div class="muted" style="font-size:12px;font-weight:500">${U.esc([win.displayVersion, win.build && 'build ' + win.build + (win.ubr ? '.' + win.ubr : '')].filter(Boolean).join(' · '))}</div>`);
    set('cpu', `${U.esc((d.cpu?.manufacturer || '') + ' ' + (d.cpu?.brand || ''))}<div class="muted" style="font-size:12px;font-weight:500">${d.cpu?.physicalCores || '?'} cores · ${d.cpu?.cores || '?'} threads · ${d.cpu?.speedMax || d.cpu?.speed || '?'} GHz</div>`);
    set('ram', `${U.bytes(d.mem?.total)}<div class="muted" style="font-size:12px;font-weight:500">${U.bytes(d.mem?.available)} available</div>`);
    const gpus = (d.graphics?.controllers || []).filter((g) => g.model);
    set('gpu', gpus.length ? gpus.map((g) => `${U.esc(g.model)}${g.vram ? ` <span class="muted" style="font-size:12px;font-weight:500">${U.bytes(g.vram * 1024 * 1024, 0)}</span>` : ''}`).join('<br>') : '<span class="muted">Unknown</span>');
  }

  return { show: load };
})());
