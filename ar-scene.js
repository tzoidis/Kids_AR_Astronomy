/* ===== ar-scene.js — Core AR / Celestial Logic ===== */

const AstroScene = (() => {
  const DEG = Math.PI / 180;
  const RAD = 180 / Math.PI;
  const SKY_RADIUS = 500;

  let mode = 'none'; // 'ar' | 'planetarium' | 'fallback'
  let latitude = 37.98;  // Default: Athens, Greece
  let longitude = 23.73;
  let compassOffset = 0; // degrees, true-north correction
  let scene, camera;
  let constellationEntities = {}; // id → { group }
  let gazeInterval = null;
  let lastGazedId = null;
  let onConstellationGaze = null; // callback(constellationId)
  let onConstellationTap = null;  // callback(constellationId)

  // Compass smoothing state
  let compassSmoothed = null;     // smoothed heading (degrees)
  let compassSamples = [];        // recent raw samples for stability check
  const COMPASS_SMOOTH_FACTOR = 0.15; // lower = smoother but laggier
  const COMPASS_SAMPLE_WINDOW = 20;   // samples to keep for stability
  let compassStale = false;       // true when sensor stops updating
  let compassLastEventTime = 0;   // timestamp of last orientation event

  // Screen-space label tracking
  let screenPositions = {}; // id → { x, y, visible }
  let labelUpdateRunning = false;

  // Fallback canvas state
  let fallbackCtx = null;
  let fallbackHitAreas = []; // {id, x, y, r}
  let fallbackBgStars = [];
  let fallbackShootingStars = [];
  let fallbackTapPulse = null;
  let fallbackStarPos = {};
  let fallbackCentroidPos = {};
  let fallbackCircle = { cx: 0, cy: 0, r: 0 };
  let shootingStarNextSpawn = 0;
  let fallbackDragAngle = 0;      // degrees offset from real-time
  let fallbackDragging = false;
  let fallbackDragStartAngle = 0;
  let fallbackDragStartOffset = 0;
  let fallbackSnapBack = false;
  let fallbackDragMoved = false;
  let fallbackHorizonPath = [];
  let fallbackStarAlts = {};       // id → [alt0, alt1, …]

  /* ---- Celestial Math ---- */

  function julianDate(date) {
    const y = date.getUTCFullYear();
    const m = date.getUTCMonth() + 1;
    const d = date.getUTCDate() +
      (date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600) / 24;
    let Y = y, M = m;
    if (M <= 2) { Y -= 1; M += 12; }
    const A = Math.floor(Y / 100);
    const B = 2 - A + Math.floor(A / 4);
    return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + d + B - 1524.5;
  }

  function localSiderealTime(jd, lonDeg) {
    const T = (jd - 2451545.0) / 36525.0;
    let gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) +
      0.000387933 * T * T - T * T * T / 38710000.0;
    gmst = ((gmst % 360) + 360) % 360;
    return ((gmst + lonDeg) % 360 + 360) % 360; // degrees
  }

  /* RA (hours), Dec (degrees) → Alt, Az (degrees) */
  function raDecToAltAz(raH, decDeg, lstDeg, latDeg) {
    const ha = (lstDeg - raH * 15 + 360) % 360;
    const haR = ha * DEG;
    const decR = decDeg * DEG;
    const latR = latDeg * DEG;

    const sinAlt = Math.sin(decR) * Math.sin(latR) +
      Math.cos(decR) * Math.cos(latR) * Math.cos(haR);
    const alt = Math.asin(sinAlt);

    const cosAz = (Math.sin(decR) - Math.sin(alt) * Math.sin(latR)) /
      (Math.cos(alt) * Math.cos(latR));
    let az = Math.acos(Math.max(-1, Math.min(1, cosAz)));
    if (Math.sin(haR) > 0) az = 2 * Math.PI - az;

    return { alt: alt * RAD, az: az * RAD };
  }

  /* Alt/Az → A-Frame XYZ on a sphere (Y=up, -Z=north at az=0) */
  function altAzToXYZ(altDeg, azDeg, radius) {
    const altR = altDeg * DEG;
    const azR = azDeg * DEG;
    const x = radius * Math.cos(altR) * Math.sin(azR);
    const y = radius * Math.sin(altR);
    const z = -radius * Math.cos(altR) * Math.cos(azR);
    return { x, y, z };
  }

  /* Compute all star positions for current time/location */
  function computePositions() {
    const now = new Date();
    const jd = julianDate(now);
    const lst = localSiderealTime(jd, longitude);

    const results = {};
    Object.entries(CONSTELLATIONS).forEach(([id, c]) => {
      results[id] = {
        stars: c.stars.map(s => {
          const { alt, az } = raDecToAltAz(s.raH, s.decDeg, lst, latitude);
          const pos = altAzToXYZ(alt, az, SKY_RADIUS);
          return { ...s, alt, az, pos };
        }),
        centroid: (() => {
          const { alt, az } = raDecToAltAz(c.centroidRA, c.centroidDec, lst, latitude);
          return { alt, az, pos: altAzToXYZ(alt, az, SKY_RADIUS) };
        })(),
      };
    });
    return results;
  }

  /* ---- Camera Passthrough ---- */

  async function startCamera() {
    const video = document.getElementById('camera-feed');
    if (!video) return false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      video.srcObject = stream;
      await video.play();
      video.style.display = 'block';
      return true;
    } catch (e) {
      console.warn('Camera not available:', e);
      video.style.display = 'none';
      return false;
    }
  }

  /* ---- Compass ---- */

  /**
   * Smooth angular interpolation that handles the 0°/360° wraparound.
   * Returns a new angle between 0–360.
   */
  function lerpAngle(current, target, factor) {
    let diff = target - current;
    // Wrap to [-180, 180]
    while (diff > 180) diff -= 360;
    while (diff < -180) diff += 360;
    let result = current + diff * factor;
    return ((result % 360) + 360) % 360;
  }

  /**
   * Compute heading stability: standard deviation of recent samples.
   * High values → sensor is unreliable / drifting.
   */
  function compassStability() {
    if (compassSamples.length < 5) return 999;
    // Use circular mean/variance
    let sinSum = 0, cosSum = 0;
    for (const s of compassSamples) {
      sinSum += Math.sin(s * DEG);
      cosSum += Math.cos(s * DEG);
    }
    sinSum /= compassSamples.length;
    cosSum /= compassSamples.length;
    const R = Math.sqrt(sinSum * sinSum + cosSum * cosSum);
    // Circular std dev in degrees (0 = perfectly stable)
    return Math.sqrt(-2 * Math.log(Math.max(R, 0.001))) * RAD;
  }

  function initCompass() {
    const handler = (e) => {
      let heading = null;
      if (e.webkitCompassHeading !== undefined) {
        heading = e.webkitCompassHeading; // iOS
      } else if (e.alpha !== null) {
        heading = (360 - e.alpha) % 360; // Android
      }
      if (heading === null) return;

      compassLastEventTime = Date.now();
      compassStale = false;

      // Track raw samples for stability measurement
      compassSamples.push(heading);
      if (compassSamples.length > COMPASS_SAMPLE_WINDOW) {
        compassSamples.shift();
      }

      // Apply exponential smoothing with wraparound handling
      if (compassSmoothed === null) {
        compassSmoothed = heading; // first reading — accept as-is
      } else {
        // If reading jumps wildly (>90°), use slower smoothing to dampen
        let diff = Math.abs(heading - compassSmoothed);
        if (diff > 180) diff = 360 - diff;
        const factor = diff > 90 ? COMPASS_SMOOTH_FACTOR * 0.3 : COMPASS_SMOOTH_FACTOR;
        compassSmoothed = lerpAngle(compassSmoothed, heading, factor);
      }

      compassOffset = compassSmoothed;
    };

    if (window.DeviceOrientationAbsoluteEvent) {
      window.addEventListener('deviceorientationabsolute', handler, true);
    } else {
      window.addEventListener('deviceorientation', handler, true);
    }

    // iOS 13+ requires permission
    if (typeof DeviceOrientationEvent !== 'undefined' &&
        typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().catch(() => {});
    }

    // Detect stale sensor (stops sending events)
    setInterval(() => {
      if (compassLastEventTime > 0 && Date.now() - compassLastEventTime > 3000) {
        compassStale = true;
      }
    }, 2000);
  }

  /* ---- Geolocation ---- */

  function initGeolocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        latitude = pos.coords.latitude;
        longitude = pos.coords.longitude;
        updatePositions();
      },
      () => { /* Use default Athens coords */ },
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  /* ---- A-Frame Scene Setup ---- */

  function hasGyroscope() {
    return 'DeviceOrientationEvent' in window;
  }

  function initARScene() {
    scene = document.querySelector('a-scene');
    camera = document.getElementById('ar-camera');
    if (!scene) return;

    // Build constellation entities
    const positions = computePositions();

    Object.entries(CONSTELLATIONS).forEach(([id, c]) => {
      const data = positions[id];
      const group = document.createElement('a-entity');
      group.setAttribute('id', 'cg-' + id);

      // Stars
      data.stars.forEach((s, i) => {
        const star = document.createElement('a-sphere');
        const size = Math.max(2, 5 - s.mag);
        star.setAttribute('position', `${s.pos.x} ${s.pos.y} ${s.pos.z}`);
        star.setAttribute('radius', size);
        star.setAttribute('color', s.mag < 1.5 ? '#FFD700' : '#FFFDE7');
        star.setAttribute('material', 'shader: flat; opacity: 0.95');
        star.classList.add('star-sphere');
        star.dataset.constellation = id;
        star.dataset.starIndex = i;
        group.appendChild(star);
      });

      // Constellation lines
      c.lines.forEach(([a, b]) => {
        const sa = data.stars[a].pos;
        const sb = data.stars[b].pos;
        const line = document.createElement('a-entity');
        line.setAttribute('line', `start: ${sa.x} ${sa.y} ${sa.z}; end: ${sb.x} ${sb.y} ${sb.z}; color: rgba(255,255,255,0.5); opacity: 0.5`);
        group.appendChild(line);
      });

      // Tap target — large invisible sphere at centroid
      const tap = document.createElement('a-sphere');
      const cp = data.centroid.pos;
      tap.setAttribute('position', `${cp.x} ${cp.y} ${cp.z}`);
      tap.setAttribute('radius', 30);
      tap.setAttribute('material', 'shader: flat; opacity: 0; side: double');
      tap.setAttribute('class', 'clickable');
      tap.dataset.constellation = id;
      tap.addEventListener('click', () => {
        if (onConstellationTap) onConstellationTap(id);
      });
      group.appendChild(tap);

      scene.appendChild(group);
      constellationEntities[id] = { group };
    });

    // Setup raycaster on camera
    if (camera) {
      camera.setAttribute('raycaster', 'objects: .clickable; far: 600; interval: 2000');
      camera.setAttribute('cursor', 'rayOrigin: mouse; fuse: false');
    }

    // Start the screen-projection loop for labels + visibility
    startLabelTracking();
  }

  function updatePositions() {
    const positions = computePositions();
    Object.entries(CONSTELLATIONS).forEach(([id, c]) => {
      const data = positions[id];
      const group = constellationEntities[id]?.group;
      if (!group) return;

      const spheres = group.querySelectorAll('.star-sphere');
      spheres.forEach((sphere, i) => {
        if (data.stars[i]) {
          const p = data.stars[i].pos;
          sphere.setAttribute('position', `${p.x} ${p.y} ${p.z}`);
        }
      });

      const lines = group.querySelectorAll('[line]');
      let lineIdx = 0;
      c.lines.forEach(([a, b]) => {
        if (lines[lineIdx]) {
          const sa = data.stars[a].pos;
          const sb = data.stars[b].pos;
          lines[lineIdx].setAttribute('line', `start: ${sa.x} ${sa.y} ${sa.z}; end: ${sb.x} ${sb.y} ${sb.z}; color: rgba(255,255,255,0.5); opacity: 0.5`);
        }
        lineIdx++;
      });

      const cp = data.centroid.pos;
      const clickable = group.querySelector('.clickable');
      if (clickable) {
        clickable.setAttribute('position', `${cp.x} ${cp.y} ${cp.z}`);
      }
    });
  }

  /* ---- Screen projection: 3D → 2D for HTML labels & visibility ---- */

  function projectToScreen(worldPos) {
    if (!scene || !scene.camera) return null;

    const threeCamera = scene.camera;
    const vec = new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
    vec.project(threeCamera);

    // vec is now in NDC: x,y in [-1, 1], z for depth
    // Behind camera check: z > 1 means behind
    if (vec.z > 1) return null;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = (vec.x * 0.5 + 0.5) * w;
    const y = (-vec.y * 0.5 + 0.5) * h;

    // Check if on screen (with some margin)
    const margin = 100;
    const onScreen = x > -margin && x < w + margin && y > -margin && y < h + margin;

    return { x, y, onScreen };
  }

  function startLabelTracking() {
    if (labelUpdateRunning) return;
    labelUpdateRunning = true;

    const positions = computePositions();
    // Cache centroid world positions (recalculated on updatePositions)
    let centroidCache = {};
    CONSTELLATION_ORDER.forEach(id => {
      centroidCache[id] = positions[id].centroid.pos;
    });

    function tick() {
      CONSTELLATION_ORDER.forEach(id => {
        // Read centroid from the tap target entity (stays in sync after updatePositions)
        const clickable = constellationEntities[id]?.group?.querySelector('.clickable');
        if (clickable) {
          const pos = clickable.getAttribute('position');
          centroidCache[id] = { x: pos.x, y: pos.y, z: pos.z };
        }

        const projected = projectToScreen(centroidCache[id]);
        if (projected) {
          screenPositions[id] = { x: projected.x, y: projected.y, visible: projected.onScreen };
        } else {
          screenPositions[id] = { x: 0, y: 0, visible: false };
        }
      });

      requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  /* Start gaze checking (AR/planetarium mode) */
  function startGazeDetection() {
    if (gazeInterval) clearInterval(gazeInterval);
    gazeInterval = setInterval(() => {
      if (!camera) return;
      const raycaster = camera.components?.raycaster;
      if (!raycaster) return;
      const intersections = raycaster.intersections;
      if (intersections && intersections.length > 0) {
        const hit = intersections[0].object.el;
        const cId = hit?.dataset?.constellation;
        if (cId && cId !== lastGazedId) {
          lastGazedId = cId;
          if (onConstellationGaze) onConstellationGaze(cId);
        }
      } else {
        lastGazedId = null;
      }
    }, 2000);
  }

  /* ---- Fallback 2D Star Map (Animated Planisphere) ---- */

  /* Simplified mythology silhouettes — normalised [0,1] polygons */
  const CONSTELLATION_ART = {
    orion:          [[.5,.0],[.58,.1],[.78,.0],[.7,.18],[.58,.24],[.72,.55],[.78,1],[.55,.68],[.5,.78],[.45,.68],[.22,1],[.28,.55],[.42,.24],[.3,.18],[.22,.0],[.42,.1]],
    ursaMajor:      [[.0,.15],[.08,.0],[.25,.04],[.5,.07],[.78,.04],[1,.18],[.95,.45],[.8,.68],[.6,.62],[.4,.65],[.18,.52],[.05,.35]],
    ursaMinor:      [[.05,.22],[.15,.0],[.4,.06],[.7,.04],[.95,.2],[.9,.44],[.72,.62],[.42,.58],[.15,.48]],
    cassiopeia:     [[.5,.0],[.6,.12],[.7,.22],[.65,.45],[.6,.65],[.5,.75],[.4,.65],[.35,.45],[.3,.22],[.4,.12]],
    scorpius:       [[.12,.1],[.0,.18],[.1,.28],[.25,.22],[.4,.34],[.55,.5],[.65,.65],[.7,.82],[.62,.95],[.55,.88],[.6,.7],[.48,.52],[.32,.38],[.18,.26]],
    leo:            [[.0,.22],[.05,.05],[.18,.0],[.3,.12],[.4,.22],[.58,.2],[.78,.18],[.95,.32],[1,.48],[.85,.44],[.7,.55],[.52,.68],[.32,.62],[.12,.52]],
    cygnus:         [[.5,.0],[.42,.2],[.0,.28],[.18,.38],[.42,.42],[.5,.52],[.52,.78],[.5,1],[.48,.78],[.5,.52],[.58,.42],[.82,.38],[1,.28],[.58,.2]],
    taurus:         [[.82,.0],[.78,.15],[.65,.3],[.55,.52],[.5,.72],[.45,.52],[.35,.3],[.22,.15],[.18,.0],[.38,.1],[.5,.16],[.62,.1]],
    andromeda:      [[.5,.0],[.56,.15],[.78,.1],[1,.05],[.82,.18],[.58,.26],[.6,.52],[.58,.88],[.5,.72],[.42,.88],[.4,.52],[.42,.26],[.18,.18],[.0,.05],[.22,.1],[.44,.15]],
    hercules:       [[.5,.0],[.58,.14],[.82,.0],[.74,.18],[.6,.26],[.58,.5],[.68,.85],[.55,.72],[.5,.58],[.45,.72],[.32,.85],[.42,.5],[.4,.26],[.26,.18],[.18,.0],[.42,.14]],
    camelopardalis: [[.45,.0],[.55,.0],[.55,.15],[.58,.3],[.65,.44],[.7,.65],[.62,.85],[.55,.62],[.5,.55],[.45,.62],[.38,.85],[.3,.65],[.35,.44],[.42,.3],[.45,.15]],
  };

  function initFallbackMap() {
    const canvas = document.getElementById('fallback-canvas');
    if (!canvas) return;
    canvas.style.display = 'block';
    resizeFallbackCanvas(canvas);
    fallbackCtx = canvas.getContext('2d');

    // Generate twinkling background stars
    const rng = mulberry32(42);
    fallbackBgStars = [];
    for (let i = 0; i < 400; i++) {
      fallbackBgStars.push({
        nx: rng(), ny: rng(),
        r: rng() * 1.8 + 0.2,
        phase: rng() * Math.PI * 2,
        speed: 0.3 + rng() * 1.5,
        maxAlpha: 0.15 + rng() * 0.55,
      });
    }

    computeFallbackLayout();

    /* ── Click (suppressed during drag) ── */
    canvas.addEventListener('click', (e) => {
      if (fallbackDragMoved) return;
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const x = (e.clientX - rect.left) * dpr;
      const y = (e.clientY - rect.top) * dpr;
      for (const area of fallbackHitAreas) {
        const dx = x - area.x, dy = y - area.y;
        if (dx * dx + dy * dy < area.r * area.r) {
          fallbackTapPulse = { id: area.id, start: performance.now(), cx: area.x, cy: area.y };
          if (onConstellationTap) onConstellationTap(area.id);
          break;
        }
      }
    });

    /* ── Touch-to-rotate ── */
    function dragAngleFromEvent(clientX, clientY) {
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - rect.left - rect.width / 2;
      const dy = clientY - rect.top - rect.height * 0.44;
      return Math.atan2(dx, -dy);
    }

    canvas.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1) return;
      fallbackDragStartAngle = dragAngleFromEvent(e.touches[0].clientX, e.touches[0].clientY);
      fallbackDragStartOffset = fallbackDragAngle;
      fallbackDragging = true;
      fallbackSnapBack = false;
      fallbackDragMoved = false;
    }, { passive: true });

    canvas.addEventListener('touchmove', (e) => {
      if (!fallbackDragging || e.touches.length !== 1) return;
      const angle = dragAngleFromEvent(e.touches[0].clientX, e.touches[0].clientY);
      let delta = angle - fallbackDragStartAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      fallbackDragAngle = fallbackDragStartOffset + delta * RAD;
      fallbackDragMoved = true;
      computeFallbackLayout();
    }, { passive: true });

    canvas.addEventListener('touchend', () => {
      fallbackDragging = false;
      fallbackSnapBack = true;
    }, { passive: true });

    /* ── Mouse drag (desktop) ── */
    let mouseDown = false;
    canvas.addEventListener('mousedown', (e) => {
      fallbackDragStartAngle = dragAngleFromEvent(e.clientX, e.clientY);
      fallbackDragStartOffset = fallbackDragAngle;
      fallbackDragging = true;
      fallbackSnapBack = false;
      fallbackDragMoved = false;
      mouseDown = true;
    });
    window.addEventListener('mousemove', (e) => {
      if (!mouseDown) return;
      const angle = dragAngleFromEvent(e.clientX, e.clientY);
      let delta = angle - fallbackDragStartAngle;
      if (delta > Math.PI) delta -= 2 * Math.PI;
      if (delta < -Math.PI) delta += 2 * Math.PI;
      fallbackDragAngle = fallbackDragStartOffset + delta * RAD;
      fallbackDragMoved = true;
      computeFallbackLayout();
    });
    window.addEventListener('mouseup', () => {
      if (mouseDown) { mouseDown = false; fallbackDragging = false; fallbackSnapBack = true; }
    });

    window.addEventListener('resize', () => {
      resizeFallbackCanvas(canvas);
      computeFallbackLayout();
    });

    setInterval(computeFallbackLayout, 120000);
    requestAnimationFrame(fallbackTick);
  }

  function resizeFallbackCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
  }

  /* North-polar equidistant projection (with drag rotation & horizon) */
  function computeFallbackLayout() {
    if (!fallbackCtx) return;
    const W = fallbackCtx.canvas.width;
    const H = fallbackCtx.canvas.height;
    const dpr = window.devicePixelRatio || 1;

    const padding = 50 * dpr;
    const maxR = Math.min(W / 2, H * 0.40) - padding;
    const cx = W / 2;
    const cy = H * 0.44;
    fallbackCircle = { cx, cy, r: maxR };

    const now = new Date();
    const jd = julianDate(now);
    const lst = localSiderealTime(jd, longitude);
    const effectiveLST = lst + fallbackDragAngle;
    const MIN_DEC = -45;
    const decRange = 90 - MIN_DEC;

    /* Project stars */
    fallbackStarPos = {};
    fallbackCentroidPos = {};
    fallbackStarAlts = {};
    fallbackHitAreas = [];

    CONSTELLATION_ORDER.forEach(id => {
      const c = CONSTELLATIONS[id];
      const alts = [];
      const projected = c.stars.map(s => {
        const theta = (effectiveLST - s.raH * 15) * DEG;
        const rNorm = (90 - s.decDeg) / decRange;
        const r = rNorm * maxR;
        const { alt } = raDecToAltAz(s.raH, s.decDeg, effectiveLST, latitude);
        alts.push(alt);
        return { sx: cx + r * Math.sin(theta), sy: cy - r * Math.cos(theta), star: s };
      });
      fallbackStarPos[id] = projected;
      fallbackStarAlts[id] = alts;

      const avgX = projected.reduce((sum, p) => sum + p.sx, 0) / projected.length;
      const avgY = projected.reduce((sum, p) => sum + p.sy, 0) / projected.length;
      fallbackCentroidPos[id] = { sx: avgX, sy: avgY };

      let maxDist = 0;
      projected.forEach(p => {
        const dx = p.sx - avgX, dy = p.sy - avgY;
        maxDist = Math.max(maxDist, Math.sqrt(dx * dx + dy * dy));
      });
      fallbackHitAreas.push({ id, x: avgX, y: avgY, r: Math.max(maxDist + 15 * dpr, 35 * dpr) });
    });

    /* Compute horizon curve (alt = 0 boundary) */
    fallbackHorizonPath = [];
    const latR = latitude * DEG;
    for (let i = 0; i <= 360; i++) {
      const ha = i * DEG;
      const tanDec = -Math.cos(ha) / Math.tan(latR);
      const dec = Math.atan(tanDec) * RAD;
      const rNorm = (90 - dec) / decRange;
      const r = Math.min(rNorm, 1.05) * maxR;
      const theta = (i + fallbackDragAngle) * DEG;
      fallbackHorizonPath.push({ sx: cx + r * Math.sin(theta), sy: cy - r * Math.cos(theta) });
    }
  }

  function fallbackTick(ts) {
    if (mode !== 'fallback') return;

    /* Snap-back rotation toward 0 */
    if (fallbackSnapBack && !fallbackDragging) {
      fallbackDragAngle *= 0.9;
      if (Math.abs(fallbackDragAngle) < 0.3) { fallbackDragAngle = 0; fallbackSnapBack = false; }
      computeFallbackLayout();
    }

    drawFallbackFrame(ts);
    requestAnimationFrame(fallbackTick);
  }

  function drawFallbackFrame(ts) {
    const ctx = fallbackCtx;
    if (!ctx) return;
    const W = ctx.canvas.width;
    const H = ctx.canvas.height;
    const dpr = window.devicePixelRatio || 1;
    const t = ts / 1000;

    ctx.clearRect(0, 0, W, H);

    /* ── 1. Twinkling background stars ── */
    fallbackBgStars.forEach(s => {
      const alpha = s.maxAlpha * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(s.nx * W, s.ny * H, s.r * dpr, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;

    /* ── 2. Shooting stars ── */
    updateShootingStars(ctx, W, H, dpr, t);

    /* ── 3. Sky circle ── */
    const { cx, cy, r: skyR } = fallbackCircle;

    ctx.save();
    ctx.strokeStyle = 'rgba(80, 120, 255, 0.12)';
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = 'rgba(80, 120, 255, 0.25)';
    ctx.shadowBlur = 25 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, skyR);
    grad.addColorStop(0, 'rgba(20, 25, 80, 0.25)');
    grad.addColorStop(0.7, 'rgba(10, 15, 50, 0.15)');
    grad.addColorStop(1, 'rgba(5, 5, 30, 0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI * 2);
    ctx.fill();

    /* ── 4. Horizon shading ── */
    drawHorizonShade(ctx, cx, cy, skyR, dpr);

    // Pole marker
    ctx.save();
    ctx.fillStyle = 'rgba(100, 140, 255, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3 * dpr, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = `${10 * dpr}px "Nunito", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('✦', cx, cy - 6 * dpr);
    ctx.restore();

    /* ── 5. Constellations (art + lines + stars) ── */
    CONSTELLATION_ORDER.forEach(id => {
      const c = CONSTELLATIONS[id];
      const projected = fallbackStarPos[id];
      if (!projected) return;
      const alts = fallbackStarAlts[id] || [];

      // Horizon fade: dim constellations that are mostly below the horizon
      const avgAlt = alts.length ? alts.reduce((s, a) => s + a, 0) / alts.length : 90;
      const horizFade = avgAlt < -10 ? 0.18 : avgAlt < 0 ? 0.18 + ((avgAlt + 10) / 10) * 0.42 : avgAlt < 10 ? 0.6 + (avgAlt / 10) * 0.4 : 1.0;

      // Constellation art silhouette
      drawConstellationArt(ctx, id, projected, dpr, horizFade);

      // Glow lines
      ctx.save();
      ctx.globalAlpha = horizFade;
      ctx.strokeStyle = 'rgba(80, 160, 255, 0.25)';
      ctx.lineWidth = 4 * dpr;
      ctx.shadowColor = 'rgba(80, 160, 255, 0.4)';
      ctx.shadowBlur = 10 * dpr;
      ctx.lineCap = 'round';
      c.lines.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(projected[a].sx, projected[a].sy);
        ctx.lineTo(projected[b].sx, projected[b].sy);
        ctx.stroke();
      });
      ctx.restore();

      // Sharp lines
      ctx.save();
      ctx.globalAlpha = horizFade;
      ctx.strokeStyle = 'rgba(180, 210, 255, 0.5)';
      ctx.lineWidth = 1.5 * dpr;
      ctx.lineCap = 'round';
      c.lines.forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(projected[a].sx, projected[a].sy);
        ctx.lineTo(projected[b].sx, projected[b].sy);
        ctx.stroke();
      });
      ctx.restore();

      // Stars
      projected.forEach((p, i) => {
        const mag = p.star.mag;
        const r = Math.max(2, (5 - mag) * 1.2) * dpr;
        const starFade = (alts[i] != null && alts[i] < 0) ? 0.22 : horizFade;
        ctx.save();
        ctx.globalAlpha = starFade;
        ctx.shadowColor = mag < 1.5 ? '#FFD700' : 'rgba(180, 210, 255, 0.7)';
        ctx.shadowBlur = Math.max(4, (4 - mag) * 3) * dpr;
        ctx.fillStyle = mag < 1.0 ? '#FFD700' : mag < 2.0 ? '#FFF8DC' : '#D8E4FF';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = starFade;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Label
      const centroid = fallbackCentroidPos[id];
      const maxStarY = Math.max(...projected.map(p => p.sy));
      ctx.save();
      ctx.globalAlpha = horizFade;
      ctx.font = `bold ${12 * dpr}px "Fredoka One", sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
      ctx.shadowBlur = 6 * dpr;
      ctx.fillText(c.nameEl, centroid.sx, maxStarY + 8 * dpr);
      ctx.restore();
    });

    /* ── 6. Tap pulse ── */
    if (fallbackTapPulse) {
      const elapsed = (ts - fallbackTapPulse.start) / 1000;
      const duration = 0.8;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        const alpha = 1 - progress;

        ctx.save();
        ctx.strokeStyle = `rgba(255, 215, 0, ${(alpha * 0.7).toFixed(3)})`;
        ctx.lineWidth = 3 * dpr;
        ctx.shadowColor = `rgba(255, 215, 0, ${alpha.toFixed(3)})`;
        ctx.shadowBlur = 15 * dpr;
        ctx.beginPath();
        ctx.arc(fallbackTapPulse.cx, fallbackTapPulse.cy, 15 * dpr + progress * 50 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        const projected = fallbackStarPos[fallbackTapPulse.id];
        if (projected) {
          projected.forEach(p => {
            const r = Math.max(3, (5 - p.star.mag) * 1.5) * dpr;
            ctx.save();
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = '#FFD700';
            ctx.shadowColor = '#FFD700';
            ctx.shadowBlur = 20 * dpr;
            ctx.beginPath();
            ctx.arc(p.sx, p.sy, r * 1.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });
        }
      } else {
        fallbackTapPulse = null;
      }
    }

    /* ── 7. Moon phase widget ── */
    drawMoonWidget(ctx, W, H, dpr);
  }

  /* ── Horizon shade: fill the below-horizon region ── */
  function drawHorizonShade(ctx, cx, cy, skyR, dpr) {
    if (!fallbackHorizonPath.length) return;
    ctx.save();

    // Clip to the sky circle
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI * 2);
    ctx.clip();

    // Horizon curve path (above-horizon interior)
    ctx.beginPath();
    fallbackHorizonPath.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    });
    ctx.closePath();

    // Fill everything OUTSIDE the horizon (using even-odd with a cover rect)
    ctx.rect(cx - skyR - 10, cy - skyR - 10, skyR * 2 + 20, skyR * 2 + 20);
    ctx.fillStyle = 'rgba(5, 8, 25, 0.42)';
    ctx.fill('evenodd');

    // Subtle horizon line glow
    ctx.beginPath();
    fallbackHorizonPath.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.sx, p.sy);
      else ctx.lineTo(p.sx, p.sy);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(80, 140, 200, 0.18)';
    ctx.lineWidth = 1.5 * dpr;
    ctx.shadowColor = 'rgba(80, 140, 200, 0.25)';
    ctx.shadowBlur = 8 * dpr;
    ctx.stroke();

    ctx.restore();
  }

  /* ── Constellation mythology silhouette ── */
  function drawConstellationArt(ctx, id, projected, dpr, horizFade) {
    const art = CONSTELLATION_ART[id];
    if (!art || projected.length < 2) return;

    // Bounding box of projected stars (expanded)
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    projected.forEach(p => {
      if (p.sx < minX) minX = p.sx; if (p.sx > maxX) maxX = p.sx;
      if (p.sy < minY) minY = p.sy; if (p.sy > maxY) maxY = p.sy;
    });
    const padX = Math.max((maxX - minX) * 0.35, 12 * dpr);
    const padY = Math.max((maxY - minY) * 0.35, 12 * dpr);
    minX -= padX; maxX += padX; minY -= padY; maxY += padY;
    const w = maxX - minX;
    const h = maxY - minY;
    if (w < 1 || h < 1) return;

    ctx.save();
    ctx.globalAlpha = 0.07 * horizFade;
    ctx.fillStyle = '#5080dd';
    ctx.shadowColor = 'rgba(60, 100, 220, 0.3)';
    ctx.shadowBlur = 12 * dpr;
    ctx.beginPath();
    art.forEach(([nx, ny], i) => {
      const x = minX + nx * w;
      const y = minY + ny * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ── Moon phase computation ── */
  function getMoonPhase(date) {
    const knownNew = Date.UTC(2000, 0, 6, 18, 14, 0);
    const synodicMonth = 29.53059;
    const days = (date.getTime() - knownNew) / 86400000;
    return ((days % synodicMonth) + synodicMonth) % synodicMonth / synodicMonth;
  }

  function getMoonPhaseName(p) {
    if (p < 0.03 || p > 0.97) return 'Νέα Σελήνη';
    if (p < 0.22) return 'Αύξων Μηνίσκος';
    if (p < 0.28) return 'Πρώτο Τέταρτο';
    if (p < 0.47) return 'Αύξων Αμφίκυρτος';
    if (p < 0.53) return 'Πανσέληνος';
    if (p < 0.72) return 'Φθίνων Αμφίκυρτος';
    if (p < 0.78) return 'Τελευταίο Τέταρτο';
    return 'Φθίνων Μηνίσκος';
  }

  function drawMoonWidget(ctx, W, H, dpr) {
    const phase = getMoonPhase(new Date());
    const moonR = 18 * dpr;
    const mx = W - 55 * dpr;
    const my = 55 * dpr;

    // Moon disc
    ctx.save();
    ctx.shadowColor = 'rgba(255, 255, 200, 0.25)';
    ctx.shadowBlur = 15 * dpr;
    ctx.beginPath();
    ctx.arc(mx, my, moonR, 0, Math.PI * 2);
    ctx.clip();

    // Dark base
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(mx - moonR, my - moonR, moonR * 2, moonR * 2);

    // Lit portion
    ctx.fillStyle = '#FFF8DC';
    ctx.beginPath();
    const sweep = phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
    const tw = moonR * Math.cos(sweep * Math.PI);
    if (phase <= 0.5) {
      ctx.arc(mx, my, moonR, -Math.PI / 2, Math.PI / 2, false);
      ctx.ellipse(mx, my, Math.abs(tw), moonR, 0, Math.PI / 2, -Math.PI / 2, tw > 0);
    } else {
      ctx.arc(mx, my, moonR, Math.PI / 2, -Math.PI / 2, false);
      ctx.ellipse(mx, my, Math.abs(tw), moonR, 0, -Math.PI / 2, Math.PI / 2, tw > 0);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Moon outline
    ctx.save();
    ctx.strokeStyle = 'rgba(200, 200, 180, 0.25)';
    ctx.lineWidth = 1 * dpr;
    ctx.beginPath();
    ctx.arc(mx, my, moonR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Phase label
    ctx.save();
    ctx.font = `${9 * dpr}px "Nunito", sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 200, 0.55)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(getMoonPhaseName(phase), mx, my + moonR + 6 * dpr);

    // "Σελήνη" header
    ctx.font = `bold ${10 * dpr}px "Fredoka One", sans-serif`;
    ctx.fillStyle = 'rgba(255, 255, 200, 0.45)';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Σελήνη', mx, my - moonR - 5 * dpr);
    ctx.restore();
  }

  /* Shooting star spawning & rendering */
  function updateShootingStars(ctx, W, H, dpr, t) {
    if (t > shootingStarNextSpawn) {
      shootingStarNextSpawn = t + 2.5 + Math.random() * 4;
      const angle = Math.PI * 0.1 + Math.random() * Math.PI * 0.3;
      const speed = (150 + Math.random() * 250) * dpr;
      fallbackShootingStars.push({
        startTime: t,
        startX: Math.random() * W * 0.7 + W * 0.1,
        startY: Math.random() * H * 0.3,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        maxLife: 0.4 + Math.random() * 0.4,
        length: (30 + Math.random() * 50) * dpr,
      });
    }

    fallbackShootingStars = fallbackShootingStars.filter(s => {
      const age = t - s.startTime;
      if (age > s.maxLife) return false;

      const x = s.startX + s.vx * age;
      const y = s.startY + s.vy * age;
      const progress = age / s.maxLife;
      const alpha = progress < 0.2 ? progress / 0.2 : 1 - (progress - 0.2) / 0.8;

      const v = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      const tailX = x - (s.vx / v) * s.length;
      const tailY = y - (s.vy / v) * s.length;

      const grad = ctx.createLinearGradient(tailX, tailY, x, y);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0)');
      grad.addColorStop(1, `rgba(255, 255, 255, ${alpha.toFixed(3)})`);

      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5 * dpr;
      ctx.shadowColor = 'rgba(200, 220, 255, 0.4)';
      ctx.shadowBlur = 3 * dpr;
      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.restore();
      return true;
    });
  }

  /* Seeded PRNG (Mulberry32) */
  function mulberry32(a) {
    return function () {
      let t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  /* ---- Planetarium sky ---- */

  function createSkySphere() {
    scene = document.querySelector('a-scene');
    if (!scene) return;

    const sky = document.createElement('a-sphere');
    sky.setAttribute('radius', SKY_RADIUS + 50);
    sky.setAttribute('material', 'shader: flat; color: #0a0a2e; side: back');
    sky.setAttribute('id', 'sky-sphere');
    scene.appendChild(sky);

    const rng = mulberry32(123);
    for (let i = 0; i < 300; i++) {
      const theta = rng() * Math.PI * 2;
      const phi = Math.acos(2 * rng() - 1);
      const r = SKY_RADIUS + 40;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      const dot = document.createElement('a-sphere');
      const size = rng() * 1.2 + 0.3;
      dot.setAttribute('position', `${x} ${y} ${z}`);
      dot.setAttribute('radius', size);
      const brightness = Math.floor(180 + rng() * 75);
      dot.setAttribute('material', `shader: flat; color: rgb(${brightness},${brightness},${Math.min(255, brightness + 30)}); opacity: ${0.4 + rng() * 0.6}`);
      scene.appendChild(dot);
    }
  }

  /* ---- Public API ---- */

  async function init({ onGaze, onTap, requestedMode }) {
    onConstellationGaze = onGaze;
    onConstellationTap = onTap;

    initGeolocation();

    const hasOrientation = hasGyroscope();

    if (requestedMode === 'outdoor') {
      const hasCamera = await startCamera();
      if (hasCamera && hasOrientation) {
        mode = 'ar';
        initCompass();
        initARScene();
        startGazeDetection();
        setInterval(updatePositions, 15000);
      } else {
        if (hasOrientation) {
          requestedMode = 'indoor';
        } else {
          requestedMode = '_fallback';
        }
      }
    }

    if (requestedMode === 'indoor') {
      const video = document.getElementById('camera-feed');
      if (video) video.style.display = 'none';

      if (hasOrientation) {
        mode = 'planetarium';
        const sceneEl = document.querySelector('a-scene');
        if (sceneEl) {
          sceneEl.setAttribute('renderer', 'alpha: false; antialias: true; colorManagement: true');
          sceneEl.style.background = '#0a0a2e';
        }
        createSkySphere();
        initCompass();
        initARScene();
        startGazeDetection();
        setInterval(updatePositions, 15000);
      } else {
        requestedMode = '_fallback';
      }
    }

    if (requestedMode === '_fallback' || mode === 'none') {
      mode = 'fallback';
      const sceneEl = document.querySelector('a-scene');
      if (sceneEl) sceneEl.style.display = 'none';
      const video = document.getElementById('camera-feed');
      if (video) video.style.display = 'none';
      initFallbackMap();
    }

    return mode;
  }

  function getMode() { return mode; }

  function lookAt(constellationId) {
    if (mode !== 'ar' && mode !== 'planetarium') return;
    highlightConstellation(constellationId);
  }

  /* Get constellations currently visible on screen, sorted by distance to center */
  function getVisibleConstellations() {
    if (mode === 'fallback') {
      return [...CONSTELLATION_ORDER];
    }

    const cx = window.innerWidth / 2;
    const cy = window.innerHeight / 2;
    const visible = [];

    CONSTELLATION_ORDER.forEach(id => {
      const sp = screenPositions[id];
      if (sp && sp.visible) {
        const dx = sp.x - cx;
        const dy = sp.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        visible.push({ id, dist });
      }
    });

    visible.sort((a, b) => a.dist - b.dist);
    return visible.map(v => v.id);
  }

  /* Get current screen positions for labels (called by ui.js) */
  function getScreenPositions() {
    return screenPositions;
  }

  function highlightConstellation(id) {
    const group = constellationEntities[id]?.group;
    if (!group) return;
    const stars = group.querySelectorAll('.star-sphere');
    stars.forEach(s => {
      const origColor = s.getAttribute('color');
      s.setAttribute('color', '#FFF');
      s.setAttribute('scale', '1.5 1.5 1.5');
      setTimeout(() => {
        s.setAttribute('color', origColor);
        s.setAttribute('scale', '1 1 1');
      }, 400);
    });
  }

  /**
   * Returns compass health info for the UI.
   * - stability: circular std dev in degrees (lower = better, <15 is good)
   * - stale: true if sensor stopped sending events (>3s gap)
   * - needsCalibration: true if the user should wave the phone in a figure-8
   */
  function getCompassHealth() {
    const stability = compassStability();
    return {
      stability,
      stale: compassStale,
      needsCalibration: compassStale || stability > 25,
    };
  }

  /**
   * Reset compass smoothing — call after user performs calibration gesture.
   */
  function resetCompass() {
    compassSmoothed = null;
    compassSamples = [];
    compassStale = false;
  }

  return { init, getMode, lookAt, highlightConstellation, getVisibleConstellations, getScreenPositions, getCompassHealth, resetCompass };
})();
