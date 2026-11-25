/* Shared helpers for all pages. */
window.U = (function () {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function bytes(n, digits = 1) {
    n = Number(n) || 0;
    if (n <= 0) return '0 B';
    const u = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(u.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    return (n / Math.pow(1024, i)).toFixed(i ? digits : 0) + ' ' + u[i];
  }

  const num = (n) => (Number(n) || 0).toLocaleString();

  function duration(sec) {
    sec = Math.floor(sec);
    const d = Math.floor(sec / 86400), h = Math.floor((sec % 86400) / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    if (d) return `${d}d ${h}h`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
  }

  function date(ms) {
    if (!ms) return '';
    return new Date(ms).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  function icons(root = document) {
    for (const el of root.querySelectorAll('[data-icon]')) {
      if (el.dataset.filled) continue;
      const svg = window.Icons[el.dataset.icon];
      if (svg) { el.innerHTML = svg; el.dataset.filled = '1'; }
    }
  }

  function toast(msg, type = 'ok', ms = 3600) {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toasts').appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, ms);
    setTimeout(() => el.remove(), ms + 400);
  }

  async function safe(fn, errMsg) {
    try { return await fn(); } catch (e) {
      console.error(e);
      toast((errMsg ? errMsg + ': ' : '') + (e.message || e).toString().replace(/^Error invoking remote method '[^']+': (Error: )?/, ''), 'err', 6000);
      return null;
    }
  }

  function seg(el, value, onChange) {
    const set = (v) => { for (const b of el.querySelectorAll('button')) b.classList.toggle('on', b.dataset.v === v); };
    if (value !== undefined) set(value);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      set(b.dataset.v);
      onChange && onChange(b.dataset.v);
    });
    return { set, get: () => el.querySelector('button.on')?.dataset.v };
  }

  function label(key) {
    // camelCase / snake_case -> "Title case"
    return String(key)
      .replace(/_/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/\b(Id|Uuid|Os|Cpu|Gpu|Bios|Mac|Ip|Ipv4|Ipv6|Usb|Vram|Dhcp|Dns|Ssid|Mtu|Tpm|Vbs|Ubr|Sku|Fs)\b/gi, (m) => m.toUpperCase())
      .replace(/^./, (c) => c.toUpperCase());
  }

  const pages = {};
  function page(name, mod) { pages[name] = mod; }

  return { $, $$, esc, bytes, num, duration, date, icons, toast, safe, seg, label, pages, page };
})();
