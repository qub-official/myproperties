// Folder tree scanner running in a worker thread.
// Keeps the full tree in compact parallel arrays and answers queries
// (children, search, largest files, file types, exports) on demand.
const { parentPort, workerData } = require('worker_threads');

// Cooperative cancellation: the main thread flips this shared flag instead of
// terminating the worker (terminating during a native call would abort the app).
const cancelFlag = workerData && workerData.cancelBuf ? new Int32Array(workerData.cancelBuf) : new Int32Array(1);
const CANCELLED = Symbol('cancelled');
const checkCancel = () => { if (Atomics.load(cancelFlag, 0)) throw CANCELLED; };
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ---- tree storage ---------------------------------------------------------
let name = [], parent = [], size = [], isDir = [], files = [], dirs = [], mtime = [], err = [], kids = [];
let virtualRoot = false;
let includeFiles = true;
let meta = {};

function reset() {
  name = []; parent = []; size = []; isDir = []; files = []; dirs = []; mtime = []; err = []; kids = [];
  virtualRoot = false;
}

function add(n, p, dir, s = 0, m = 0) {
  const id = name.length;
  name.push(n); parent.push(p); size.push(s); isDir.push(dir ? 1 : 0);
  files.push(0); dirs.push(0); mtime.push(m); err.push(0); kids.push(dir ? [] : null);
  if (p >= 0) kids[p].push(id);
  return id;
}

function pathOf(id) {
  const parts = [];
  let cur = id;
  while (cur >= 0) {
    parts.push(name[cur]);
    cur = parent[cur];
  }
  parts.reverse();
  if (virtualRoot) parts.shift();
  if (!parts.length) return name[0];
  return parts.length === 1 ? parts[0] : path.join(...parts);
}

// ---- progress -------------------------------------------------------------
let stats = { files: 0, dirs: 0, bytes: 0, errors: 0, links: 0 };
let lastPost = 0;
function progress(current, force) {
  const now = Date.now();
  if (!force && now - lastPost < 150) return;
  lastPost = now;
  parentPort.postMessage({ type: 'progress', ...stats, current });
}

// ---- fast Windows scan (FindFirstFileExW) ------------------------------------
// Reads name, size, date and attributes straight from the directory listing,
// without opening each file. ~30x faster than fs.stat on every file.
let win = null;
try {
  if (process.platform === 'win32') {
    const koffi = require('koffi');
    const k32 = koffi.load('kernel32.dll');
    const FILETIME = koffi.struct('MP_FILETIME', { lo: 'uint32', hi: 'uint32' });
    const FIND_DATA = koffi.struct('MP_WIN32_FIND_DATAW', {
      attr: 'uint32', created: FILETIME, accessed: FILETIME, written: FILETIME,
      sizeHi: 'uint32', sizeLo: 'uint32', reserved0: 'uint32', reserved1: 'uint32',
      name: koffi.array('char16_t', 260, 'String'), alt: koffi.array('char16_t', 14, 'String')
    });
    win = {
      first: k32.func('intptr_t __stdcall FindFirstFileExW(const char16_t *pattern, int level, _Out_ MP_WIN32_FIND_DATAW *data, int op, void *filter, uint32_t flags)'),
      next: k32.func('bool __stdcall FindNextFileW(intptr_t h, _Out_ MP_WIN32_FIND_DATAW *data)'),
      close: k32.func('bool __stdcall FindClose(intptr_t h)')
    };
  }
} catch (e) {
  win = null; // fall back to fs
  parentPort.postMessage({ type: 'info', message: 'fast scanner unavailable: ' + e.message });
}

const ATTR_DIR = 0x10;
const ATTR_REPARSE = 0x400;
const TAG_MOUNT_POINT = 0xA0000003;
const TAG_SYMLINK = 0xA000000C;
const FIND_EX_INFO_BASIC = 1;
const FIND_FIRST_EX_LARGE_FETCH = 2;
const INVALID_HANDLE = -1;

function longPath(p) {
  if (p.startsWith('\\\\?\\')) return p;
  if (p.startsWith('\\\\')) return '\\\\?\\UNC\\' + p.slice(2);
  return '\\\\?\\' + p;
}

const fileTimeMs = (ft) => (ft.hi * 4294967296 + ft.lo) / 10000 - 11644473600000;

function scanDirWin(dirPath, id) {
  checkCancel();
  const fd = {};
  const base = dirPath.endsWith('\\') ? dirPath : dirPath + '\\';
  const h = win.first(longPath(base) + '*', FIND_EX_INFO_BASIC, fd, 0, null, FIND_FIRST_EX_LARGE_FETCH);
  if (h === INVALID_HANDLE || h === 0) {
    err[id] = 1;
    stats.errors++;
    return;
  }
  if (++tick % 64 === 0) progress(dirPath);
  const subdirs = [];
  let count = 0;
  try {
    do {
      // stay responsive inside huge folders (cancel + progress)
      if ((++count & 255) === 0) { checkCancel(); progress(dirPath); }
      const n = fd.name;
      if (n === '.' || n === '..') continue;
      const attr = fd.attr;
      if (attr & ATTR_REPARSE) {
        const tag = fd.reserved0 >>> 0;
        if (tag === TAG_MOUNT_POINT || tag === TAG_SYMLINK) { stats.links++; continue; }
      }
      if (attr & ATTR_DIR) {
        const cid = add(n, id, true, 0, fileTimeMs(fd.written));
        subdirs.push(cid);
      } else {
        const s = fd.sizeHi * 4294967296 + fd.sizeLo;
        if (includeFiles) add(n, id, false, s, fileTimeMs(fd.written));
        size[id] += s;
        files[id] += 1;
        stats.files++;
        stats.bytes += s;
      }
    } while (win.next(h, fd));
  } finally {
    win.close(h);
  }
  for (const cid of subdirs) {
    scanDirWin(base + name[cid], cid);
    size[id] += size[cid];
    files[id] += files[cid];
    dirs[id] += dirs[cid] + 1;
    stats.dirs++;
  }
}

// ---- portable filesystem scan (fallback) -------------------------------------
let tick = 0;
function scanDir(dirPath, id) {
  if (win) return scanDirWin(dirPath, id);
  checkCancel();
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    err[id] = 1;
    stats.errors++;
    return;
  }
  if (++tick % 64 === 0) progress(dirPath);

  for (const ent of entries) {
    const full = path.join(dirPath, ent.name);
    let dir = ent.isDirectory();
    let file = ent.isFile();
    let st = null;

    if (ent.isSymbolicLink()) {
      // Reparse points: real symlinks/junctions are skipped (avoid loops and double counting),
      // but cloud placeholders (OneDrive etc.) are treated as normal files/folders.
      try { st = fs.lstatSync(full); } catch { stats.errors++; continue; }
      if (st.isSymbolicLink()) { stats.links++; continue; }
      dir = st.isDirectory();
      file = !dir;
    }

    if (dir) {
      const cid = add(ent.name, id, true);
      try { mtime[cid] = (st || fs.lstatSync(full)).mtimeMs; } catch {}
      scanDir(full, cid);
      size[id] += size[cid];
      files[id] += files[cid];
      dirs[id] += dirs[cid] + 1;
      stats.dirs++;
    } else if (file) {
      let s = 0, m = 0;
      try {
        st = st || fs.lstatSync(full);
        s = st.size; m = st.mtimeMs;
      } catch {
        stats.errors++;
      }
      if (includeFiles) add(ent.name, id, false, s, m);
      size[id] += s;
      files[id] += 1;
      stats.files++;
      stats.bytes += s;
    }
  }
}

// ---- portable device scan (MTP via Shell COM) --------------------------------
function scanDevice(deviceName, rootId) {
  return new Promise((resolve) => {
    const q = deviceName.replace(/'/g, "''");
    const script = `[Console]::OutputEncoding=[System.Text.Encoding]::UTF8
$sh = New-Object -ComObject Shell.Application
$dev = $null
foreach ($i in $sh.Namespace(17).Items()) { if ($i.Name -eq '${q}') { $dev = $i } }
if (-not $dev) { exit 2 }
function Walk($folder, [int]$depth) {
  foreach ($it in $folder.Items()) {
    if ($it.IsFolder) {
      [Console]::Out.WriteLine("D\`t$depth\`t0\`t" + $it.Name)
      try { $sub = $it.GetFolder; if ($sub) { Walk $sub ($depth + 1) } } catch {}
    } else {
      $s = 0
      try { $s = [int64]$it.ExtendedProperty('System.Size') } catch {}
      if (-not $s) { try { $s = [int64]$it.Size } catch {} }
      [Console]::Out.WriteLine("F\`t$depth\`t$s\`t" + $it.Name)
    }
  }
}
Walk $dev.GetFolder 1`;
    const ps = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { windowsHide: true });
    const stack = [rootId]; // stack[depth-1] = parent id at that depth
    let buf = '';
    const watch = setInterval(() => { if (Atomics.load(cancelFlag, 0)) ps.kill(); }, 200);
    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (chunk) => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, idx).replace(/\r$/, '');
        buf = buf.slice(idx + 1);
        const [kind, depthStr, sizeStr, ...rest] = line.split('\t');
        const depth = parseInt(depthStr, 10);
        if (!depth || !kind) continue;
        const n = rest.join('\t');
        stack.length = depth;
        const p = stack[depth - 1];
        if (p === undefined) continue;
        if (kind === 'D') {
          stack[depth] = add(n, p, true);
          stats.dirs++;
        } else {
          const s = Number(sizeStr) || 0;
          if (includeFiles) add(n, p, false, s, 0);
          stats.files++;
          stats.bytes += s;
          // tally file directly on ancestors later via aggregate()
          pendingSizes.push([p, s]);
        }
        progress(n);
      }
    });
    ps.on('close', (code) => {
      clearInterval(watch);
      if (code === 2) stats.errors++;
      resolve();
    });
  });
}

let pendingSizes = [];
function aggregateDevice(rootId) {
  // add file sizes/counts to their direct parents, then bubble up folders (children have higher ids).
  for (const [p, s] of pendingSizes) { size[p] += s; files[p] += 1; }
  pendingSizes = [];
  for (let id = name.length - 1; id > rootId; id--) {
    if (!isDir[id]) continue;
    const p = parent[id];
    if (p < 0) continue;
    size[p] += size[id];
    files[p] += files[id];
    dirs[p] += dirs[id] + 1;
  }
}

// ---- scan orchestration -----------------------------------------------------
async function scan(msg) {
  reset();
  stats = { files: 0, dirs: 0, bytes: 0, errors: 0, links: 0 };
  includeFiles = msg.includeFiles !== false;
  const started = Date.now();
  const src = msg.source;
  meta = { source: src, label: src.label, started, includeFiles };

  if (src.kind === 'computer' || (src.paths && src.paths.length > 1)) {
    virtualRoot = true;
    const root = add(src.label || 'This PC', -1, true);
    for (const p of src.paths) {
      const cid = add(p, root, true);
      progress(p, true);
      scanDir(p, cid);
      size[root] += size[cid]; files[root] += files[cid]; dirs[root] += dirs[cid] + 1;
    }
  } else if (src.kind === 'device') {
    virtualRoot = true;
    const root = add(src.label, -1, true);
    // keep the device name as a visible top-level folder
    const dev = add(src.label, root, true);
    await scanDevice(src.label, dev);
    checkCancel();
    aggregateDevice(dev);
    size[root] = size[dev]; files[root] = files[dev]; dirs[root] = dirs[dev] + 1;
  } else {
    const p = src.paths[0];
    const root = add(p, -1, true);
    try { mtime[root] = fs.statSync(p).mtimeMs; } catch {}
    scanDir(p, root);
  }

  meta.finished = Date.now();
  meta.ms = meta.finished - started;
  progress('', true);
  parentPort.postMessage({
    type: 'done',
    summary: {
      ...stats,
      ms: meta.ms,
      rootId: 0,
      rootName: name[0],
      rootSize: size[0],
      rootFiles: files[0],
      rootDirs: dirs[0],
      nodes: name.length,
      includeFiles,
      virtualRoot
    }
  });
}

// ---- queries ---------------------------------------------------------------
function nodeInfo(id, parentSize) {
  return {
    id,
    name: name[id],
    dir: !!isDir[id],
    size: size[id],
    files: files[id],
    dirs: dirs[id],
    mtime: mtime[id],
    err: !!err[id],
    hasKids: !!(kids[id] && kids[id].length),
    pct: parentSize > 0 ? size[id] / parentSize : 0
  };
}

function sorter(sort) {
  switch (sort) {
    case 'name': return (a, b) => (isDir[b] - isDir[a]) || name[a].localeCompare(name[b], undefined, { numeric: true, sensitivity: 'base' });
    case 'mtime': return (a, b) => mtime[b] - mtime[a];
    case 'files': return (a, b) => files[b] - files[a] || size[b] - size[a];
    default: return (a, b) => size[b] - size[a];
  }
}

function children({ id, sort = 'size', offset = 0, limit = 400 }) {
  const list = (kids[id] || []).slice().sort(sorter(sort));
  return {
    total: list.length,
    items: list.slice(offset, offset + limit).map((c) => nodeInfo(c, size[id]))
  };
}

function search({ q, limit = 500 }) {
  const needle = String(q || '').toLowerCase().trim();
  if (!needle) return [];
  const out = [];
  for (let i = 1; i < name.length && out.length < limit; i++) {
    if (name[i].toLowerCase().includes(needle)) out.push({ ...nodeInfo(i, 0), path: pathOf(i) });
  }
  return out.sort((a, b) => b.size - a.size);
}

function largest({ limit = 200, dirsToo = false }) {
  // keep a sorted top-N list without sorting everything
  const top = [];
  let min = -1;
  for (let i = 1; i < name.length; i++) {
    if (isDir[i] && !dirsToo) continue;
    if (top.length >= limit && size[i] <= min) continue;
    top.push(i);
    if (top.length > limit * 2) {
      top.sort((a, b) => size[b] - size[a]);
      top.length = limit;
      min = size[top[top.length - 1]];
    }
  }
  top.sort((a, b) => size[b] - size[a]);
  return top.slice(0, limit).map((i) => ({ ...nodeInfo(i, size[0]), path: pathOf(i) }));
}

function fileTypes() {
  const map = new Map();
  for (let i = 1; i < name.length; i++) {
    if (isDir[i]) continue;
    const dot = name[i].lastIndexOf('.');
    const ext = dot > 0 && dot > name[i].length - 12 ? name[i].slice(dot + 1).toLowerCase() : '(none)';
    const e = map.get(ext) || { ext, size: 0, count: 0 };
    e.size += size[i];
    e.count++;
    map.set(ext, e);
  }
  return [...map.values()].sort((a, b) => b.size - a.size).slice(0, 60);
}

// ---- exports ---------------------------------------------------------------
function human(bytes) {
  if (!bytes) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(u.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return (bytes / Math.pow(1024, i)).toFixed(i ? 1 : 0) + ' ' + u[i];
}

class Writer {
  constructor(file) { this.fd = fs.openSync(file, 'w'); this.buf = []; this.len = 0; }
  w(s) { this.buf.push(s); this.len += s.length; if (this.len > 1 << 20) this.flush(); }
  flush() { if (this.buf.length) fs.writeSync(this.fd, this.buf.join('')); this.buf = []; this.len = 0; }
  close() { this.flush(); fs.closeSync(this.fd); }
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const csv = (s) => '"' + String(s).replace(/"/g, '""') + '"';
const date = (ms) => (ms ? new Date(ms).toISOString().replace('T', ' ').slice(0, 19) : '');

function exportTree({ format, file, maxDepth = 0, includeFiles: withFiles = true, rootId = 0 }) {
  const limitDepth = maxDepth > 0 ? maxDepth : Infinity;
  const bySize = sorter('size');
  const kidsOf = (id) => (kids[id] || []).filter((k) => withFiles || isDir[k]).sort(bySize);
  const out = new Writer(file);
  const title = `MyProperties folder tree: ${pathOf(rootId)}`;
  const header = `Scanned ${new Date(meta.finished || Date.now()).toLocaleString()} · ${human(size[rootId])} · ${files[rootId].toLocaleString()} files · ${dirs[rootId].toLocaleString()} folders`;

  if (format === 'txt') {
    out.w(`${title}\n${header}\n\n${name[rootId]}  [${human(size[rootId])}]\n`);
    const walk = (id, prefix, depth) => {
      if (depth > limitDepth) return;
      const list = kidsOf(id);
      list.forEach((k, i) => {
        const last = i === list.length - 1;
        const label = isDir[k]
          ? `${name[k]}\\  [${human(size[k])} · ${files[k].toLocaleString()} files]`
          : `${name[k]}  [${human(size[k])}]`;
        out.w(`${prefix}${last ? '└── ' : '├── '}${label}\n`);
        if (isDir[k]) walk(k, prefix + (last ? '    ' : '│   '), depth + 1);
      });
    };
    walk(rootId, '', 1);
  } else if (format === 'csv') {
    out.w('﻿Path,Type,Size (bytes),Size,Files,Folders,Depth,Modified\n');
    const walk = (id, p, depth) => {
      out.w([csv(p), isDir[id] ? 'folder' : 'file', size[id], csv(human(size[id])), files[id], dirs[id], depth, date(mtime[id])].join(',') + '\n');
      if (depth >= limitDepth) return;
      for (const k of kidsOf(id)) walk(k, p ? path.join(p, name[k]) : name[k], depth + 1);
    };
    walk(rootId, pathOf(rootId), 0);
  } else if (format === 'json') {
    const walk = (id, depth) => {
      out.w(`{"name":${JSON.stringify(name[id])},"type":"${isDir[id] ? 'folder' : 'file'}","size":${size[id]}`);
      if (isDir[id]) out.w(`,"files":${files[id]},"folders":${dirs[id]}`);
      if (mtime[id]) out.w(`,"modified":"${new Date(mtime[id]).toISOString()}"`);
      if (isDir[id] && depth < limitDepth) {
        out.w(',"children":[');
        kidsOf(id).forEach((k, i) => { if (i) out.w(','); walk(k, depth + 1); });
        out.w(']');
      }
      out.w('}');
    };
    out.w(`{"generator":"MyProperties","path":${JSON.stringify(pathOf(rootId))},"scanned":"${new Date(meta.finished || Date.now()).toISOString()}","tree":`);
    walk(rootId, 0);
    out.w('}\n');
  } else if (format === 'html') {
    out.w(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>
:root{--bg:#F5F4F2;--card:#fff;--ink:#0C0F14;--muted:#2E2F33;--line:#E9E4E0;--gold:#A87C3A;--mauve:#B08A8A;--butter:#FDEBB0}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.5 "Pretendard","Segoe UI",system-ui,sans-serif}
main{max-width:1100px;margin:0 auto;padding:40px 24px}h1{font-size:22px;margin:0 0 4px}p.sub{color:var(--muted);margin:0 0 24px}
.tree{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:16px 20px}
details{margin-left:18px}details>summary{cursor:pointer;list-style:none;padding:3px 0}summary::-webkit-details-marker{display:none}
summary:before{content:"▸";display:inline-block;width:14px;color:var(--gold);transition:.15s}details[open]>summary:before{transform:rotate(90deg)}
.f{margin-left:32px;padding:2px 0;color:var(--muted)}.s{float:right;font-variant-numeric:tabular-nums;color:var(--muted)}
.b{display:inline-block;height:6px;border-radius:6px;background:var(--butter);margin-left:8px;vertical-align:middle}
.tree>details{margin-left:0}footer{color:var(--muted);font-size:12px;margin-top:20px}
</style></head><body><main><h1>${esc(title)}</h1><p class="sub">${esc(header)}</p><div class="tree">`);
    const walk = (id, depth) => {
      const pct = size[parent[id]] > 0 ? Math.max(2, Math.round((size[id] / size[parent[id]]) * 80)) : 0;
      if (isDir[id]) {
        const sub = depth < limitDepth ? kidsOf(id) : [];
        out.w(`<details${depth < 1 ? ' open' : ''}><summary>📁 ${esc(name[id])}<span class="b" style="width:${pct}px"></span><span class="s">${human(size[id])} · ${files[id].toLocaleString()} files</span></summary>`);
        for (const k of sub) walk(k, depth + 1);
        out.w('</details>');
      } else {
        out.w(`<div class="f">📄 ${esc(name[id])}<span class="s">${human(size[id])}</span></div>`);
      }
    };
    walk(rootId, 0);
    out.w(`</div><footer>Generated by MyProperties</footer></main></body></html>`);
  }
  out.close();
  return { ok: true, file };
}

// ---- message loop ------------------------------------------------------------
parentPort.on('message', async (msg) => {
  try {
    if (msg.type === 'dispose') { parentPort.close(); process.exit(0); }
    if (msg.type === 'scan') {
      try {
        await scan(msg);
      } catch (e) {
        if (e !== CANCELLED) throw e;
        reset();
        parentPort.postMessage({ type: 'cancelled' });
      }
      return;
    }
    let result;
    switch (msg.type) {
      case 'children': result = children(msg); break;
      case 'search': result = search(msg); break;
      case 'largest': result = largest(msg); break;
      case 'types': result = fileTypes(); break;
      case 'path': result = pathOf(msg.id); break;
      case 'export': result = exportTree(msg); break;
      default: throw new Error('Unknown request ' + msg.type);
    }
    parentPort.postMessage({ type: 'reply', reqId: msg.reqId, result });
  } catch (e) {
    parentPort.postMessage({ type: msg.reqId ? 'reply' : 'error', reqId: msg.reqId, error: e.message });
  }
});
