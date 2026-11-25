// Video -> audio conversion queue powered by a bundled ffmpeg binary.
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

function ffmpegPath() {
  let p = require('ffmpeg-static');
  // When packaged, the binary lives outside the asar archive.
  return p.replace('app.asar' + path.sep, 'app.asar.unpacked' + path.sep);
}

const FORMATS = {
  mp3: { ext: 'mp3', codec: ['-c:a', 'libmp3lame'], bitrate: true },
  m4a: { ext: 'm4a', codec: ['-c:a', 'aac'], bitrate: true },
  wav: { ext: 'wav', codec: ['-c:a', 'pcm_s16le'], bitrate: false },
  flac: { ext: 'flac', codec: ['-c:a', 'flac'], bitrate: false },
  ogg: { ext: 'ogg', codec: ['-c:a', 'libvorbis'], bitrate: true },
  opus: { ext: 'opus', codec: ['-c:a', 'libopus'], bitrate: true }
};

const timeToSec = (t) => {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(t || '');
  return m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0;
};

function uniqueName(dir, base, ext) {
  let candidate = path.join(dir, `${base}.${ext}`);
  let i = 1;
  while (fs.existsSync(candidate)) candidate = path.join(dir, `${base} (${i++}).${ext}`);
  return candidate;
}

class Converter {
  constructor(send) {
    this.send = send;
    this.queue = [];
    this.proc = null;
    this.cancelled = false;
  }

  start(jobs, opts) {
    for (const j of jobs) this.queue.push({ ...j, opts });
    if (!this.proc) this.next();
    return { ok: true, queued: this.queue.length };
  }

  cancel(id) {
    if (id) {
      this.queue = this.queue.filter((j) => j.id !== id);
      if (this.current?.id === id && this.proc) { this.cancelled = true; this.proc.kill(); }
    } else {
      this.queue = [];
      if (this.proc) { this.cancelled = true; this.proc.kill(); }
    }
    return { ok: true };
  }

  next() {
    const job = this.queue.shift();
    if (!job) { this.current = null; this.send('conv:idle'); return; }
    this.current = job;
    this.cancelled = false;
    const o = job.opts;
    const fmt = FORMATS[o.format] || FORMATS.mp3;
    const outDir = o.outDir || path.dirname(job.file);
    const base = path.basename(job.file, path.extname(job.file));
    const out = uniqueName(outDir, base, fmt.ext);

    const args = ['-hide_banner', '-y'];
    if (o.start) args.push('-ss', String(o.start));
    args.push('-i', job.file);
    if (o.end) args.push('-to', String(o.end));
    args.push('-vn', '-map', '0:a:0?', '-map_metadata', '0', ...fmt.codec);
    if (fmt.bitrate) args.push('-b:a', `${o.bitrate || 192}k`);
    if (o.sampleRate) args.push('-ar', String(o.sampleRate));
    if (o.channels) args.push('-ac', String(o.channels));
    const filters = [];
    if (o.normalize) filters.push('loudnorm=I=-16:TP=-1.5:LRA=11');
    if (o.volume && Number(o.volume) !== 100) filters.push(`volume=${Number(o.volume) / 100}`);
    if (filters.length) args.push('-af', filters.join(','));
    args.push(out);

    let duration = 0;
    let stderr = '';
    const t0 = Date.now();
    this.send('conv:progress', { id: job.id, status: 'running', pct: 0, out });

    const proc = spawn(ffmpegPath(), args, { windowsHide: true });
    this.proc = proc;
    proc.stderr.setEncoding('utf8');
    proc.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-8000);
      if (!duration) {
        const d = /Duration:\s*(\d+:\d+:\d+(?:\.\d+)?)/.exec(stderr);
        if (d) {
          duration = timeToSec(d[1]);
          const startS = Number(o.start) || 0;
          const endS = Number(o.end) || 0;
          if (endS) duration = Math.max(0.1, endS - startS);
          else if (startS) duration = Math.max(0.1, duration - startS);
        }
      }
      const matches = chunk.match(/time=(\d+:\d+:\d+(?:\.\d+)?)/g);
      if (matches && duration) {
        const t = timeToSec(matches[matches.length - 1].slice(5));
        this.send('conv:progress', { id: job.id, status: 'running', pct: Math.min(99, (t / duration) * 100), out });
      }
    });
    proc.on('error', (e) => {
      this.send('conv:progress', { id: job.id, status: 'error', error: e.message });
    });
    proc.on('close', (code) => {
      this.proc = null;
      if (this.cancelled) {
        try { fs.unlinkSync(out); } catch {}
        this.send('conv:progress', { id: job.id, status: 'cancelled' });
      } else if (code === 0) {
        let outSize = 0;
        try { outSize = fs.statSync(out).size; } catch {}
        this.send('conv:progress', { id: job.id, status: 'done', pct: 100, out, outSize, ms: Date.now() - t0 });
      } else {
        const lines = stderr.trim().split(/\r?\n/);
        const msg = /does not contain any stream|Output file #0 does not contain/i.test(stderr)
          ? 'This file has no audio track.'
          : lines.slice(-2).join(' ');
        try { fs.unlinkSync(out); } catch {}
        this.send('conv:progress', { id: job.id, status: 'error', error: msg });
      }
      this.next();
    });
  }
}

module.exports = { Converter, FORMATS };
