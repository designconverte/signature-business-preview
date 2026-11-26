/*!
 * site.js · Signature Business home. Language-neutral: every text it shows comes from the HTML.
 * Header, the light signature tied to the hero form, form helpers (details, ticket, inheritance), section gestures,
 * the pinned row of client chairs, lightbox, mobile bar and the Boston clock.
 * GSAP, ScrollTrigger and Lenis load after the page load (paths relative to this file), so they never compete with the
 * first paint; with reduced motion they are not loaded at all. Without JS the page is complete and static.
 */
/* global window, document, gsap, ScrollTrigger, Lenis, SBLightSign, IntersectionObserver, MutationObserver, requestAnimationFrame */
(function () {
  'use strict';

  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const mq = (q) => window.matchMedia(q).matches;
  const reduced = mq('(prefers-reduced-motion: reduce)');
  const lang = (document.documentElement.lang || 'pt').slice(0, 2);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const here = (document.currentScript && document.currentScript.src) || window.location.href;
  let hasST = false;

  /* scroll listeners: native scroll now, also on Lenis once it exists (same frame as the smooth scroll) */
  let lenis = null;
  const scrollFns = [];
  const onScroll = (fn) => { scrollFns.push(fn); window.addEventListener('scroll', fn, { passive: true }); };

  /* ── header ── */
  const hdr = $('[data-hdr]');
  const hdrH = () => (hdr ? hdr.offsetHeight : 0);
  const setHdr = () => { if (hdr) hdr.classList.toggle('is-solid', window.scrollY > 24); };
  setHdr();
  onScroll(setHdr);

  /* ── in-page links (offset by the header; #reservar focuses the name field) ── */
  const heroForm = $('[data-cs-form="reserve-hero"]');
  const heroName = heroForm && $('[name="name"]', heroForm);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    const id = a.getAttribute('href').slice(1);
    const target = id && document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    const goName = target === heroForm && heroName && !heroForm.querySelector('[data-cs-step="1"]').hidden;
    const dest = target;
    const y = dest.getBoundingClientRect().top + window.scrollY - hdrH() - (goName ? 24 : 0);
    if (lenis) lenis.scrollTo(y, { duration: 1.1 });
    else window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    if (goName) setTimeout(() => heroName.focus({ preventScroll: true }), lenis ? 900 : 450);
  });

  /* ── the stage: the visitor's name written with light ── */
  const stage = $('[data-stage]');
  let sign = null;
  if (stage && typeof SBLightSign !== 'undefined') {
    const img = $('.stage__photo', stage);
    const start = () => {
      sign = SBLightSign($('.stage__light', stage), {
        img, frameW: +stage.dataset.frameW || 720, frameH: +stage.dataset.frameH || 1280, anchorX: 0.6, anchorY: 0.31, maxW: 0.62,
        // on the phone the header sits over the top of the photo band
        safeTop: () => (stage.getBoundingClientRect().top < 4 ? hdrH() : 0),
      });
      if (heroName && heroName.value) sign.write(heroName.value);
    };
    if (!reduced) {
      // the studio light comes on once, then the light pen writes
      stage.style.setProperty('--lit', '.5');
      requestAnimationFrame(() => requestAnimationFrame(() => stage.style.removeProperty('--lit')));
    }
    if (document.readyState === 'complete') setTimeout(start, reduced ? 0 : 650);
    else window.addEventListener('load', () => setTimeout(start, reduced ? 0 : 650), { once: true });
  }

  /* ── form helpers ── */
  const firstWord = (v) => {
    const w = String(v || '').trim().split(/\s+/)[0] || '';
    return w ? w.charAt(0).toLocaleUpperCase() + w.slice(1) : '';
  };
  const finalForm = $('[data-cs-form="reserve-final"]');

  function echoName(value) {
    const w = firstWord(value);
    $$('[data-name-echo]').forEach((el) => {
      if (!el.dataset.fallback) el.dataset.fallback = el.textContent;
      el.textContent = w || el.dataset.fallback;
    });
  }

  // details: optional answers that are not module fields go to the "details" field, one per line
  const DETAIL_KEYS = { moment: 'Momento da marca', channel: 'Prefere contato por' };
  function composeDetails(form) {
    const out = $('[data-details]', form);
    if (!out) return;
    const lines = [];
    Object.keys(DETAIL_KEYS).forEach((k) => {
      const els = $$(`[data-detail="${k}"]`, form);
      let v = '';
      els.forEach((el) => { if ((el.type === 'radio' && el.checked) || (el.tagName === 'SELECT' && el.value)) v = el.value; });
      if (v) lines.push(`${DETAIL_KEYS[k]}: ${v}`);
    });
    // the final form has no "moment" question: it carries the hero answer when there is one
    if (form !== heroForm && heroForm && !lines.some((l) => l.startsWith(DETAIL_KEYS.moment))) {
      const m = $('[name="moment"]:checked', heroForm);
      if (m) lines.unshift(`${DETAIL_KEYS.moment}: ${m.value}`);
    }
    lines.push(`Página: ${out.dataset.siteLang || lang.toUpperCase()}`);
    out.value = lines.join('\n');
  }

  function updateTicket() {
    const t = heroForm && $('[data-ticket]', heroForm);
    if (!t) return;
    const name = firstWord(heroName && heroName.value);
    const svc = $('[name="service"]:checked', heroForm);
    const label = svc ? $('b', svc.closest('label')).textContent : '';
    const tpl = t.dataset.ticketTpl || '{name} · {service}';
    t.hidden = !(name && label);
    $('[data-ticket-text]', t).textContent = tpl.replace('{name}', name).replace('{service}', label);
  }

  [heroForm, finalForm].forEach((form) => {
    if (!form) return;
    composeDetails(form);
    form.addEventListener('change', (e) => {
      if (e.target.matches('[data-detail]')) composeDetails(form);
      if (form === heroForm) updateTicket();
    });
    // the module announces progress in English; keep the live region in the page language
    const live = $('[data-cs-live]', form);
    const tpl = form.dataset.stepTpl;
    if (live && tpl && typeof MutationObserver !== 'undefined') {
      new MutationObserver(() => {
        const m = live.textContent.match(/^Step (\d+) of (\d+)$/);
        if (m) live.textContent = tpl.replace('{n}', m[1]).replace('{m}', m[2]);
      }).observe(live, { childList: true, characterData: true, subtree: true });
    }
  });

  // the final form inherits what the visitor already chose in the hero, silently, until she touches it
  function inherit() {
    if (!finalForm || finalForm.dataset.touched) return;
    const set = (name, value) => { const el = $(`[name="${name}"]`, finalForm); if (el && value != null) el.value = value; };
    if (heroName) set('name', heroName.value);
    const svc = heroForm && $('[name="service"]:checked', heroForm);
    if (svc) set('service', svc.value);
    const ch = heroForm && $('[name="channel"]:checked', heroForm);
    if (ch) set('channel', ch.value);
    ['phone', 'email'].forEach((n) => { const el = heroForm && $(`[name="${n}"]`, heroForm); if (el && el.value) set(n, el.value); });
    composeDetails(finalForm);
  }
  if (finalForm) {
    const touch = () => { finalForm.dataset.touched = '1'; };
    finalForm.addEventListener('input', touch);
    finalForm.addEventListener('change', (e) => { if (e.isTrusted) touch(); });
  }

  if (heroName) {
    heroName.addEventListener('input', () => {
      if (sign) sign.write(heroName.value);
      echoName(heroName.value);
      updateTicket();
      inherit();
    });
  }
  if (heroForm) heroForm.addEventListener('change', inherit);
  if (finalForm) {
    const fn = $('[name="name"]', finalForm);
    if (fn) fn.addEventListener('input', () => { if (!heroName || !heroName.value) echoName(fn.value); });
  }

  // step 1 done: the key light comes up, one flash, the wax seal stamps the card
  document.addEventListener('cs:form_step', (e) => {
    const d = e.detail || {};
    if (d.form_id !== 'reserve-hero' || d.step !== 1) return;
    if (sign) sign.reveal();
    if (stage) {
      stage.classList.add('is-reserved');
      if (!reduced) { stage.classList.remove('is-flash'); void stage.offsetWidth; stage.classList.add('is-flash'); }
    }
    heroForm.classList.add('is-stamped');
    updateTicket();
  });
  document.addEventListener('cs:lead', () => { if (stage) stage.classList.add('is-reserved'); });

  /* ── section gestures (GSAP; the CSS shows the final state until they are set up) ── */
  $$('[data-pillar]').forEach((li) => li.classList.add('is-on'));
  function initMotion() {
    hasST = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
    if (!hasST) return;
    gsap.registerPlugin(ScrollTrigger);

    // smooth scroll: fine pointer and wide screens only
    if (typeof Lenis !== 'undefined' && mq('(hover: hover) and (pointer: fine)') && mq('(min-width: 1024px)')) {
      lenis = new Lenis({ lerp: 0.11, smoothWheel: true });
      document.documentElement.classList.add('has-lenis');
      lenis.on('scroll', ScrollTrigger.update);
      lenis.on('scroll', () => scrollFns.forEach((fn) => fn()));
      gsap.ticker.add((t) => lenis.raf(t * 1000));
      gsap.ticker.lagSmoothing(0);
    }

    // manifesto: the red strips burn in like reel captions
    const strips = $$('[data-strips] span');
    if (strips.length) {
      gsap.fromTo(strips, { clipPath: 'inset(0 100% 0 0)' }, {
        clipPath: 'inset(0 0% 0 0)', duration: 0.7, ease: 'steps(14)', stagger: 0.32, clearProps: 'clipPath',
        scrollTrigger: { trigger: strips[0], start: 'top 82%', once: true },
      });
    }

    // generic reveal
    $$('[data-reveal]').forEach((el) => {
      gsap.from(el.children, { y: 32, opacity: 0, duration: 1, ease: 'expo.out', stagger: 0.08, clearProps: 'transform,opacity', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
    });

    // method: three lights swing until they aim at the chair; the chair lights up
    const lights = $('[data-lights]');
    if (lights) {
      const beams = $$('[data-beam]', lights);
      const pillars = $$('[data-pillar]');
      const aim = (beam) => {
        const W = lights.offsetWidth, H = lights.offsetHeight;
        const x0 = beam.offsetLeft + beam.offsetWidth / 2, y0 = beam.offsetTop;
        const dx = W * 0.5 - x0, dy = H * 0.74 - y0;
        return -Math.atan2(dx, dy) * 180 / Math.PI;
      };
      const OFF = [-26, 22, 30];
      const tl = gsap.timeline({ scrollTrigger: { trigger: lights, start: 'top 78%', end: 'center 45%', scrub: 0.6, invalidateOnRefresh: true } });
      tl.fromTo(lights, { '--lit': 0.22 }, { '--lit': 1, duration: 1, ease: 'none' }, 0);
      beams.forEach((b, i) => {
        tl.fromTo(b, { rotation: () => aim(b) + OFF[i], opacity: 0.35 }, { rotation: () => aim(b), opacity: 0.9, duration: 0.42, ease: 'back.out(1.6)' }, i * 0.26);
      });
      const marks = [0.42, 0.68, 0.94];
      const light = () => {
        const p = tl.progress();
        pillars.forEach((li, i) => li.classList.toggle('is-on', p >= marks[i] - 0.02));
      };
      tl.eventCallback('onUpdate', light);
      light();
    }

    // founder: the dictionary entry is printed
    const word = $('.entry__word span');
    if (word) {
      gsap.fromTo(word, { clipPath: 'inset(-10% 100% -20% 0)' }, { clipPath: 'inset(-10% 0% -20% 0)', duration: 1.2, ease: 'steps(11)', clearProps: 'clipPath', scrollTrigger: { trigger: word, start: 'top 85%', once: true } });
    }
  }

  function loadScript(rel) {
    return new Promise((resolve, reject) => {
      const el = document.createElement('script');
      el.src = new URL(rel, here).href;
      el.onload = resolve;
      el.onerror = reject;
      document.head.appendChild(el);
    });
  }
  if (!reduced) {
    const boot = () => loadScript('../vendor/gsap.min.js')
      .then(() => Promise.all([loadScript('../vendor/ScrollTrigger.min.js'), loadScript('../vendor/lenis.min.js')]))
      .then(initMotion)
      .catch(() => {});
    if (document.readyState === 'complete') setTimeout(boot, 0); else window.addEventListener('load', () => setTimeout(boot, 0), { once: true });
  }

  /* ── clients: a pinned row of chairs that moves sideways with the scroll ── */
  const clients = $('[data-section="clients"]');
  const track = $('[data-track]');
  if (clients && track) {
    const row = $('.track__row', track);
    const seats = $$('.seat', row);
    const now = $('[data-track-now]');
    const bar = $('[data-track-bar]');
    const n = seats.length;
    let dist = 0, pinned = false, active = -1, stops = [];

    const light = (i) => {
      if (i === active) return;
      active = i;
      seats.forEach((s, k) => s.classList.toggle('is-lit', k === i));
      if (now) now.textContent = String(i + 1).padStart(2, '0');
      if (bar) bar.style.transform = `scaleX(${(i + 1) / n})`;
    };

    const measure = () => {
      const canPin = !reduced && window.innerHeight >= 520;
      clients.classList.toggle('is-pinned', canPin);
      pinned = canPin;
      if (!pinned) { clients.style.height = ''; row.style.transform = ''; return; }
      dist = Math.max(0, row.scrollWidth - track.clientWidth);
      // each card stops at the left gutter (the last one stops where the row ends)
      const pad = parseFloat(getComputedStyle(row).paddingLeft) || 0;
      stops = seats.map((st) => Math.min(st.offsetLeft - pad, dist));
      clients.style.height = `${window.innerHeight + stops[n - 1]}px`;
      update();
    };
    const update = () => {
      if (!pinned) return;
      const total = stops[n - 1] || 1;
      const y = clamp(-clients.getBoundingClientRect().top, 0, total);
      // the scroll runs along the stops, so each card gets the same scroll distance
      const seg = total / (n - 1);
      const pos = y / seg;
      const i = Math.min(n - 2, Math.floor(pos)), f = pos - i;
      const x = stops[i] + (stops[i + 1] - stops[i]) * f;
      row.style.transform = `translate3d(${-x}px, 0, 0)`;
      light(Math.round(pos));
    };
    const fromScrollLeft = () => {
      if (pinned) return;
      const max = track.scrollWidth - track.clientWidth;
      light(max > 0 ? Math.round((track.scrollLeft / max) * (n - 1)) : 0);
    };
    light(0);
    onScroll(update);
    track.addEventListener('scroll', fromScrollLeft, { passive: true });
    // a card that receives keyboard focus is brought into view
    row.addEventListener('focusin', (e) => {
      if (!pinned) return;
      const i = seats.indexOf(e.target.closest('.seat'));
      if (i < 0) return;
      track.scrollLeft = 0;
      const top = clients.getBoundingClientRect().top + window.scrollY + (i / (n - 1)) * (stops[n - 1] || 0);
      if (lenis) lenis.scrollTo(top, { immediate: true }); else window.scrollTo(0, top);
    });
    // drag (mouse or a sideways swipe) moves the row by scrolling the page the same distance
    let drag = null;
    track.addEventListener('pointerdown', (e) => {
      if (!pinned || (e.pointerType === 'mouse' && e.button !== 0)) return;
      drag = { x: e.clientX, y: e.clientY, top: window.scrollY, moved: false, id: e.pointerId };
    });
    track.addEventListener('pointermove', (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) < 6) return;
      if (!drag.moved && e.pointerType !== 'mouse' && Math.abs(dy) > Math.abs(dx)) { drag = null; return; }
      drag.moved = true;
      const y = drag.top - dx;
      if (lenis) lenis.scrollTo(y, { immediate: true }); else window.scrollTo(0, y);
    });
    const endDrag = () => { if (drag && drag.moved) { track.dataset.dragged = '1'; setTimeout(() => { delete track.dataset.dragged; }, 60); } drag = null; };
    track.addEventListener('pointerup', endDrag);
    track.addEventListener('pointercancel', endDrag);
    track.addEventListener('click', (e) => { if (track.dataset.dragged) { e.preventDefault(); e.stopPropagation(); } }, true);
    row.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const i = seats.indexOf(e.target.closest('.seat'));
      const next = seats[clamp(i + (e.key === 'ArrowRight' ? 1 : -1), 0, n - 1)];
      if (next && next !== seats[i]) { e.preventDefault(); $('.seat__pic', next).focus(); }
    });
    // layout is measured after load (the section sits below the fold, so the new height causes no shift)
    if (document.readyState === 'complete') measure(); else window.addEventListener('load', measure, { once: true });
    let rt = 0;
    window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { measure(); if (hasST) ScrollTrigger.refresh(); }, 150); });
  }

  /* ── process: the film strip runs under the loupe; the red pencil circles each frame; the frame plays its clip ── */
  const proc = $('[data-section="process"]');
  if (proc && !reduced) {
    const table = $('[data-table]', proc);
    const sheet = $('.strip .sheet', proc);
    const lens = $('[data-lens]', proc);
    const frames = $$('.frame', sheet);
    const steps = $$('.pstep', proc);
    const pnow = $('[data-proc-now]', proc);
    const pbar = $('[data-proc-bar]', proc);
    const n = frames.length;
    const K = 1.75;
    const clone = sheet.cloneNode(true);
    $$('img', clone).forEach((im) => { im.alt = ''; });
    lens.appendChild(clone);
    const lensFrames = $$('.frame', clone);
    const conn = navigator.connection || {};
    const allowVideo = !conn.saveData && !/2g/.test(conn.effectiveType || '');
    let live = false, active = -1, clipsReady = false;

    const loadClips = () => {
      if (clipsReady || !allowVideo) return;
      clipsReady = true;
      lensFrames.forEach((f) => {
        const img = $('img', f);
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.preload = 'none';
        v.setAttribute('muted', ''); v.setAttribute('playsinline', ''); v.setAttribute('aria-hidden', 'true');
        v.poster = img.currentSrc || img.src;
        v.src = new URL(`../video/${f.dataset.clip}.mp4`, here).href;
        img.replaceWith(v);
      });
    };
    const play = (i) => {
      $$('video', clone).forEach((v, k) => {
        if (k === i) { v.currentTime = 0; const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); } else v.pause();
      });
    };
    const setActive = (i, seen) => {
      if (i !== active) {
        active = i;
        steps.forEach((st, k) => st.classList.toggle('is-on', k === i));
        if (pnow) pnow.textContent = String(i + 1).padStart(2, '0');
        if (pbar) pbar.style.transform = `scaleX(${(i + 1) / n})`;
        if (seen) play(i);
      }
      frames.forEach((f, k) => { const on = seen && k <= i; f.classList.toggle('is-marked', on); lensFrames[k].classList.toggle('is-marked', on); });
    };
    const update = () => {
      if (!live) return;
      const r = proc.getBoundingClientRect();
      const range = proc.offsetHeight - window.innerHeight;
      const p = clamp(-r.top / (range || 1), 0, 1);
      const pos = p * (n - 1);
      const fw = frames[0].offsetWidth;
      const tw = table.clientWidth, th = table.clientHeight;
      const tx = tw / 2 - (fw / 2 + pos * fw);
      sheet.style.transform = `translate3d(${tx}px, 0, 0)`;
      const sh = sheet.offsetHeight;
      const D = lens.clientWidth;
      const ax = D / 2 - K * (tw / 2 - tx);
      const ay = D / 2 - K * (sh / 2);
      clone.style.transform = `translate3d(${ax}px, ${ay}px, 0) scale(${K})`;
      const seen = r.top < window.innerHeight * 0.3;
      setActive(clamp(Math.round(pos), 0, n - 1), seen);
      if (seen && active >= 0) { const v = $$('video', clone)[active]; if (v && v.paused && !v.ended && v.currentTime === 0) play(active); }
    };
    const measure = () => {
      live = window.innerHeight >= 560;
      proc.classList.toggle('is-live', live);
      if (!live) { proc.style.height = ''; sheet.style.transform = ''; frames.forEach((f) => f.classList.add('is-marked')); return; }
      proc.style.height = `${Math.round(window.innerHeight * (1 + (n - 1) * 0.7))}px`;
      active = -1;
      update();
    };
    onScroll(update);
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver((en, ob) => { if (en[0].isIntersecting) { loadClips(); ob.disconnect(); } }, { rootMargin: '60% 0px' }).observe(proc);
    }
    if (document.readyState === 'complete') measure(); else window.addEventListener('load', measure, { once: true });
    let pt = 0;
    window.addEventListener('resize', () => { clearTimeout(pt); pt = setTimeout(measure, 160); });
  }

  /* ── footer: the chair again, with her name in light; the studio goes dark and the seal signs the end ── */
  const curtain = $('[data-curtain]');
  let endSign = null;
  const currentName = () => {
    const fn = finalForm && $('[name="name"]', finalForm);
    return (heroName && heroName.value) || (fn && fn.value) || '';
  };
  if (curtain) {
    const startEnd = () => {
      if (endSign || typeof SBLightSign === 'undefined') return;
      endSign = SBLightSign($('.curtain__light', curtain), {
        img: $('.curtain__photo', curtain), frameW: 720, frameH: 1280, anchorX: 0.6, anchorY: 0.31, maxW: 0.62,
      });
      endSign.write(currentName());
    };
    if (reduced) {
      curtain.style.setProperty('--dark', '.85');
      curtain.classList.add('is-signed');
    } else {
      const dim = () => {
        const r = curtain.getBoundingClientRect();
        const k = clamp((window.innerHeight - r.top) / (window.innerHeight * 0.95), 0, 1);
        curtain.style.setProperty('--dark', (k * k * (3 - 2 * k)).toFixed(3));
        if (k > 0.9) curtain.classList.add('is-signed');
      };
      onScroll(dim);
      dim();
    }
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver((en, ob) => { if (en[0].isIntersecting) { startEnd(); ob.disconnect(); } }, { threshold: 0.2 }).observe(curtain);
    } else startEnd();
    const rewrite = () => { if (endSign) endSign.write(currentName()); };
    if (heroName) heroName.addEventListener('input', rewrite);
    const fn = finalForm && $('[name="name"]', finalForm);
    if (fn) fn.addEventListener('input', rewrite);
  }

  /* ── lightbox for the client photos ── */
  const zooms = $$('[data-zoom]');
  if (zooms.length && typeof HTMLDialogElement === 'function') {
    let dlg = null, idx = 0, opener = null;
    const big = (img) => {
      const set = (img.getAttribute('srcset') || '').split(',').map((s) => s.trim().split(' ')[0]).filter(Boolean);
      return set[set.length - 1] || img.currentSrc || img.src;
    };
    const show = (i) => {
      idx = (i + zooms.length) % zooms.length;
      const img = $('img', zooms[idx]);
      const who = zooms[idx].closest('.seat').querySelector('.seat__who b');
      $('.lb__img', dlg).src = big(img);
      $('.lb__img', dlg).alt = img.alt;
      $('.lb__txt', dlg).textContent = `${who ? who.textContent : ''} · ${idx + 1} / ${zooms.length}`;
    };
    const build = () => {
      const L = document.documentElement.lang.startsWith('pt')
        ? { close: 'Fechar', prev: 'Foto anterior', next: 'Próxima foto' }
        : { close: 'Close', prev: 'Previous photo', next: 'Next photo' };
      dlg = document.createElement('dialog');
      dlg.className = 'lb';
      dlg.setAttribute('aria-label', L.close);
      dlg.innerHTML = `<div class="lb__in"><img class="lb__img" alt=""><div class="lb__cap"><button class="lb__btn" type="button" data-lb="-1" aria-label="${L.prev}"><svg class="ic" aria-hidden="true"><use href="#i-arrow-left"></use></svg></button><span class="lb__txt"></span><button class="lb__btn" type="button" data-lb="1" aria-label="${L.next}"><svg class="ic" aria-hidden="true"><use href="#i-arrow"></use></svg></button></div></div><button class="lb__btn lb__close" type="button" data-lb="x" aria-label="${L.close}"><svg class="ic" aria-hidden="true"><use href="#i-close"></use></svg></button>`;
      document.body.appendChild(dlg);
      dlg.addEventListener('click', (e) => {
        const b = e.target.closest('[data-lb]');
        if (b) { if (b.dataset.lb === 'x') dlg.close(); else show(idx + Number(b.dataset.lb)); return; }
        if (e.target === dlg || e.target.classList.contains('lb__in')) dlg.close();
      });
      dlg.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') show(idx + 1); if (e.key === 'ArrowLeft') show(idx - 1); });
      let x0 = null;
      dlg.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
      dlg.addEventListener('pointerup', (e) => { if (x0 != null && Math.abs(e.clientX - x0) > 50) show(idx + (e.clientX < x0 ? 1 : -1)); x0 = null; });
      dlg.addEventListener('close', () => { if (lenis) lenis.start(); document.documentElement.style.overflow = ''; if (opener) opener.focus({ preventScroll: true }); });
    };
    zooms.forEach((z, i) => z.addEventListener('click', () => {
      if (!dlg) build();
      opener = z;
      show(i);
      if (lenis) lenis.stop();
      document.documentElement.style.overflow = 'hidden';
      dlg.showModal();
    }));
  }

  /* ── mobile bar: only after the hero form is behind, never over a form or the footer bar ── */
  const mbar = $('[data-mbar]');
  if (mbar && typeof IntersectionObserver !== 'undefined') {
    const state = { heroPast: false, finalIn: false, footIn: false };
    const render = () => mbar.classList.toggle('is-visible', state.heroPast && !state.finalIn && !state.footIn);
    const watch = (el, fn) => { if (el) new IntersectionObserver(([en]) => { fn(en); render(); }).observe(el); };
    watch(heroForm, (en) => { state.heroPast = !en.isIntersecting && en.boundingClientRect.top < 0; });
    watch(finalForm, (en) => { state.finalIn = en.isIntersecting; });
    watch($('.cbar'), (en) => { state.footIn = en.isIntersecting; });
  }

  /* ── footer: the time in Boston, live ── */
  const clock = $('[data-boston-clock]');
  if (clock && typeof Intl !== 'undefined') {
    const fmt = new Intl.DateTimeFormat(lang === 'pt' ? 'pt-BR' : 'en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit' });
    const tick = () => { const d = new Date(); clock.textContent = fmt.format(d); clock.setAttribute('datetime', d.toISOString()); };
    tick();
    setInterval(tick, 20000);
  }
})();
