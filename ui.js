/* ===== ui.js — UI Orchestration ===== */

const AppUI = (() => {
  let currentIndex = 0;
  let panelOpen = false;
  let labelElements = {}; // id → HTMLElement
  let labelAnimFrame = null;

  /* ---- Element references ---- */
  const $ = (sel) => document.querySelector(sel);
  const els = {};

  function cacheElements() {
    els.welcome = $('#welcome-screen');
    els.startOutdoorBtn = $('#start-outdoor-btn');
    els.startIndoorBtn = $('#start-indoor-btn');
    els.uiOverlay = $('#ui-overlay');
    els.labelContainer = $('#label-container');
    els.listenBtn = $('#listen-btn');
    els.nextBtn = $('#next-btn');
    els.prevBtn = $('#prev-btn');
    els.mascot = $('#mascot');
    els.panel = $('#info-panel');
    els.panelName = $('#panel-constellation-name');
    els.panelNameLatin = $('#panel-constellation-name-latin');
    els.panelDesc = $('#panel-constellation-desc');
    els.panelSvg = $('#panel-constellation-svg');
    els.panelListenBtn = $('#panel-listen-btn');
    els.panelCloseBtn = $('#panel-close-btn');
    els.loading = $('#loading-indicator');
  }

  /* ---- Welcome Screen ---- */

  function setupWelcome() {
    const starsBg = els.welcome?.querySelector('.stars-bg');
    if (starsBg) {
      for (let i = 0; i < 60; i++) {
        const dot = document.createElement('div');
        dot.className = 'star-dot';
        dot.style.left = Math.random() * 100 + '%';
        dot.style.top = Math.random() * 100 + '%';
        dot.style.animationDelay = (Math.random() * 2) + 's';
        dot.style.animationDuration = (1.5 + Math.random() * 2) + 's';
        starsBg.appendChild(dot);
      }
    }

    els.startOutdoorBtn?.addEventListener('click', () => handleStart('outdoor'));
    els.startIndoorBtn?.addEventListener('click', () => handleStart('indoor'));
  }

  async function handleStart(requestedMode) {
    GreekTTS.unlock();

    if (els.loading) els.loading.classList.add('active');
    if (els.welcome) {
      els.welcome.style.opacity = '0';
      els.welcome.style.transition = 'opacity 0.4s';
    }

    // Request iOS device orientation permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      try {
        await DeviceOrientationEvent.requestPermission();
      } catch (e) { /* User denied, we'll use fallback */ }
    }

    const mode = await AstroScene.init({
      onGaze: handleConstellationGaze,
      onTap: handleConstellationTap,
      requestedMode,
    });

    if (els.loading) els.loading.classList.remove('active');
    if (els.welcome) els.welcome.style.display = 'none';
    if (els.uiOverlay) els.uiOverlay.style.display = 'block';

    // Create HTML labels for 3D modes (ar / planetarium)
    if (mode === 'ar' || mode === 'planetarium') {
      createLabels();
      startLabelLoop();
    }

    speakCurrentIntro();
  }

  /* ---- HTML Labels (screen-projected) ---- */

  function createLabels() {
    if (!els.labelContainer) return;
    CONSTELLATION_ORDER.forEach(id => {
      const c = CONSTELLATIONS[id];
      const el = document.createElement('div');
      el.className = 'sky-label';
      el.textContent = c.nameEl;
      el.dataset.constellation = id;
      el.addEventListener('click', () => {
        handleConstellationTap(id);
      });
      els.labelContainer.appendChild(el);
      labelElements[id] = el;
    });
  }

  function startLabelLoop() {
    function tick() {
      const positions = AstroScene.getScreenPositions();
      CONSTELLATION_ORDER.forEach(id => {
        const el = labelElements[id];
        if (!el) return;
        const sp = positions[id];
        if (sp && sp.visible) {
          el.style.left = sp.x + 'px';
          el.style.top = sp.y + 'px';
          el.classList.add('visible');
        } else {
          el.classList.remove('visible');
        }
      });
      labelAnimFrame = requestAnimationFrame(tick);
    }
    labelAnimFrame = requestAnimationFrame(tick);
  }

  /* ---- Constellation Navigation ---- */

  function currentConstellation() {
    return CONSTELLATIONS[CONSTELLATION_ORDER[currentIndex]];
  }

  function currentId() {
    return CONSTELLATION_ORDER[currentIndex];
  }

  function goToConstellation(index) {
    currentIndex = ((index % CONSTELLATION_ORDER.length) + CONSTELLATION_ORDER.length) % CONSTELLATION_ORDER.length;
    AstroScene.lookAt(currentId());
    speakCurrentIntro();
  }

  function speakCurrentIntro() {
    const id = currentId();
    const narration = NARRATIONS[id];
    if (narration) {
      GreekTTS.speak(narration.intro);
    }
  }

  function speakCurrentDetail() {
    const id = currentId();
    const narration = NARRATIONS[id];
    if (narration) {
      GreekTTS.speak(narration.detail);
    }
  }

  /* Speak about whatever constellation is most centered on screen */
  function speakVisible() {
    const visible = AstroScene.getVisibleConstellations();
    if (visible.length === 0) {
      GreekTTS.speak('Κούνα το κινητό σου για να βρεις αστερισμούς!');
      return;
    }
    const id = visible[0];
    const idx = CONSTELLATION_ORDER.indexOf(id);
    if (idx !== -1) currentIndex = idx;
    const narration = NARRATIONS[id];
    if (narration) {
      GreekTTS.speak(narration.intro);
    }
  }

  /* ---- Info Panel ---- */

  function openPanel(constellationId) {
    const c = CONSTELLATIONS[constellationId];
    if (!c) return;

    if (els.panelName) els.panelName.textContent = c.nameEl;
    if (els.panelNameLatin) els.panelNameLatin.textContent = c.nameLatin;

    const narration = NARRATIONS[constellationId];
    if (els.panelDesc) els.panelDesc.textContent = narration?.detail || '';

    if (els.panelSvg) {
      els.panelSvg.innerHTML = '';
      const img = document.createElement('img');
      img.src = `assets/constellations/${constellationId}.svg`;
      img.alt = c.nameEl;
      img.style.width = '100%';
      img.style.height = '100%';
      img.onerror = () => { img.style.display = 'none'; };
      els.panelSvg.appendChild(img);
    }

    if (els.panel) els.panel.classList.add('open');
    panelOpen = true;
  }

  function closePanel() {
    if (els.panel) els.panel.classList.remove('open');
    panelOpen = false;
  }

  /* ---- Event Handlers ---- */

  function handleConstellationGaze(id) {
    const idx = CONSTELLATION_ORDER.indexOf(id);
    if (idx !== -1 && idx !== currentIndex) {
      currentIndex = idx;
      speakCurrentIntro();
    }
  }

  function handleConstellationTap(id) {
    const idx = CONSTELLATION_ORDER.indexOf(id);
    if (idx !== -1) currentIndex = idx;
    createSparkle();
    openPanel(id);
    speakCurrentIntro();
  }

  /* ---- Sparkle Effect ---- */

  function createSparkle(x, y) {
    if (x === undefined) x = window.innerWidth / 2;
    if (y === undefined) y = window.innerHeight / 2;

    const container = document.createElement('div');
    container.className = 'sparkle';
    container.style.left = x + 'px';
    container.style.top = y + 'px';

    const colors = ['#FFD700', '#FFA500', '#FFFDE7', '#FF69B4', '#00BFFF'];
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('div');
      p.className = 'sparkle-particle';
      const angle = (i / 12) * Math.PI * 2;
      const dist = 30 + Math.random() * 40;
      p.style.setProperty('--dx', Math.cos(angle) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(angle) * dist + 'px');
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = (Math.random() * 0.15) + 's';
      container.appendChild(p);
    }

    document.body.appendChild(container);
    setTimeout(() => container.remove(), 900);
  }

  /* ---- Wire Events ---- */

  function wireEvents() {
    els.listenBtn?.addEventListener('click', () => {
      createSparkle();
      speakVisible();
    });

    els.nextBtn?.addEventListener('click', () => {
      goToConstellation(currentIndex + 1);
    });

    els.prevBtn?.addEventListener('click', () => {
      goToConstellation(currentIndex - 1);
    });

    els.panelListenBtn?.addEventListener('click', () => {
      createSparkle();
      speakCurrentDetail();
    });

    els.panelCloseBtn?.addEventListener('click', closePanel);

    els.mascot?.addEventListener('click', () => {
      createSparkle();
      GreekTTS.speak('Γεια σου! Πάμε να εξερευνήσουμε τα αστέρια!');
    });

    els.uiOverlay?.addEventListener('click', (e) => {
      if (panelOpen && e.target === els.uiOverlay) {
        closePanel();
      }
    });
  }

  /* ---- Init ---- */

  function init() {
    cacheElements();
    setupWelcome();
    wireEvents();
    GreekTTS.init();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { init, openPanel, closePanel, createSparkle };
})();
