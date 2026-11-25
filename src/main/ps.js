// Helpers to run Windows PowerShell and reg.exe from the main process.
const { execFile, spawn } = require('child_process');

const PS_ARGS = ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command'];
const UTF8 = '[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;$ProgressPreference="SilentlyContinue";';

function runPS(script, { timeout = 60000 } = {}) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', [...PS_ARGS, UTF8 + script], {
      windowsHide: true,
      timeout,
      maxBuffer: 64 * 1024 * 1024,
      encoding: 'utf8'
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

async function runPSJson(script, opts) {
  const out = (await runPS(script, opts)).trim();
  if (!out) return null;
  return JSON.parse(out);
}

function spawnPS(script) {
  return spawn('powershell.exe', [...PS_ARGS, UTF8 + script], { windowsHide: true });
}

function reg(args) {
  return new Promise((resolve, reject) => {
    execFile('reg.exe', args, { windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (err) return reject(new Error((stderr || err.message).trim()));
      resolve(stdout);
    });
  });
}

async function regQuery(key, value) {
  try {
    const out = await reg(['query', key, '/v', value]);
    const line = out.split(/\r?\n/).find((l) => l.trim().startsWith(value));
    if (!line) return null;
    const parts = line.trim().split(/\s{2,}|\t+/);
    const type = parts[1];
    const data = parts.slice(2).join(' ');
    if (type === 'REG_DWORD') return parseInt(data, 16);
    return data;
  } catch {
    return null;
  }
}

function regSetDword(key, value, data) {
  return reg(['add', key, '/v', value, '/t', 'REG_DWORD', '/d', String(data >>> 0), '/f']);
}

function regSetString(key, value, data) {
  return reg(['add', key, '/v', value, '/t', 'REG_SZ', '/d', String(data), '/f']);
}

function regSetBinary(key, value, hex) {
  return reg(['add', key, '/v', value, '/t', 'REG_BINARY', '/d', hex, '/f']);
}

// Escape a string for use inside a single-quoted PowerShell literal.
const psq = (s) => String(s).replace(/'/g, "''");

module.exports = { runPS, runPSJson, spawnPS, reg, regQuery, regSetDword, regSetString, regSetBinary, psq };
