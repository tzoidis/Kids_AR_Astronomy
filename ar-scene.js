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

  function initCompass() {
    const handler = (e) => {
      let heading = null;
      if (e.webkitCompassHeading !== undefined) {
        heading = e.webkitCompassHeading; // iOS
      } else if (e.alpha !== null) {
        heading = (360 - e.alpha) % 360; // Android
      }
      if (heading !== null) {
        compassOffset = heading;
      }
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

  /* ---- Fallback 2D Star Map ---- */

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

    canvas.addEventListener('click', (e) => {
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

    window.addEventListener('resize', () => {
      resizeFallbackCanvas(canvas);
      computeFallbackLayout();
    });

    // Recompute projection every 2 min (sky drifts ~0.5°)
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

  /* North-polar equidistant projection: RA/Dec → screen x,y */
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
    const lst = localSiderealTime(jd, longitude); // degrees
    const MIN_DEC = -45;
    const decRange = 90 - MIN_DEC; // 135°

    fallbackStarPos = {};
    fallbackCentroidPos = {};
    fallbackHitAreas = [];

    CONSTELLATION_ORDER.forEach(id => {
      const c = CONSTELLATIONS[id];
      const projected = c.stars.map(s => {
        const theta = (lst - s.raH * 15) * DEG;
        const rNorm = (90 - s.decDeg) / decRange;
        const r = rNorm * maxR;
        return {
          sx: cx + r * Math.sin(theta),
          sy: cy - r * Math.cos(theta),
          star: s,
        };
      });
      fallbackStarPos[id] = projected;

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
  }

  function fallbackTick(ts) {
    if (mode !== 'fallback') return;
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

    // Outer ring glow
    ctx.save();
    ctx.strokeStyle = 'rgba(80, 120, 255, 0.12)';
    ctx.lineWidth = 2 * dpr;
    ctx.shadowColor = 'rgba(80, 120, 255, 0.25)';
    ctx.shadowBlur = 25 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // Inner radial gradient
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, skyR);
    grad.addColorStop(0, 'rgba(20, 25, 80, 0.25)');
    grad.addColorStop(0.7, 'rgba(10, 15, 50, 0.15)');
    grad.addColorStop(1, 'rgba(5, 5, 30, 0.05)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, skyR, 0, Math.PI * 2);
    ctx.fill();

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

    /* ── 4. Constellations ── */
    CONSTELLATION_ORDER.forEach(id => {
      const c = CONSTELLATIONS[id];
      const projected = fallbackStarPos[id];
      if (!projected) return;

      // Glow lines
      ctx.save();
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
      projected.forEach(p => {
        const mag = p.star.mag;
        const r = Math.max(2, (5 - mag) * 1.2) * dpr;
        ctx.save();
        ctx.shadowColor = mag < 1.5 ? '#FFD700' : 'rgba(180, 210, 255, 0.7)';
        ctx.shadowBlur = Math.max(4, (4 - mag) * 3) * dpr;
        ctx.fillStyle = mag < 1.0 ? '#FFD700' : mag < 2.0 ? '#FFF8DC' : '#D8E4FF';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        // Bright core
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.sx, p.sy, r * 0.45, 0, Math.PI * 2);
        ctx.fill();
      });

      // Label below lowest star
      const centroid = fallbackCentroidPos[id];
      const maxStarY = Math.max(...projected.map(p => p.sy));
      ctx.save();
      ctx.font = `bold ${12 * dpr}px "Fredoka One", sans-serif`;
      ctx.fillStyle = '#FFD700';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.shadowColor = 'rgba(255, 215, 0, 0.4)';
      ctx.shadowBlur = 6 * dpr;
      ctx.fillText(c.nameEl, centroid.sx, maxStarY + 8 * dpr);
      ctx.restore();
    });

    /* ── 5. Tap pulse ── */
    if (fallbackTapPulse) {
      const elapsed = (ts - fallbackTapPulse.start) / 1000;
      const duration = 0.8;
      if (elapsed < duration) {
        const progress = elapsed / duration;
        const alpha = 1 - progress;

        // Expanding ring
        ctx.save();
        ctx.strokeStyle = `rgba(255, 215, 0, ${(alpha * 0.7).toFixed(3)})`;
        ctx.lineWidth = 3 * dpr;
        ctx.shadowColor = `rgba(255, 215, 0, ${alpha.toFixed(3)})`;
        ctx.shadowBlur = 15 * dpr;
        ctx.beginPath();
        ctx.arc(fallbackTapPulse.cx, fallbackTapPulse.cy, 15 * dpr + progress * 50 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();

        // Brighten constellation stars
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
        setInterval(updatePositions, 60000);
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
        setInterval(updatePositions, 60000);
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

  return { init, getMode, lookAt, highlightConstellation, getVisibleConstellations, getScreenPositions };
})();
