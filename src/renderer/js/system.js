U.page('system', (function () {
  const { $, $$, esc, bytes, label } = U;
  let inited = false;
  let current = 'os';
  const cache = {};
  let liveTimer = 0;
  const hist = { cpu: [], mem: [], net: [] };

  const BYTE_KEYS = new Set(['total', 'free', 'used', 'active', 'available', 'buffers', 'cached', 'slab', 'buffcache', 'swaptotal', 'swapused', 'swapfree', 'writeback', 'dirty', 'size', 'totalPhysicalMemory', 'rx_bytes', 'tx_bytes', 'l1d', 'l1i', 'l2', 'l3', 'rx', 'wx', 'tx']);
  const MB_KEYS = new Set(['vram', 'memoryTotal', 'memoryUsed', 'memoryFree', 'allocatedMB', 'currentUsageMB', 'peakUsageMB']);
  const KB_KEYS = new Set(['totalVirtualMemoryKB', 'freeVirtualMemoryKB', 'sizeKB']);
  const RATE_KEYS = new Set(['rx_sec', 'tx_sec', 'rx_dropped_sec']);

  function fmt(key, v, sec) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'boolean') return v ? '<span class="chip ok">Yes</span>' : '<span class="chip">No</span>';
    if (typeof v === 'number') {
      if (BYTE_KEYS.has(key)) return bytes(v);
      if (MB_KEYS.has(key)) return bytes(v * 1024 * 1024, 0);
      if (KB_KEYS.has(key)) return bytes(v * 1024);
      if (RATE_KEYS.has(key)) return bytes(v) + '/s';
      if (sec === 'cpu' && /^(speed|min|max|avg)/i.test(key)) return v + ' GHz';
      if (key === 'clockSpeed') return v + ' MHz';
      if (sec === 'network' && key === 'speed') return v + ' Mbit/s';
      if (key === 'uptime') return U.duration(v);
      if (/^(main|cores|chipset|socket)$/.test(key) && sec === 'cpu') return v + ' °C';
      if (key === 'percent' || key === 'utilizationGpu' || key === 'utilizationMemory') return v + ' %';
      if (key === 'voltage' || key === 'voltageConfigured' || key === 'voltageMin' || key === 'voltageMax') return v + ' V';
      // build numbers, ids, years, ports… read better without thousands separators
      if (/build|ubr|year|id$|port|number|serial|version|pid|code|index/i.test(key) || (Number.isInteger(v) && Math.abs(v) < 10000)) return String(v);
      return v.toLocaleString();
    }
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return esc(new Date(v).toLocaleString());
    return esc(v);
  }

  function isEmpty(v) {
    return v === null || v === undefined || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  }

  function kv(obj, sec) {
    const rows = [];
    const nested = [];
    for (const [k, v] of Object.entries(obj)) {
      if (isEmpty(v)) continue;
      if (Array.isArray(v)) {
        if (typeof v[0] === 'object') nested.push([k, v]);
        else rows.push(`<div class="k">${esc(label(k))}</div><div>${v.map((x) => `<span class="chip" style="margin:0 4px 4px 0">${esc(x)}</span>`).join('')}</div>`);
      } else if (typeof v === 'object') {
        nested.push([k, v]);
      } else {
        const f = fmt(k, v, sec);
        if (f !== null) rows.push(`<div class="k">${esc(label(k))}</div><div>${f}</div>`);
      }
    }
    let html = rows.length ? `<div class="kv">${rows.join('')}</div>` : '';
    for (const [k, v] of nested) {
      html += `<div style="margin-top:14px"><h3 style="font-size:13px;color:var(--text-2)">${esc(label(k))}</h3>${Array.isArray(v) ? v.map((x) => `<div class="subcard">${kv(x, sec)}</div>`).join('') : `<div class="subcard">${kv(v, sec)}</div>`}</div>`;
    }
    return html;
  }

  function titleFor(item, i) {
    return item.model || item.name || item.iface || item.fs || item.ifaceName || item.ssid || item.manufacturer || item.type || `#${i + 1}`;
  }

  function group(title, value, sec) {
    if (isEmpty(value)) return `<div class="kv-group"><h3>${esc(title)}</h3><p class="muted">Not available on this PC.</p></div>`;
    if (Array.isArray(value)) {
      if (typeof value[0] !== 'object') return `<div class="kv-group"><h3>${esc(title)}</h3><div class="flags">${value.map((x) => `<span class="chip">${esc(x)}</span>`).join('')}</div></div>`;
      return `<div class="kv-group"><h3>${esc(title)} <span class="chip">${value.length}</span></h3>${value.map((x, i) => `<div class="subcard"><b style="display:block;margin-bottom:6px">${esc(titleFor(x, i))}</b>${kv(x, sec)}</div>`).join('')}</div>`;
    }
    if (typeof value === 'object') return `<div class="kv-group"><h3>${esc(title)}</h3>${kv(value, sec)}</div>`;
    return `<div class="kv-group"><h3>${esc(title)}</h3><p>${fmt('', value, sec)}</p></div>`;
  }

  const TITLES = {
    os: 'Windows', cpu: 'Processor', memory: 'Memory', graphics: 'Graphics & displays', storage: 'Storage',
    board: 'Motherboard & BIOS', network: 'Network', power: 'Battery & power', devices: 'Audio & devices', software: 'Software'
  };

  function render(sec, data) {
    const body = $('#sys-body');
    let html = `<div class="card-head"><div><h2>${esc(TITLES[sec])}</h2><div class="card-sub">Read ${new Date().toLocaleTimeString()}</div></div><button class="btn sm ghost" id="sys-reload"><i data-icon="refresh"></i>Reload</button></div>`;

    if (sec === 'cpu') {
      html += `<div class="kv-group"><h3>Live per-core load</h3><div class="cores" id="sys-cores"></div></div>`;
      const flags = data.flags ? String(data.flags).split(/\s+/).filter(Boolean) : [];
      html += group('Processor', data.cpu, sec) + group('Current speed', data.speed, sec) + group('Cache', data.cache, sec) + group('Temperature', data.temperature, sec);
      html += `<div class="kv-group"><h3>Instruction set flags <span class="chip">${flags.length}</span></h3><div class="flags">${flags.map((f) => `<span class="chip">${esc(f)}</span>`).join('') || '<span class="muted">Not available</span>'}</div></div>`;
    } else if (sec === 'software') {
      const apps = data.installed || [];
      html += `<div class="kv-group"><h3>Installed programs <span class="chip">${apps.length}</span></h3>
        <input class="input" id="sys-app-q" placeholder="Filter programs…" style="width:100%;margin-bottom:10px">
        <div style="max-height:520px;overflow:auto"><table class="list-table" id="sys-apps"><tr><th>Name</th><th>Version</th><th>Publisher</th><th class="r">Size</th></tr>
        ${apps.map((a) => `<tr><td><b>${esc(a.name)}</b></td><td class="muted">${esc(a.version || '')}</td><td class="muted">${esc(a.publisher || '')}</td><td class="r num">${a.sizeKB ? bytes(a.sizeKB * 1024) : ''}</td></tr>`).join('')}</table></div></div>`;
      html += group('Startup programs', data.startup, sec);
    } else if (sec === 'graphics') {
      html += group('Graphics cards', data?.controllers, sec) + group('Displays', data?.displays, sec);
    } else if (data && typeof data === 'object' && !Array.isArray(data)) {
      for (const [k, v] of Object.entries(data)) html += group(label(k), v, sec);
    } else {
      html += group(TITLES[sec], data, sec);
    }
    body.innerHTML = html;
    U.icons(body);
    $('#sys-reload').addEventListener('click', () => { delete cache[sec]; open(sec); });
    const q = $('#sys-app-q');
    if (q) q.addEventListener('input', () => {
      const needle = q.value.toLowerCase();
      $$('#sys-apps tr').forEach((tr, i) => { if (i) tr.style.display = tr.textContent.toLowerCase().includes(needle) ? '' : 'none'; });
    });
  }

  async function open(sec) {
    current = sec;
    $$('#sys-nav button').forEach((b) => b.classList.toggle('on', b.dataset.sec === sec));
    const body = $('#sys-body');
    if (!cache[sec]) {
      body.innerHTML = `<h2>${esc(TITLES[sec])}</h2>` + '<div class="skeleton" style="width:60%"></div><div class="skeleton"></div><div class="skeleton" style="width:80%"></div><div class="skeleton" style="width:40%"></div>';
      const data = await U.safe(() => window.api.sys.section(sec), 'Could not read ' + TITLES[sec]);
      if (!data) return;
      cache[sec] = data;
    }
    if (current === sec) render(sec, cache[sec]);
  }

  function spark(id, values, max) {
    const svg = $(id);
    if (!svg || values.length < 2) return;
    const m = max || Math.max(1, ...values);
    const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${34 - (v / m) * 32}`).join(' ');
    svg.innerHTML = `<polygon points="0,36 ${pts} 100,36" fill="var(--accent-soft)" opacity=".8"/><polyline points="${pts}" fill="none" stroke="var(--accent)" stroke-width="1.6" vector-effect="non-scaling-stroke"/>`;
  }

  async function tick() {
    const l = await window.api.sys.live().catch(() => null);
    if (!l) return;
    const push = (k, v) => { hist[k].push(v); if (hist[k].length > 40) hist[k].shift(); };
    push('cpu', l.cpu); push('mem', l.memTotal ? (l.memUsed / l.memTotal) * 100 : 0); push('net', l.rx + l.tx);
    $('#g-cpu').innerHTML = `${l.cpu.toFixed(0)}<small>%${l.speed ? ' · ' + l.speed + ' GHz' : ''}</small>`;
    $('#g-mem').innerHTML = `${bytes(l.memUsed)}<small>of ${bytes(l.memTotal, 0)}</small>`;
    $('#g-net').innerHTML = `${bytes(l.rx)}<small>/s ↓ · ${bytes(l.tx)}/s ↑</small>`;
    $('#g-up').textContent = U.duration(l.uptime);
    $('#g-extra').textContent = `${l.cores.length} logical cores`;
    spark('#s-cpu', hist.cpu, 100); spark('#s-mem', hist.mem, 100); spark('#s-net', hist.net);
    const cores = $('#sys-cores');
    if (cores) {
      if (cores.children.length !== l.cores.length) cores.innerHTML = l.cores.map((_, i) => `<div class="core"><i></i><span>${i}</span></div>`).join('');
      l.cores.forEach((v, i) => { cores.children[i].querySelector('i').style.height = `${Math.round(v)}%`; cores.children[i].title = `Core ${i}: ${v.toFixed(0)}%`; });
    }
  }

  function init() {
    inited = true;
    $('#sys-nav').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) open(b.dataset.sec); });
    $$('[data-sysexport]').forEach((b) => b.addEventListener('click', async () => {
      U.toast('Collecting everything… this can take a few seconds');
      const r = await U.safe(() => window.api.sys.export(b.dataset.sysexport), 'Export failed');
      if (r?.file) { U.toast('Saved ' + r.file.split('\\').pop()); window.api.shell.reveal(r.file); }
    }));
    open('os');
  }

  return {
    show() {
      if (!inited) init();
      clearInterval(liveTimer);
      tick();
      liveTimer = setInterval(tick, 1500);
    },
    hide() { clearInterval(liveTimer); }
  };
})());
