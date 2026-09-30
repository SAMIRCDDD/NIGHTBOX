(() => {
  'use strict';
  const scene = document.querySelector('.scene-scroll');
  if (!scene) return;
  const pin = scene.querySelector('.scene-pin');
  const media = scene.querySelector('.scene-media');
  const video = scene.querySelector('.scene-video');
  const poster = scene.querySelector('.scene-poster');
  const toggle = scene.querySelector('.scene-toggle');
  const cue = scene.querySelector('.scene-cue-label');
  const counter = scene.querySelector('.scene-counter');
  const status = scene.querySelector('.scene-status');
  const header = document.querySelector('.header');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 700px)');
  const fps = 24;
  let duration = 0, start = 0, distance = 1;
  let frameHeight = 0, mediaHeight = 0, finalScale = 1, visualProgress = 0;
  let target = 0, displayed = 0, previousTick = 0, raf = 0;
  let ready = false, frozen = false, seeking = false, failed = false, suspended = false;
  let seekTimer = 0, loadTimer = 0, pendingFrame = 0, loadedSource = '';
  let mediaRequest, blobUrl = '', generation = 0;

  function progress() { return Math.max(0, Math.min(1, (scrollY - start) / distance)); }
  function present(p) {
    visualProgress = Math.max(0, Math.min(1, p));
    const finale = Math.max(0, Math.min(1, (visualProgress - 2 / 3) * 3));
    // Smoothstep gives the final reveal a soft start and stop in either direction.
    const eased = finale * finale * (3 - 2 * finale);
    const scale = 1 + (finalScale - 1) * eased;
    const lift = eased * Math.max(0, (mediaHeight - frameHeight * scale) / 2);
    media.style.setProperty('--scene-zoom', String(scale));
    media.style.setProperty('--scene-lift', `${lift}px`);
    // Blend the lower edge before lifting it out of the viewport floor.
    media.style.setProperty('--scene-floor', String(Math.max(0, 1 - finale * 6)));
  }
  function measure() {
    // Keep the actual 16:9 frame flush with the viewport floor, even when
    // portrait layouts leave a shallower media area than the video ratio.
    const frameWidth = Math.min(media.clientWidth, media.clientHeight * 16 / 9);
    media.style.setProperty('--frame-width', `${frameWidth}px`);
    frameHeight = frameWidth * 9 / 16;
    mediaHeight = media.clientHeight;
    // Source margins are black in the final wide shot. Zoom within the media
    // column, with a height cap so short mobile layouts keep the whole machine.
    finalScale = Math.max(1, Math.min(1.35, mediaHeight / (frameHeight || 1)));
    present(failed || reducedMotion.matches ? 1 : visualProgress);
    start = scene.getBoundingClientRect().top + scrollY - header.getBoundingClientRect().height;
    distance = Math.max(1, scene.offsetHeight - pin.offsetHeight);
    updateTarget();
  }
  function updateTarget() {
    if (failed || reducedMotion.matches || suspended) return;
    const p = progress();
    scene.style.setProperty('--scene-progress', String(p));
    const complete = p >= .985;
    scene.classList.toggle('is-complete', complete);
    counter.textContent = `${p < 1 / 3 ? '01' : p < 2 / 3 ? '02' : '03'} / 03`;
    if (!frozen) cue.textContent = complete ? 'DÉCOUVREZ LA NIGHTBOX' : 'FAITES DÉFILER POUR EXPLORER';
    target = p * duration;
    if (ready && !frozen) schedule();
  }
  function schedule() {
    if (!raf && !document.hidden && !suspended) raf = requestAnimationFrame(tick);
  }
  function tick(now) {
    raf = 0;
    if (!ready || frozen || reducedMotion.matches || failed || suspended) return;
    const dt = previousTick ? Math.min(64, now - previousTick) : 16.67;
    previousTick = now;
    // Short, time-based damping: identical speed on 60 Hz and 120 Hz displays.
    displayed += (target - displayed) * (1 - Math.exp(-dt / 48));
    if (Math.abs(target - displayed) < 1 / (fps * 3)) displayed = target;
    present(duration ? displayed / duration : 0);
    const frameTime = Math.max(0, Math.min(duration, Math.round(displayed * fps) / fps));
    if (!seeking && Math.abs(video.currentTime - frameTime) > .001) {
      seeking = true;
      try {
        video.currentTime = frameTime;
        clearTimeout(seekTimer);
        seekTimer = setTimeout(() => {
          if (!seeking) return;
          // Never leave a long blank pinned area if a decoder or request fails.
          fallback('La vue fixe reste disponible.');
        }, 1800);
      } catch { fallback('La vue fixe reste disponible.'); }
    }
    if (Math.abs(target - displayed) > 1 / (fps * 3)) schedule();
    else previousTick = 0;
  }
  function reveal() {
    if (!failed && video.readyState >= 2) scene.classList.add('has-frame');
  }
  function fallback(message) {
    failed = true;
    ready = false;
    cancelAnimationFrame(raf); raf = 0;
    clearTimeout(seekTimer);
    clearTimeout(loadTimer);
    mediaRequest?.abort();
    if (pendingFrame && video.cancelVideoFrameCallback) video.cancelVideoFrameCallback(pendingFrame);
    scene.classList.remove('has-frame', 'is-enhanced');
    scene.classList.add('is-static');
    poster.src = 'nightbox-scroll-end.jpg';
    video.pause();
    toggle.hidden = true;
    cue.textContent = 'DÉCOUVREZ LA NIGHTBOX';
    counter.textContent = 'NIGHTBOX';
    status.textContent = message || '';
    measure();
  }
  async function load() {
    if (reducedMotion.matches) { fallback('Animation désactivée selon vos préférences de mouvement.'); return; }
    failed = false;
    present(0);
    scene.classList.remove('is-static');
    scene.classList.add('is-enhanced');
    poster.src = 'nightbox-scroll-poster.jpg';
    toggle.hidden = false;
    const source = `nightbox-scroll-${mobile.matches ? 'mobile' : 'desktop'}.mp4`;
    if (loadedSource !== source) {
      loadedSource = source;
      const loadGeneration = ++generation;
      mediaRequest?.abort();
      mediaRequest = new AbortController();
      ready = false; seeking = false;
      scene.classList.remove('has-frame');
      clearTimeout(loadTimer);
      loadTimer = setTimeout(() => fallback('Le chargement est indisponible. La vue fixe reste accessible.'), 12000);
      // A small complete Blob is seekable in WebKit even on static servers
      // without HTTP Range support. The matching poster covers the loading time.
      try {
        const response = await fetch(source, { signal:mediaRequest.signal });
        if (!response.ok) throw new Error('Video unavailable');
        const blob = await response.blob();
        if (loadGeneration !== generation || failed || reducedMotion.matches) return;
        if (!blob.size) throw new Error('Empty video');
        if (blobUrl) URL.revokeObjectURL(blobUrl);
        blobUrl = URL.createObjectURL(blob);
        video.src = blobUrl;
        video.preload = 'auto';
        video.load();
      } catch {
        if (loadGeneration === generation && !failed) fallback('La vidéo n’a pas pu être chargée. La vue fixe reste disponible.');
      }
    }
    measure();
  }
  video.addEventListener('loadedmetadata', () => {
    if (!Number.isFinite(video.duration) || video.duration <= 0) { fallback('La vue fixe reste disponible.'); return; }
    duration = Math.max(0, (Math.round(video.duration * fps) - 1) / fps);
    displayed = target = progress() * duration;
    if (target > 0) video.currentTime = target;
  });
  video.addEventListener('loadeddata', () => {
    if (failed || reducedMotion.matches) return;
    ready = true;
    clearTimeout(loadTimer);
    // The poster remains underneath until an actual decoded frame is available.
    if (video.requestVideoFrameCallback) pendingFrame = video.requestVideoFrameCallback(() => { pendingFrame = 0; reveal(); });
    else reveal();
    updateTarget();
  });
  video.addEventListener('seeked', () => {
    clearTimeout(seekTimer);
    seeking = false;
    reveal();
    if (ready && !frozen && Math.abs(video.currentTime - target) > 1 / (fps * 2)) schedule();
  });
  video.addEventListener('error', () => fallback('La vidéo n’a pas pu être chargée. La vue fixe reste disponible.'));
  toggle.addEventListener('click', () => {
    frozen = !frozen;
    toggle.setAttribute('aria-pressed', String(frozen));
    toggle.textContent = frozen ? 'Reprendre l’animation' : 'Figer l’animation';
    cue.textContent = frozen ? 'ANIMATION FIGÉE' : 'FAITES DÉFILER POUR EXPLORER';
    if (frozen) { cancelAnimationFrame(raf); raf = 0; }
    else { displayed = video.currentTime; previousTick = 0; updateTarget(); }
  });
  addEventListener('scroll', updateTarget, { passive: true });
  addEventListener('resize', measure, { passive: true });
  addEventListener('pageshow', () => { suspended = false; measure(); });
  addEventListener('pagehide', event => {
    cancelAnimationFrame(raf); raf = 0;
    if (!event.persisted) {
      mediaRequest?.abort();
      clearTimeout(loadTimer); clearTimeout(seekTimer);
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; previousTick = 0; }
    else { displayed = video.currentTime; updateTarget(); }
  });
  // Background animation stops while a modal/menu owns focus.
  const overlays = new MutationObserver(() => {
    suspended = !!document.querySelector('dialog[open]') || document.body.classList.contains('menu-open');
    if (suspended) { cancelAnimationFrame(raf); raf = 0; }
    else updateTarget();
  });
  overlays.observe(document.body, { attributes:true, attributeFilter:['class'], subtree:false });
  document.querySelectorAll('dialog').forEach(dialog => overlays.observe(dialog, { attributes:true, attributeFilter:['open'] }));
  reducedMotion.addEventListener('change', () => { ready = false; loadedSource = ''; load(); });
  // Retain the selected source across orientation changes; dimensions alone adapt.
  if ('ResizeObserver' in window) new ResizeObserver(measure).observe(pin);
  document.fonts?.ready.then(measure);
  load();
})();
