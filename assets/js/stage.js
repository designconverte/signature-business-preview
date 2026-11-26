/*!
 * stage.js · light painting on the studio wall.
 * Writes a word in the script typeface as if drawn with a light during a long exposure: the lit trail stays,
 * a hot tip with a halo moves left to right at handwriting speed, and a pen flourish closes the word.
 * Canvas 2D only (never an LCP candidate); requestAnimationFrame runs only while something is moving.
 * Text for the canvas comes from data attributes in the HTML (no language strings here).
 *
 *   const sign = SBLightSign(canvas, { img, frameW, frameH, anchorX, anchorY, maxW });
 *   sign.write('Ana');   sign.write('');   sign.reveal();   sign.destroy();
 */
/* global window, document, requestAnimationFrame, cancelAnimationFrame, ResizeObserver */
(function () {
  'use strict';

  const INK = '#FFF4E8';
  const GLOW = 'rgba(255, 196, 140, .95)';
  const LABEL = 'rgba(232, 210, 176, .82)';
  const CHARS_PER_SEC = 8.5;
  const FLOURISH_SEC = 0.75;
  const FADE_SEC = 0.28;
  const DPR_MAX = 1.5;
  const SCRIPT = "'WindSong', cursive";
  const SANS = "'Montserrat', system-ui, sans-serif";

  // pen flourish from the brand stroke: M2 20 C 70 6, 150 4, 230 12 S 360 24, 418 4 (viewBox 420 x 28)
  const FLOURISH = (function () {
    const segs = [
      [[2, 20], [70, 6], [150, 4], [230, 12]],
      [[230, 12], [310, 20], [360, 24], [418, 4]],
    ];
    const pts = [];
    segs.forEach((s, si) => {
      for (let i = si ? 1 : 0; i <= 40; i++) {
        const t = i / 40, u = 1 - t;
        pts.push([
          u * u * u * s[0][0] + 3 * u * u * t * s[1][0] + 3 * u * t * t * s[2][0] + t * t * t * s[3][0],
          u * u * u * s[0][1] + 3 * u * u * t * s[1][1] + 3 * u * t * t * s[2][1] + t * t * t * s[3][1],
        ]);
      }
    });
    return pts;
  })();

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (t) => 1 - Math.pow(1 - t, 3);

  function commonPrefix(a, b) {
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i++;
    return i;
  }

  /** First word, letters only (accents, hyphen and apostrophe kept), first letter upper case, max 16. */
  function cleanWord(value) {
    const first = String(value || '').trim().split(/\s+/)[0] || '';
    const word = first.replace(/[^\p{L}'’-]/gu, '').slice(0, 16);
    return word ? word.charAt(0).toLocaleUpperCase() + word.slice(1) : '';
  }

  function SBLightSign(canvas, options) {
    const o = Object.assign({ frameW: 720, frameH: 1280, anchorX: 0.6, anchorY: 0.3, maxW: 0.62, posX: 0.5, posY: 0.5 }, options || {});
    const ctx = canvas.getContext('2d');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const label = canvas.getAttribute('data-label') || '';
    const placeholder = canvas.getAttribute('data-placeholder') || '';

    let W = 0, H = 0, dpr = 1;
    let fontsReady = false;
    let raf = 0, last = 0;
    let text = '';             // word being shown
    let shown = 0;             // revealed characters (float)
    let flourish = 0;          // 0..1
    let labelAlpha = 0;
    let ghost = null, ghostAlpha = 0; // previous word fading out
    let layout = null;         // {size, x0, base, w, ink, glow, profile, offsets}
    let wanted = '';           // what the caller asked for (empty → placeholder)
    let destroyed = false;

    function frameToCanvas() {
      const scale = Math.max(W / o.frameW, H / o.frameH);
      const dw = o.frameW * scale, dh = o.frameH * scale;
      return { dw, dh, ox: (W - dw) * o.posX, oy: (H - dh) * o.posY };
    }

    function buildLayout(word) {
      if (!word || !W) return null;
      const f = frameToCanvas();
      const maxW = Math.min(o.maxW * f.dw, W * 0.9);
      let size = Math.min(f.dw * 0.15, H * 0.2);
      ctx.font = `400 ${size}px ${SCRIPT}`;
      let w = ctx.measureText(word).width;
      if (w > maxW) { size *= maxW / w; ctx.font = `400 ${size}px ${SCRIPT}`; w = ctx.measureText(word).width; }
      const pad = Math.ceil(size * 0.6);
      let cx = f.ox + o.anchorX * f.dw;
      cx = clamp(cx, w / 2 + W * 0.04, W - w / 2 - W * 0.04);
      // keep the label inside the stage when the photo is cropped to a short band (phone)
      const safeTop = typeof o.safeTop === 'function' ? o.safeTop() : 0;
      const base = Math.max(f.oy + o.anchorY * f.dh, size * 1.12 + Math.max(H * 0.07, safeTop + 10));
      const x0 = cx - w / 2;

      // ink and glow drawn once per word on offscreen canvases (device pixels)
      const ow = Math.ceil((w + pad * 2) * dpr), oh = Math.ceil(size * 1.9 * dpr);
      const ink = document.createElement('canvas'); ink.width = ow; ink.height = oh;
      const glow = document.createElement('canvas'); glow.width = ow; glow.height = oh;
      const ic = ink.getContext('2d'), gc = glow.getContext('2d');
      const oy = size * 1.25; // baseline inside the offscreen box
      [ic, gc].forEach((c) => { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.font = `400 ${size}px ${SCRIPT}`; c.textBaseline = 'alphabetic'; });
      ic.fillStyle = INK; ic.fillText(word, pad, oy);
      gc.shadowColor = GLOW; gc.shadowBlur = size * 0.22 * dpr; gc.fillStyle = 'rgba(255, 210, 170, .85)';
      gc.fillText(word, pad, oy); gc.shadowBlur = size * 0.5 * dpr; gc.fillText(word, pad, oy);

      // per-column ink centroid: where the light tip sits while writing
      const data = ic.getImageData(0, 0, ow, oh).data;
      const profile = new Float32Array(ow);
      let prev = oy * dpr - size * 0.3 * dpr;
      for (let x = 0; x < ow; x++) {
        let sum = 0, acc = 0;
        for (let y = 0; y < oh; y += 2) { const a = data[(y * ow + x) * 4 + 3]; if (a > 60) { sum += a; acc += a * y; } }
        prev = sum ? prev * 0.55 + (acc / sum) * 0.45 : prev;
        profile[x] = prev;
      }
      // x of each character boundary (cursive letters overlap, the reveal follows the advance widths)
      const offsets = [0];
      for (let i = 1; i <= word.length; i++) offsets.push(ctx.measureText(word.slice(0, i)).width);
      return { word, size, x0, base, w, pad, oy, ink, glow, profile, offsets, ow, oh };
    }

    function revealX(L, chars) {
      const i = Math.floor(chars), frac = chars - i;
      if (i >= L.word.length) return L.w;
      return L.offsets[i] + (L.offsets[i + 1] - L.offsets[i]) * frac;
    }

    function drawWord(L, rx, alpha) {
      const left = L.x0 - L.pad, top = L.base - L.oy;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.rect(left, top, L.pad + rx + (rx >= L.w ? L.pad : L.size * 0.04), L.oh / dpr); ctx.clip();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(L.glow, left, top, L.ow / dpr, L.oh / dpr);
      ctx.globalCompositeOperation = 'source-over';
      ctx.drawImage(L.ink, left, top, L.ow / dpr, L.oh / dpr);
      ctx.restore();
    }

    function flourishPoint(L, t) {
      const fw = L.w * 1.05, fx = L.x0 - L.w * 0.02, fy = L.base + L.size * 0.08;
      const n = FLOURISH.length - 1, k = t * n, i = Math.floor(k), f = k - i;
      const a = FLOURISH[Math.min(i, n)], b = FLOURISH[Math.min(i + 1, n)];
      return [fx + ((a[0] + (b[0] - a[0]) * f) / 420) * fw, fy + ((a[1] + (b[1] - a[1]) * f) / 28) * L.size * 0.16];
    }

    function drawFlourish(L, t, alpha) {
      if (t <= 0) return;
      const n = Math.max(1, Math.round(t * (FLOURISH.length - 1)));
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath();
      for (let i = 0; i <= n; i++) { const p = flourishPoint(L, i / (FLOURISH.length - 1)); if (i) ctx.lineTo(p[0], p[1]); else ctx.moveTo(p[0], p[1]); }
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255, 200, 150, .5)'; ctx.lineWidth = Math.max(2, L.size * 0.05); ctx.shadowColor = GLOW; ctx.shadowBlur = L.size * 0.25;
      ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0; ctx.strokeStyle = INK; ctx.lineWidth = Math.max(1, L.size * 0.018);
      ctx.stroke();
      ctx.restore();
    }

    function drawTip(x, y, size, strength) {
      if (strength <= 0) return;
      const r = size * 0.5;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      let g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(255, 236, 214, ${0.55 * strength})`); g.addColorStop(0.35, `rgba(255, 180, 120, ${0.22 * strength})`); g.addColorStop(1, 'rgba(255, 160, 100, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      g = ctx.createRadialGradient(x, y, 0, x, y, size * 0.07);
      g.addColorStop(0, `rgba(255, 255, 255, ${strength})`); g.addColorStop(1, 'rgba(255, 240, 220, 0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, size * 0.07, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    function drawSpill(L, k) {
      // warm light falling on the wall around the writing
      const cx = L.x0 + L.w / 2, cy = L.base - L.size * 0.3, r = Math.max(L.w, L.size * 2) * 0.9;
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, `rgba(255, 190, 130, ${0.13 * k})`); g.addColorStop(1, 'rgba(255, 190, 130, 0)');
      ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(cx - r, cy - r, r * 2, r * 2); ctx.restore();
    }

    function drawLabel(L, alpha) {
      if (!label || alpha <= 0) return;
      const s = clamp(L.size * 0.13, 9, 13);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = `500 ${s}px ${SANS}`;
      ctx.fillStyle = LABEL; ctx.textAlign = 'center';
      if ('letterSpacing' in ctx) ctx.letterSpacing = `${(s * 0.32).toFixed(1)}px`;
      ctx.fillText(label.toUpperCase(), L.x0 + L.w / 2, L.base - L.size * 0.98);
      ctx.restore();
    }

    function render() {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const L = layout;
      if (!L) return;
      const rx = revealX(L, shown);
      const k = rx / L.w;
      drawSpill(L, Math.max(k, ghostAlpha * 0.6));
      if (ghost && ghostAlpha > 0) { drawWord(ghost, ghost.w, ghostAlpha); drawFlourish(ghost, 1, ghostAlpha); }
      drawLabel(L, labelAlpha);
      drawWord(L, rx, 1);
      drawFlourish(L, ease(flourish), 1);
      if (!reduced) {
        if (shown < L.word.length) {
          const px = Math.round((L.pad + rx) * dpr);
          const y = L.base - L.oy + L.profile[clamp(px, 0, L.ow - 1)] / dpr;
          drawTip(L.x0 + rx, y, L.size, 1);
        } else if (flourish > 0 && flourish < 1) {
          const p = flourishPoint(L, ease(flourish));
          drawTip(p[0], p[1], L.size * 0.8, 1 - flourish * 0.4);
        }
      }
    }

    function moving() {
      if (!layout) return false;
      return shown < layout.word.length || flourish < 1 || ghostAlpha > 0 || labelAlpha < 1;
    }

    function tick(now) {
      raf = 0;
      if (destroyed) return;
      // the rAF timestamp can be slightly older than performance.now() taken in kick()
      const dt = clamp((now - last) / 1000, 0, 0.05);
      last = now;
      const L = layout;
      if (L) {
        labelAlpha = Math.min(1, labelAlpha + dt * 2.2);
        if (shown < L.word.length) shown = Math.min(L.word.length, shown + dt * CHARS_PER_SEC);
        else if (flourish < 1) flourish = Math.min(1, flourish + dt / FLOURISH_SEC);
      }
      if (ghostAlpha > 0) { ghostAlpha = Math.max(0, ghostAlpha - dt / FADE_SEC); if (!ghostAlpha) ghost = null; }
      render();
      if (moving()) raf = requestAnimationFrame(tick);
    }

    function kick() {
      if (reduced) {
        if (layout) { shown = layout.word.length; flourish = 1; labelAlpha = 1; }
        ghost = null; ghostAlpha = 0;
        render();
        return;
      }
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); }
    }

    function setWord(word) {
      if (layout && layout.word === word) return;
      const old = layout;
      const keep = old ? Math.min(shown, commonPrefix(old.word, word)) : 0;
      layout = buildLayout(word);
      if (old && keep === 0 && shown > 0.5) { ghost = old; ghostAlpha = 1; }
      shown = keep;
      flourish = 0;
      kick();
    }

    function apply() {
      if (!fontsReady || !W) return;
      setWord(wanted || placeholder);
    }

    function readObjectPosition() {
      // follow the photo's CSS object-position (it changes between desktop and the phone band)
      if (!o.img) return;
      const parts = window.getComputedStyle(o.img).objectPosition.split(' ');
      const pct = (v, d) => (/%$/.test(v) ? parseFloat(v) / 100 : d);
      o.posX = pct(parts[0] || '', o.posX);
      o.posY = pct(parts[1] || '', o.posY);
    }

    function resize() {
      const r = canvas.getBoundingClientRect();
      if (!r.width || !r.height) return;
      readObjectPosition();
      dpr = Math.min(window.devicePixelRatio || 1, DPR_MAX);
      W = r.width; H = r.height;
      canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
      if (layout) {
        const word = layout.word;
        const s = shown, f = flourish;
        layout = buildLayout(word); shown = s; flourish = f; ghost = null; ghostAlpha = 0;
        render();
      } else apply();
    }

    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    if (ro) ro.observe(canvas); else window.addEventListener('resize', resize);
    resize();

    const fontsLoad = document.fonts && document.fonts.load
      ? Promise.all([document.fonts.load(`400 40px ${SCRIPT}`, (placeholder || 'Ab') + 'áãçéõ'), document.fonts.load(`500 12px ${SANS}`)])
      : Promise.resolve();
    fontsLoad.catch(() => {}).then(() => { fontsReady = true; resize(); apply(); });

    return {
      write(value) { wanted = cleanWord(value); apply(); },
      get word() { return layout ? layout.word : ''; },
      get done() { return !!layout && shown >= layout.word.length && flourish >= 1; },
      reveal() { if (layout) { shown = layout.word.length; flourish = 1; labelAlpha = 1; ghost = null; ghostAlpha = 0; render(); } },
      resize,
      destroy() { destroyed = true; if (raf) cancelAnimationFrame(raf); if (ro) ro.disconnect(); },
    };
  }

  SBLightSign.cleanWord = cleanWord;
  window.SBLightSign = SBLightSign;
})();
