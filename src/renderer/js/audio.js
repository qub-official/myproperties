U.page('audio', (function () {
  const { $, $$, esc, bytes } = U;
  let inited = false;
  let jobs = [];
  let seq = 0;
  let format = 'mp3';
  let outDir = '';
  const VIDEO_EXT = ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'm4v', 'mpg', 'mpeg', 'ts', 'mts', 'm2ts', '3gp', 'ogv', 'vob', 'f4v', 'asf', 'divx'];
  const AUDIO_EXT = ['mp3', 'm4a', 'wav', 'flac', 'aac', 'ogg', 'opus', 'wma'];

  function addFiles(paths) {
    let added = 0;
    for (const p of paths) {
      const ext = p.split('.').pop().toLowerCase();
      if (!VIDEO_EXT.includes(ext) && !AUDIO_EXT.includes(ext)) continue;
      if (jobs.some((j) => j.file === p && j.status === 'ready')) continue;
      jobs.push({ id: 'j' + ++seq, file: p, name: p.split(/[\\/]/).pop(), status: 'ready', pct: 0 });
      added++;
    }
    if (!added && paths.length) U.toast('Those files don\'t look like videos', 'err');
    render();
  }

  function statusText(j) {
    switch (j.status) {
      case 'ready': return 'Ready';
      case 'queued': return 'Waiting…';
      case 'running': return `Converting… ${j.pct.toFixed(0)}%`;
      case 'done': return `Done · ${bytes(j.outSize)} · ${(j.ms / 1000).toFixed(1)}s`;
      case 'error': return `Failed · ${j.error || 'unknown error'}`;
      case 'cancelled': return 'Cancelled';
      default: return j.status;
    }
  }

  function render() {
    const wrap = $('#au-jobs');
    if (!jobs.length) {
      wrap.innerHTML = `<div class="empty">${Icons.mascot('sleepy')}<div>Nothing in the queue yet.</div></div>`;
    } else {
      wrap.innerHTML = jobs.map((j) => `
        <div class="job" data-id="${j.id}">
          <div class="ic">${j.status === 'done' ? Icons.music : Icons.video}</div>
          <div style="min-width:0">
            <div class="nm" title="${esc(j.file)}">${esc(j.name)}</div>
            <div class="st">${esc(statusText(j))}</div>
            ${j.status === 'running' || j.status === 'queued' ? `<div class="bar"><i style="width:${j.pct}%"></i></div>` : ''}
          </div>
          <div class="row">
            ${j.status === 'done' ? `<button class="btn sm" data-act="play">Play</button><button class="btn sm ghost" data-act="reveal">${Icons.reveal}</button>` : ''}
            ${j.status === 'running' || j.status === 'queued' ? `<button class="btn sm ghost" data-act="cancel">${Icons.x}</button>` : ''}
            ${j.status === 'ready' || j.status === 'error' || j.status === 'cancelled' ? `<button class="btn sm ghost" data-act="remove">${Icons.x}</button>` : ''}
          </div>
        </div>`).join('');
    }
    const ready = jobs.filter((j) => j.status === 'ready' || j.status === 'error' || j.status === 'cancelled').length;
    const done = jobs.filter((j) => j.status === 'done').length;
    $('#au-sum').textContent = jobs.length ? `${jobs.length} file(s) · ${done} done · ${ready} to convert` : 'No files yet';
    $('#au-start').disabled = !ready;
  }

  function options() {
    return {
      format,
      bitrate: +$('#au-br').value,
      sampleRate: +$('#au-sr').value,
      channels: +$('#au-ch').value,
      start: $('#au-start-t').value.trim(),
      end: $('#au-end-t').value.trim(),
      volume: +$('#au-vol').value,
      normalize: $('#au-norm').checked,
      outDir
    };
  }

  function setFormat(f) {
    format = f;
    $$('#au-formats button').forEach((b) => b.classList.toggle('on', b.dataset.fmt === f));
    $('#au-br-wrap').classList.toggle('hidden', f === 'wav' || f === 'flac');
  }

  async function start() {
    const todo = jobs.filter((j) => j.status === 'ready' || j.status === 'error' || j.status === 'cancelled');
    if (!todo.length) return;
    const t = /^(\d+:)?\d{1,2}:\d{2}(\.\d+)?$|^\d+(\.\d+)?$/;
    const o = options();
    if ((o.start && !t.test(o.start)) || (o.end && !t.test(o.end))) return U.toast('Use a time like 00:01:30 or 90 for start/end', 'err');
    todo.forEach((j) => { j.status = 'queued'; j.pct = 0; j.error = ''; });
    render();
    await U.safe(() => window.api.conv.start(todo.map((j) => ({ id: j.id, file: j.file })), o), 'Could not start conversion');
  }

  function onProgress(p) {
    const j = jobs.find((x) => x.id === p.id);
    if (!j) return;
    Object.assign(j, p);
    if (p.status === 'done') U.toast(`${j.name} → ${p.out.split('\\').pop()}`);
    render();
  }

  function init() {
    inited = true;
    const drop = $('#au-drop');
    drop.querySelector('[data-icon]').innerHTML = `<svg class="big" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="14" height="14" rx="2.5"/><path d="m16.5 10 5-3v10l-5-3"/></svg>`;
    drop.addEventListener('click', async () => {
      const files = await window.api.dialog.files([{ name: 'Videos', extensions: VIDEO_EXT }, { name: 'Audio', extensions: AUDIO_EXT }, { name: 'All files', extensions: ['*'] }]);
      addFiles(files);
    });
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => {
      e.preventDefault();
      drop.classList.remove('over');
      addFiles([...e.dataTransfer.files].map((f) => window.api.fs.pathForFile(f)).filter(Boolean));
    });
    // allow dropping anywhere on the page
    $('[data-page="audio"]').addEventListener('dragover', (e) => e.preventDefault());
    $('[data-page="audio"]').addEventListener('drop', (e) => {
      if (e.target.closest('#au-drop')) return;
      e.preventDefault();
      addFiles([...e.dataTransfer.files].map((f) => window.api.fs.pathForFile(f)).filter(Boolean));
    });

    $('#au-formats').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) setFormat(b.dataset.fmt); });
    $('#au-vol').addEventListener('input', () => { $('#au-vol-v').textContent = $('#au-vol').value + '%'; });
    $('#au-start').addEventListener('click', start);
    $('#au-cancel').addEventListener('click', () => {
      window.api.conv.cancel();
      jobs.forEach((j) => { if (j.status === 'queued') j.status = 'cancelled'; });
      render();
    });
    $('#au-clear').addEventListener('click', () => { jobs = jobs.filter((j) => j.status !== 'done'); render(); });
    $('#au-out-pick').addEventListener('click', async () => {
      const d = await window.api.dialog.folder();
      if (d) { outDir = d; $('#au-out').value = d; }
    });
    $('#au-out-reset').addEventListener('click', () => { outDir = ''; $('#au-out').value = ''; });
    $('#au-jobs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const j = jobs.find((x) => x.id === b.closest('.job').dataset.id);
      if (!j) return;
      if (b.dataset.act === 'play') window.api.shell.open(j.out);
      if (b.dataset.act === 'reveal') window.api.shell.reveal(j.out);
      if (b.dataset.act === 'cancel') { window.api.conv.cancel(j.id); j.status = 'cancelled'; render(); }
      if (b.dataset.act === 'remove') { jobs = jobs.filter((x) => x !== j); render(); }
    });
    window.api.conv.onProgress(onProgress);

    window.api.settings.get().then((s) => {
      const c = s.converter || {};
      setFormat(c.format || 'mp3');
      if (c.bitrate) $('#au-br').value = String(c.bitrate);
      if (c.sampleRate !== undefined) $('#au-sr').value = String(c.sampleRate);
      if (c.channels !== undefined) $('#au-ch').value = String(c.channels);
      $('#au-norm').checked = !!c.normalize;
      if (c.outDir) { outDir = c.outDir; $('#au-out').value = c.outDir; }
    });
    render();
  }

  return { show() { if (!inited) init(); } };
})());
