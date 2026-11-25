/* Animated canvas scenes used for live wallpapers and in-app previews.
   window.Scenes.start(canvas, id) -> { stop(), pause(bool) } */
(function () {
  const P = {
    white: '#FFFFFF', cream: '#F5F4F2', sand: '#E9E4E0', nude: '#EEE5E0',
    ink: '#0C0F14', gray: '#2E2F33', gold: '#A87C3A', mauve: '#B08A8A',
    butter: '#FDEBB0', taupe: '#B49A85'
  };
  const rand = (a, b) => a + Math.random() * (b - a);
  const TAU = Math.PI * 2;

  function rgba(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  }

  const scenes = {
    clouds: {
      name: 'Cloud Drift', kr: '구름', dark: false,
      init(w, h) {
        const s = Math.min(w, h) / 900;
        return {
          clouds: Array.from({ length: 9 }, () => ({ x: rand(-0.2, 1.1) * w, y: rand(0.08, 0.8) * h, r: rand(40, 90) * s, v: rand(6, 16) * s, a: rand(0.55, 0.95) })),
          sparks: Array.from({ length: 26 }, () => ({ x: rand(0, w), y: rand(0, h), p: rand(0, TAU), r: rand(1.5, 3.5) * s }))
        };
      },
      draw(ctx, st, w, h, t, dt) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, P.cream); g.addColorStop(1, P.sand);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        for (const c of st.clouds) {
          c.x += c.v * dt;
          if (c.x - c.r * 3 > w) c.x = -c.r * 3;
          ctx.fillStyle = rgba(P.white, c.a);
          ctx.beginPath();
          ctx.arc(c.x, c.y, c.r, 0, TAU);
          ctx.arc(c.x + c.r * 0.9, c.y + c.r * 0.15, c.r * 0.75, 0, TAU);
          ctx.arc(c.x - c.r * 0.9, c.y + c.r * 0.2, c.r * 0.65, 0, TAU);
          ctx.arc(c.x + c.r * 0.3, c.y - c.r * 0.45, c.r * 0.7, 0, TAU);
          ctx.fill();
        }
        for (const s of st.sparks) {
          const a = (Math.sin(t * 1.4 + s.p) + 1) / 2;
          ctx.fillStyle = rgba(P.gold, 0.15 + a * 0.55);
          star(ctx, s.x, s.y, s.r * (0.6 + a * 0.8));
        }
      }
    },

    waves: {
      name: 'Golden Waves', kr: '물결', dark: false,
      init() { return {}; },
      draw(ctx, st, w, h, t) {
        ctx.fillStyle = P.cream; ctx.fillRect(0, 0, w, h);
        const layers = [
          [P.butter, 0.85, 0.42, 0.9], [P.nude, 1, 0.55, 0.7],
          [P.taupe, 0.55, 0.66, 0.5], [P.gold, 0.45, 0.78, 0.35], [P.sand, 1, 0.88, 0.25]
        ];
        layers.forEach(([c, a, base, sp], i) => {
          ctx.fillStyle = rgba(c, a);
          ctx.beginPath();
          ctx.moveTo(0, h);
          for (let x = 0; x <= w + 10; x += 10) {
            const y = base * h + Math.sin(x / w * TAU * (1 + i * 0.3) + t * sp) * h * 0.035 + Math.sin(x / w * TAU * 2.3 - t * sp * 0.7) * h * 0.015;
            ctx.lineTo(x, y);
          }
          ctx.lineTo(w, h); ctx.closePath(); ctx.fill();
        });
        ctx.fillStyle = rgba(P.white, 0.9);
        ctx.beginPath(); ctx.arc(w * 0.78, h * 0.22, Math.min(w, h) * 0.07, 0, TAU); ctx.fill();
      }
    },

    stars: {
      name: 'Ink Night', kr: '밤하늘', dark: true,
      init(w, h) {
        return {
          stars: Array.from({ length: Math.max(90, Math.round((w * h) / 9000)) }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(0.4, 1.6), p: rand(0, TAU), s: rand(0.5, 2), c: Math.random() < 0.15 ? P.butter : P.cream })),
          shoot: null, next: rand(3, 8)
        };
      },
      draw(ctx, st, w, h, t, dt) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, P.ink); g.addColorStop(1, '#1a1d26');
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        for (const s of st.stars) {
          ctx.fillStyle = rgba(s.c, 0.25 + 0.75 * (Math.sin(t * s.s + s.p) + 1) / 2);
          ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
        }
        // moon
        const mr = Math.min(w, h) * 0.06, mx = w * 0.82, my = h * 0.2;
        ctx.fillStyle = P.butter; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
        ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(mx + mr * 0.45, my - mr * 0.25, mr * 0.9, 0, TAU); ctx.fill();
        st.next -= dt;
        if (!st.shoot && st.next <= 0) st.shoot = { x: rand(0.1, 0.7) * w, y: rand(0.05, 0.35) * h, life: 0 };
        if (st.shoot) {
          const s = st.shoot; s.life += dt;
          const len = 140, k = s.life * 600;
          ctx.strokeStyle = rgba(P.cream, Math.max(0, 1 - s.life));
          ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(s.x + k, s.y + k * 0.4); ctx.lineTo(s.x + k - len, s.y + (k - len) * 0.4); ctx.stroke();
          if (s.life > 1) { st.shoot = null; st.next = rand(4, 10); }
        }
      }
    },

    bubbles: {
      name: 'Mochi Bubbles', kr: '방울', dark: false,
      init(w, h) {
        const cols = [P.mauve, P.butter, P.taupe, P.gold, P.white];
        return { b: Array.from({ length: 34 }, () => ({ x: rand(0, w), y: rand(0, h), r: rand(12, 60), v: rand(8, 26), p: rand(0, TAU), c: cols[Math.floor(rand(0, cols.length))] })) };
      },
      draw(ctx, st, w, h, t, dt) {
        ctx.fillStyle = P.nude; ctx.fillRect(0, 0, w, h);
        for (const b of st.b) {
          b.y -= b.v * dt;
          if (b.y + b.r < 0) { b.y = h + b.r; b.x = rand(0, w); }
          const x = b.x + Math.sin(t * 0.6 + b.p) * 18;
          ctx.fillStyle = rgba(b.c, 0.35);
          ctx.beginPath(); ctx.arc(x, b.y, b.r, 0, TAU); ctx.fill();
          ctx.fillStyle = rgba(P.white, 0.55);
          ctx.beginPath(); ctx.arc(x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.18, 0, TAU); ctx.fill();
        }
      }
    },

    rain: {
      name: 'Soft Rain', kr: '비', dark: true,
      init(w, h) {
        return {
          drops: Array.from({ length: Math.round(w / 6) }, () => ({ x: rand(0, w), y: rand(0, h), l: rand(10, 24), v: rand(260, 420) })),
          ripples: [],
          lights: Array.from({ length: 14 }, () => ({ x: rand(0, w), y: rand(h * 0.55, h * 0.85), r: rand(30, 90), p: rand(0, TAU) }))
        };
      },
      draw(ctx, st, w, h, t, dt) {
        const g = ctx.createLinearGradient(0, 0, 0, h);
        g.addColorStop(0, '#151922'); g.addColorStop(1, P.ink);
        ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
        for (const l of st.lights) {
          const rg = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, l.r);
          rg.addColorStop(0, rgba(P.gold, 0.18 + 0.06 * Math.sin(t + l.p)));
          rg.addColorStop(1, rgba(P.gold, 0));
          ctx.fillStyle = rg; ctx.fillRect(l.x - l.r, l.y - l.r, l.r * 2, l.r * 2);
        }
        ctx.strokeStyle = rgba(P.sand, 0.35); ctx.lineWidth = 1;
        ctx.beginPath();
        for (const d of st.drops) {
          d.y += d.v * dt; d.x -= d.v * dt * 0.08;
          if (d.y > h) {
            if (Math.random() < 0.3) st.ripples.push({ x: d.x, y: h - rand(4, 40), r: 0 });
            d.y = -d.l; d.x = rand(0, w * 1.1);
          }
          ctx.moveTo(d.x, d.y); ctx.lineTo(d.x + d.l * 0.08, d.y - d.l);
        }
        ctx.stroke();
        st.ripples = st.ripples.filter((r) => r.r < 26);
        for (const r of st.ripples) {
          r.r += dt * 30;
          ctx.strokeStyle = rgba(P.sand, 0.4 * (1 - r.r / 26));
          ctx.beginPath(); ctx.ellipse(r.x, r.y, r.r, r.r * 0.3, 0, 0, TAU); ctx.stroke();
        }
      }
    },

    mochi: {
      name: 'Mochi Friends', kr: '모찌', dark: false,
      init(w, h) {
        const cols = [P.white, P.butter, P.nude, P.sand, '#F3E7DA'];
        const s = Math.min(w, h) / 900;
        return {
          m: Array.from({ length: 11 }, () => ({ x: rand(0.05, 0.95) * w, y: rand(0.15, 0.9) * h, r: rand(34, 70) * s, vx: rand(-14, 14) * s, p: rand(0, TAU), blink: rand(1, 5), c: cols[Math.floor(rand(0, cols.length))] }))
        };
      },
      draw(ctx, st, w, h, t, dt) {
        ctx.fillStyle = P.sand; ctx.fillRect(0, 0, w, h);
        // dotted paper
        ctx.fillStyle = rgba(P.taupe, 0.25);
        const gap = 34;
        for (let y = gap / 2; y < h; y += gap) for (let x = gap / 2; x < w; x += gap) ctx.fillRect(x, y, 2, 2);
        for (const m of st.m) {
          m.x += m.vx * dt;
          if (m.x < m.r || m.x > w - m.r) m.vx *= -1;
          const bounce = Math.abs(Math.sin(t * 1.3 + m.p));
          const y = m.y - bounce * m.r * 0.35;
          const squash = 1 + (1 - bounce) * 0.08;
          // shadow
          ctx.fillStyle = rgba(P.ink, 0.08);
          ctx.beginPath(); ctx.ellipse(m.x, m.y + m.r * 0.85, m.r * (0.8 - bounce * 0.2), m.r * 0.16, 0, 0, TAU); ctx.fill();
          // body
          ctx.fillStyle = m.c;
          ctx.beginPath(); ctx.ellipse(m.x, y, m.r * squash, m.r * 0.82 / squash, 0, 0, TAU); ctx.fill();
          ctx.strokeStyle = rgba(P.ink, 0.12); ctx.lineWidth = 1.5; ctx.stroke();
          // face
          m.blink -= dt;
          const closed = m.blink < 0.12;
          if (m.blink < 0) m.blink = rand(2, 6);
          ctx.fillStyle = P.ink; ctx.strokeStyle = P.ink; ctx.lineWidth = Math.max(1.5, m.r * 0.05);
          const ex = m.r * 0.32, ey = y - m.r * 0.05, er = m.r * 0.07;
          if (closed) {
            ctx.beginPath(); ctx.moveTo(m.x - ex - er, ey); ctx.lineTo(m.x - ex + er, ey); ctx.moveTo(m.x + ex - er, ey); ctx.lineTo(m.x + ex + er, ey); ctx.stroke();
          } else {
            ctx.beginPath(); ctx.arc(m.x - ex, ey, er, 0, TAU); ctx.arc(m.x + ex, ey, er, 0, TAU); ctx.fill();
          }
          ctx.fillStyle = rgba(P.mauve, 0.45);
          ctx.beginPath(); ctx.ellipse(m.x - ex * 1.45, ey + m.r * 0.18, m.r * 0.12, m.r * 0.07, 0, 0, TAU); ctx.ellipse(m.x + ex * 1.45, ey + m.r * 0.18, m.r * 0.12, m.r * 0.07, 0, 0, TAU); ctx.fill();
          ctx.beginPath(); ctx.arc(m.x, ey + m.r * 0.12, m.r * 0.08, 0.15 * Math.PI, 0.85 * Math.PI); ctx.stroke();
        }
      }
    }
  };

  function star(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2);
    ctx.quadraticCurveTo(x, y, x + r * 2, y);
    ctx.quadraticCurveTo(x, y, x, y + r * 2);
    ctx.quadraticCurveTo(x, y, x - r * 2, y);
    ctx.quadraticCurveTo(x, y, x, y - r * 2);
    ctx.fill();
  }

  function start(canvas, id, opts = {}) {
    const scene = scenes[id] || scenes.clouds;
    const ctx = canvas.getContext('2d');
    let w = 0, h = 0, st = null, raf = 0, last = performance.now(), t = 0, paused = false;
    const speed = () => opts.speed || 1;
    const fpsCap = opts.fps || 60;
    let acc = 0;

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, opts.preview ? 1.5 : 2);
      const rect = canvas.getBoundingClientRect();
      w = Math.max(1, rect.width); h = Math.max(1, rect.height);
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      st = scene.init(w, h);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    function loop(now) {
      raf = requestAnimationFrame(loop);
      const real = Math.min(0.1, (now - last) / 1000);
      last = now;
      if (paused) return;
      acc += real;
      if (acc < 1 / fpsCap - 0.002) return;
      const dt = acc * speed();
      acc = 0;
      t += dt;
      scene.draw(ctx, st, w, h, t, dt);
    }
    raf = requestAnimationFrame(loop);

    return {
      stop() { cancelAnimationFrame(raf); ro.disconnect(); },
      pause(v) { paused = !!v; },
      setSpeed(v) { opts.speed = v; }
    };
  }

  window.Scenes = {
    list: Object.entries(scenes).map(([id, s]) => ({ id, name: s.name, kr: s.kr, dark: s.dark })),
    start
  };
})();
