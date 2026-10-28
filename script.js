/* =========================================================
   Flow Quest — a charity: water game prototype
   Two roles:
     • Villager  — catch clean rain, purify it, keep the village's water up.
     • Volunteer — load cases of clean water onto the delivery truck.
   ========================================================= */
(() => {
  'use strict';

  // ---------- Settings ----------
  const CFG = {
    baseH: 420,          // logical game height (world units)
    minW: { village: 380, warehouse: 520 }, // narrowest logical width before we scale down
    // Phones held upright get a zoomed-in camera that follows the player
    phoneMaxWidth: 600,  // stage widths (CSS px) below this use the follow camera
    phoneBaseH: 340,     // logical height shown on phones (smaller = bigger art)
    phoneViewW: 300,     // narrowest logical slice of the world shown at once
    phoneWorldW: 760,    // full world width on phones (same layout as a laptop)
    maxHearts: 3,
    maxLevel: 5,
    gravity: 1500,
    jumpV: 640,
    speed: 270,
    // Villager
    canCapacity: 10,     // drops the jerry can holds
    waterPerDrop: 4,     // village water gained per purified drop
    purifyTime: 2.4,     // seconds for the filter to finish
    startWater: 20,
    maxWater: 100,
    startLivestock: 5,
    // Volunteer
    carryMax: 3,         // cases you can hold at once
    beltSpeed: 70,
    crateSize: 26,
    warehouseWalk: 420,  // belt-to-truck distance the timers are balanced for (phones and small windows)
  };

  // Difficulty changes each level's goal, the pace, and the time limits.
  //   goal       village tank needed to clear a level
  //   drain/rain/dirty  how fast the village uses water, how fast drops fall, how often they're polluted
  //   truckTime/truckLoad  truck timer multiplier and extra cases needed per truck
  //   leak/lift  how often cases leak and how fast the forklift drives
  const DIFFICULTY = {
    easy:   { goal: 80,  drain: 0.7,  rain: 0.85, dirty: 0.7,  truckTime: 1.3, truckLoad: -2, leak: 0.7,  lift: 0.8 },
    normal: { goal: 100, drain: 1,    rain: 1,    dirty: 1,    truckTime: 1,   truckLoad: 0,  leak: 1,    lift: 1 },
    hard:   { goal: 120, drain: 1.35, rain: 1.2,  dirty: 1.35, truckTime: 1.2, truckLoad: 2,  leak: 1.2,  lift: 1.25 },
  };
  let difficulty = 'normal';
  try { if (DIFFICULTY[localStorage.getItem('flowquest-difficulty')]) difficulty = localStorage.getItem('flowquest-difficulty'); } catch (_) { /* storage unavailable */ }
  const diff = () => DIFFICULTY[difficulty];

  // Milestones: a badge pops up as the player passes each checkpoint of a level
  // (the village tank, or the current truck's load)
  const MILESTONES = [
    { at: 0.25, key: 'ms25' },
    { at: 0.5, key: 'ms50' },
    { at: 0.75, key: 'ms75' },
  ];

  // Sound effects made for this game (assets/sounds). Browsers only allow audio
  // after the player taps or presses a key, so they load on the first interaction.
  const SOUND_NAMES = ['catch', 'hurt', 'pickup', 'filter', 'milestone', 'levelup', 'win', 'lose', 'click'];
  const sound = { ctx: null, buffers: {}, on: true };
  try { sound.on = localStorage.getItem('flowquest-sound') !== 'off'; } catch (_) { /* storage unavailable */ }
  function unlockSound() {
    if (sound.ctx) {
      if (sound.ctx.state === 'suspended') sound.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    sound.ctx = new AC();
    SOUND_NAMES.forEach((name) => {
      fetch(`assets/sounds/${name}.wav`)
        .then((r) => r.arrayBuffer())
        .then((data) => new Promise((ok, fail) => sound.ctx.decodeAudioData(data, ok, fail)))
        .then((buf) => { sound.buffers[name] = buf; })
        .catch(() => { /* play silently without this one */ });
    });
  }
  window.addEventListener('pointerdown', unlockSound);
  window.addEventListener('keydown', unlockSound);
  function sfx(name, volume = 0.6) {
    if (!sound.on || !sound.ctx || !sound.buffers[name]) return;
    const src = sound.ctx.createBufferSource();
    const gain = sound.ctx.createGain();
    gain.gain.value = volume;
    src.buffer = sound.buffers[name];
    src.connect(gain).connect(sound.ctx.destination);
    src.start();
  }

  // Translations live in i18n.js. tr('key') returns the text in the current language.
  const tr = (key, vars) => window.I18N.t(key, vars);
  // In Arabic the whole game is mirrored so it reads right to left
  const isRTL = () => window.I18N.rtl;

  // Translation keys for text that changes with the chosen role
  const MODE_TEXT = {
    village: {
      bar: 'barVillage', progress: 'progVillage', carry: 'carryCan',
      herd: 'herdLivestock', icon: '#i-goat', endHerd: 'herdLivestock', help: 'helpVillager',
    },
    warehouse: {
      bar: 'barTruck', progress: 'progTruck', carry: 'carrying',
      herd: 'herdTrucks', icon: '#i-truck', endHerd: 'herdTrucks', help: 'helpVolunteer',
    },
  };

  // ---------- DOM ----------
  const $ = (id) => document.getElementById(id);
  const canvas = $('game');
  let ctx = canvas.getContext('2d');
  const stage = $('stage');
  const ui = {
    waterFill: $('waterFill'), waterText: $('waterText'), bar: document.querySelector('.bar'), barLabel: $('barLabel'),
    score: $('score'), hearts: $('hearts'), level: $('level'), levelTop: $('levelTop'),
    livestock: $('livestock'), livestockTop: $('livestockTop'), pen: $('pen'),
    herdLabel: $('herdLabel'), herdIcon: $('herdIcon'), progressTitle: $('progressTitle'),
    carry: $('carry'), carryLabel: $('carryLabel'), tray: $('tray'), status: $('purifyStatus'),
    steps: [],
    actBtns: [...document.querySelectorAll('[data-control="act"]')],
    toast: $('toast'),
    startOverlay: $('startOverlay'), helpOverlay: $('helpOverlay'),
    menuOverlay: $('menuOverlay'), endOverlay: $('endOverlay'),
  };

  const isTouch = window.matchMedia('(pointer: coarse)').matches;
  if (isTouch) document.body.classList.add('touch');

  // ---------- World sizing ----------
  let W = 800, H = 540, scale = 1, dpr = 1;
  // viewW = how much of the world fits on screen; camX = how far the camera has scrolled
  let viewW = 800, camX = 0, followCam = false, snapCam = true;
  // Landscape phones float the buttons over the game, so the floor sits a little higher
  const landscapeMQ = window.matchMedia('(max-height: 500px) and (orientation: landscape)');
  let overlayControls = landscapeMQ.matches;
  const world = {};

  function seeded(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function layout() {
    world.groundY = H - Math.max(overlayControls ? 92 : 60, H * 0.13);
    // Village scene
    world.houseX = W * 0.11;
    world.pondL = W * 0.36;
    world.pondR = W * 0.64;
    world.stationX = W * 0.5;
    world.signX = W - Math.max(74, W * 0.17);
    world.rocks = [0.27, 0.7, 0.76].map((f, i) => ({ x: W * f, r: 9 + i * 3 }));
    // Warehouse scene
    world.beltEnd = Math.max(100, W * 0.2);
    world.truckBack = W - Math.max(124, W * 0.24);   // left edge of the truck's cargo box
    // narrow screens: tuck the bin under the start of the belt so the floor stays clear
    world.binX = W < 600 ? 28 : W * 0.46;
    // forklift stays clear of the belt pickup and the truck's loading spot
    world.liftMin = world.beltEnd + 70;
    world.liftMax = Math.max(world.liftMin + 20, world.truckBack - 105);
    // fixed random scenery details
    const r = seeded(11);
    world.tufts = Array.from({ length: Math.floor(W / 12) }, () => ({ x: r() * W, y: r(), h: 3 + r() * 6, lean: r() * 2 - 1 }));
    world.speck = Array.from({ length: Math.floor(W / 6) }, () => ({ x: r() * W, y: r(), w: 2 + r() * 7, a: r() }));
    world.motes = Array.from({ length: 40 }, () => ({ x: r(), y: r(), s: 0.6 + r() * 1.4, v: 4 + r() * 10, p: r() * 6 }));
  }

  function resize() {
    const r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    const oldW = W;
    // Phones have very sharp screens; 1.5x looks the same and draws far fewer pixels
    dpr = Math.min(window.devicePixelRatio || 1, isTouch ? 1.5 : 2);
    overlayControls = landscapeMQ.matches;
    followCam = r.width < CFG.phoneMaxWidth;
    if (followCam) {
      // Phone held upright: zoom in and let the camera follow the player
      scale = Math.min(r.height / CFG.phoneBaseH, r.width / CFG.phoneViewW);
      viewW = r.width / scale;
      W = Math.max(viewW, CFG.phoneWorldW);
    } else {
      // landscape phones are short, so they use the phone height to keep the art big
      const baseH = overlayControls ? CFG.phoneBaseH : CFG.baseH;
      scale = Math.min(r.height / baseH, r.width / CFG.minW[mode]);
      W = r.width / scale;
      viewW = W;
    }
    H = r.height / scale;
    snapCam = true;
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    layout();
    if (S) {
      const k = W / oldW;
      S.player.x *= k;
      S.player.y = Math.min(S.player.y, world.groundY - S.player.h);
      if (S.mode === 'village') {
        S.guard.x *= k;
        S.trash.forEach((t) => (t.x *= k));
      } else {
        S.lift.x = clamp(S.lift.x * k, world.liftMin, world.liftMax);
        S.spills.forEach((s) => (s.x *= k));
        S.belt.forEach((c) => (c.x = Math.min(c.x * k, world.beltEnd - CFG.crateSize / 2)));
      }
    }
  }

  // ---------- Game state ----------
  let S = null;
  let mode = 'village';

  function applyModeText() {
    const t = MODE_TEXT[mode];
    ui.barLabel.textContent = tr(t.bar);
    ui.progressTitle.textContent = tr(t.progress);
    ui.carryLabel.textContent = tr(t.carry);
    ui.herdLabel.textContent = tr(t.herd);
    ui.herdIcon.querySelector('use').setAttribute('href', t.icon);
    $('endHerdLabel').textContent = tr(t.endHerd);
    $('helpTitle').textContent = tr(t.help);
  }

  function setMode(m) {
    mode = m;
    document.body.dataset.mode = m;
    applyModeText();
    ui.steps = [...document.querySelectorAll(`.steps[data-mode="${m}"] .step`)];
    for (const k in cache) delete cache[k];
    resize(); // each role has its own minimum world width
  }

  function newGame(m = mode) {
    setMode(m);
    layout();
    const base = {
      mode: m,
      running: false, paused: false, over: false,
      score: 0, hearts: CFG.maxHearts, level: 1,
      player: { x: W * 0.22, y: world.groundY - 64, vx: 0, vy: 0, w: 24, h: 64, onGround: true, facing: 1, invuln: 0, walk: 0 },
      particles: [], popups: [],
      time: 0, shake: 0, lastWarn: -10,
      clouds: Array.from({ length: 5 }, (_, i) => ({ fx: i / 5 + Math.random() * 0.1, y: 0.15 + Math.random() * 0.3, s: 0.7 + Math.random() * 0.8, v: 4 + Math.random() * 6 })),
    };
    if (m === 'village') {
      S = Object.assign(base, {
        water: CFG.startWater, livestock: CFG.startLivestock, carry: 0,
        guard: { x: world.signX + 50, dir: 1, alert: 0, walk: 0 },
        drops: [], trash: [],
        spawnT: 0.6, trashT: 5,
        purify: { active: false, t: 0, amount: 0, done: 0 },
      });
    } else {
      base.player.x = world.beltEnd + 30;
      S = Object.assign(base, {
        stack: [],                 // cases in your hands: true = leaking
        belt: [], beltT: 0.2,
        lift: { x: (world.liftMin + world.liftMax) / 2, dir: 1, honk: 0 },
        spills: [], spillT: 8,
        truck: makeTruck(1, 0),
        trucksSent: 0,
        deliveredFlash: 0,
      });
    }
    renderPen(true);
    renderHearts();
    ui.tray.innerHTML = '';
    resetMilestones();
    snapCam = true;
  }

  function makeTruck(level, arriving = 1.2) {
    const time = Math.round(Math.max(30, 46 - level * 3) * diff().truckTime);
    return {
      load: 0,
      target: 6 + level * 2 + diff().truckLoad,
      time,
      maxTime: time,
      leaving: 0,         // > 0 while driving away
      arriving,           // > 0 while pulling in
      full: false,
    };
  }

  // ---------- Input ----------
  const input = { left: false, right: false, up: false, down: false };
  let actQueued = false;

  const KEYMAP = {
    ArrowLeft: 'left', a: 'left', A: 'left',
    ArrowRight: 'right', d: 'right', D: 'right',
    ArrowUp: 'up', w: 'up', W: 'up', ' ': 'up',
    ArrowDown: 'down', s: 'down', S: 'down',
  };

  window.addEventListener('keydown', (e) => {
    if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
      if (S.running && !S.over) togglePause();
      return;
    }
    if (e.key === 'e' || e.key === 'E' || e.key === 'Enter') {
      if (S.running && !S.paused) { actQueued = true; e.preventDefault(); }
      return;
    }
    const k = KEYMAP[e.key];
    if (k) {
      input[k] = true;
      if (S.running) e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => {
    const k = KEYMAP[e.key];
    if (k) input[k] = false;
  });
  window.addEventListener('blur', () => Object.keys(input).forEach((k) => (input[k] = false)));

  // On-screen buttons (desktop panel + mobile touch bar)
  document.querySelectorAll('[data-control]').forEach((btn) => {
    const name = btn.dataset.control;
    const press = (e) => {
      e.preventDefault();
      btn.classList.add('pressed');
      if (btn.setPointerCapture && e.pointerId !== undefined) {
        try { btn.setPointerCapture(e.pointerId); } catch (_) { /* ignore */ }
      }
      if (name === 'act') actQueued = true;
      else input[name] = true;
    };
    const release = () => {
      btn.classList.remove('pressed');
      if (name !== 'act') input[name] = false;
    };
    btn.addEventListener('pointerdown', press);
    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
    btn.addEventListener('contextmenu', (e) => e.preventDefault());
  });

  // ---------- Menus ----------
  function show(el, on) { el.classList.toggle('show', on); }

  function startRole(m) {
    [ui.startOverlay, ui.menuOverlay, ui.endOverlay, ui.helpOverlay].forEach((o) => show(o, false));
    newGame(m);
    S.running = true;
    toast(tr(m === 'village' ? 'startVillage' : 'startWarehouse'), 2600);
  }

  function openRoleSelect() {
    [ui.menuOverlay, ui.endOverlay, ui.helpOverlay].forEach((o) => show(o, false));
    S.running = false;
    show(ui.startOverlay, true);
  }

  document.querySelectorAll('.role').forEach((btn) => {
    btn.addEventListener('click', () => startRole(btn.dataset.mode));
  });
  // The ☰ button pauses a game in progress; on the role or end screen it opens
  // the general menu (sound, charity: water links) on top of that screen
  const inGame = () => S.running && !S.over;
  function openHomeMenu(open) {
    ui.menuOverlay.dataset.context = 'home';
    show(ui.menuOverlay, open);
  }
  $('menuBtn').addEventListener('click', () => {
    if (inGame()) togglePause(true);
    else openHomeMenu(!ui.menuOverlay.classList.contains('show'));
  });
  $('menuCloseBtn').addEventListener('click', () => openHomeMenu(false));
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !inGame() && ui.menuOverlay.classList.contains('show')) openHomeMenu(false);
  });
  $('resumeBtn').addEventListener('click', () => togglePause(false));
  $('helpBtn').addEventListener('click', () => {
    show(ui.menuOverlay, false);
    show(ui.helpOverlay, true);
  });
  $('helpCloseBtn').addEventListener('click', () => {
    show(ui.helpOverlay, false);
    S.paused = false;
  });
  $('restartBtn').addEventListener('click', () => startRole(mode));
  $('switchBtn').addEventListener('click', openRoleSelect);
  // Reset: restart the current role from scratch whenever the player wants
  $('resetBtn').addEventListener('click', () => {
    if (ui.startOverlay.classList.contains('show')) {
      toast(tr('resetPick'));
      return;
    }
    startRole(mode);
    toast(tr('resetDone'));
  });
  $('againBtn').addEventListener('click', () => startRole(mode));
  $('endSwitchBtn').addEventListener('click', openRoleSelect);

  // Difficulty picker on the role screen
  const diffBtns = [...document.querySelectorAll('.diff')];
  function renderDifficulty() {
    diffBtns.forEach((b) => {
      const on = b.dataset.diff === difficulty;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', String(on));
    });
    $('diffDesc').textContent = tr(`${difficulty}Desc`);
    // The help text says "fill the tank to 100"; show this difficulty's goal instead
    const goalLine = document.querySelector('[data-i18n-html="hv6"]');
    if (goalLine) goalLine.innerHTML = tr('hv6').replace('100', String(diff().goal));
  }
  diffBtns.forEach((b) => b.addEventListener('click', () => {
    difficulty = b.dataset.diff;
    try { localStorage.setItem('flowquest-difficulty', difficulty); } catch (_) { /* storage unavailable */ }
    renderDifficulty();
  }));

  // Sound on/off (menu button or the M key)
  const soundBtn = $('soundBtn');
  function renderSoundBtn() {
    soundBtn.textContent = tr(sound.on ? 'soundOn' : 'soundOff');
    soundBtn.setAttribute('aria-pressed', String(sound.on));
  }
  function toggleSound() {
    sound.on = !sound.on;
    try { localStorage.setItem('flowquest-sound', sound.on ? 'on' : 'off'); } catch (_) { /* storage unavailable */ }
    renderSoundBtn();
    toast(tr(sound.on ? 'soundOn' : 'soundOff'), 1200);
  }
  soundBtn.addEventListener('click', toggleSound);
  window.addEventListener('keydown', (e) => { if (e.key === 'm' || e.key === 'M') toggleSound(); });
  // A soft click for menu buttons (not the movement controls)
  document.addEventListener('click', (e) => {
    if (e.target.closest('button:not(.ctl), .btn')) sfx('click', 0.35);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && S.running && !S.over && !S.paused) togglePause(true);
  });

  function togglePause(force) {
    S.paused = typeof force === 'boolean' ? force : !S.paused;
    ui.menuOverlay.dataset.context = 'game';
    show(ui.menuOverlay, S.paused);
    if (!S.paused) show(ui.helpOverlay, false);
  }

  let toastTimer = 0;
  function toast(msg, ms = 2200) {
    ui.toast.textContent = msg;
    ui.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), ms);
  }
  function warn(msg) {
    if (S.time - S.lastWarn > 1.2) { S.lastWarn = S.time; toast(msg); }
  }

  // ---------- Helpers ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function popup(x, y, text, color = '#ece8e1') {
    S.popups.push({ x, y, text, color, t: 1 });
  }
  function burst(x, y, color, n = 8, spread = 160) {
    for (let i = 0; i < n; i++) {
      S.particles.push({ x, y, vx: rand(-spread, spread) * 0.6, vy: rand(-spread, -spread * 0.2), t: rand(0.4, 0.8), color, r: rand(1.2, 2.8) });
    }
  }
  function inPond(x) { return x > world.pondL && x < world.pondR; }

  function hurt(msg, force = false) {
    const p = S.player;
    if (!force && p.invuln > 0) return false;
    S.hearts -= 1;
    p.invuln = 1.6;
    S.shake = 0.25;
    sfx('hurt', 0.55);
    renderHearts();
    toast(msg, 2400);
    if (S.hearts <= 0) endGame(false);
    return true;
  }

  function endGame(won) {
    S.over = true;
    S.running = false;
    const village = S.mode === 'village';
    S.won = won;
    $('endTitle').textContent = tr(won ? 'wellDone' : 'gameOver');
    $('endText').textContent = tr(village ? (won ? 'winVillage' : 'loseVillage') : (won ? 'winWarehouse' : 'loseWarehouse'));
    $('endScore').textContent = S.score;
    $('endLevel').textContent = Math.min(S.level, CFG.maxLevel);
    $('endHerd').textContent = village ? S.livestock : S.trucksSent;
    S.factIndex = Math.floor(Math.random() * tr('facts').length);
    $('endFact').textContent = tr('facts')[S.factIndex];
    show(ui.endOverlay, true);
    sfx(won ? 'win' : 'lose', 0.7);
    if (won) celebrate(220);
  }

  // ---------- Milestones ----------
  function levelProgress() {
    return S.mode === 'village' ? S.water / diff().goal : S.truck.load / S.truck.target;
  }
  // Skip checkpoints the player is already past when a level or truck starts
  function resetMilestones() {
    S.msHit = MILESTONES.filter((m) => levelProgress() >= m.at).length;
  }
  function checkMilestones() {
    let reached = null;
    while (S.msHit < MILESTONES.length && levelProgress() >= MILESTONES[S.msHit].at) {
      reached = MILESTONES[S.msHit];
      S.msHit += 1;
    }
    if (!reached) return;
    const badge = document.createElement('div');
    badge.className = 'milestone';
    badge.textContent = tr(reached.key);
    stage.appendChild(badge);
    setTimeout(() => badge.remove(), 2400);
    sfx('milestone', 0.5);
  }

  // ---------- Tray: what you're holding, as page elements ----------
  // A drop or case is added when you collect it and removed when you use or lose it.
  function addToken(kind) {
    const el = document.createElement('span');
    el.className = `token ${kind}`;
    ui.tray.appendChild(el);
  }
  function removeTokens(filter = '') {
    ui.tray.querySelectorAll(`.token:not(.out)${filter}`).forEach((el) => {
      el.classList.add('out');
      setTimeout(() => el.remove(), 350);
    });
  }

  // ---------- Update ----------
  function update(dt) {
    S.time += dt;
    const p = S.player;
    const gy = world.groundY;

    // Movement (spills slow you down in the warehouse)
    const slow = S.mode === 'warehouse' && p.onGround && S.spills.some((s) => Math.abs(p.x - s.x) < s.w / 2);
    const dir = ((input.right ? 1 : 0) - (input.left ? 1 : 0)) * (isRTL() ? -1 : 1);
    p.vx = dir * CFG.speed * (S.mode === 'warehouse' ? warehouseStride() : 1) * (slow ? 0.45 : 1);
    if (dir) p.facing = dir;
    p.x = clamp(p.x + p.vx * dt, 14, W - 14);
    p.walk = dir && p.onGround ? p.walk + dt * (slow ? 5 : 10) : p.walk;
    p.moving = !!dir && p.onGround;
    p.slipping = slow;

    if (input.up && p.onGround) { p.vy = -CFG.jumpV * (slow ? 0.8 : 1); p.onGround = false; }
    p.vy += CFG.gravity * dt * (input.down && !p.onGround ? 2.2 : 1);
    p.y += p.vy * dt;
    if (p.y + p.h >= gy) { p.y = gy - p.h; p.vy = 0; p.onGround = true; }
    p.invuln = Math.max(0, p.invuln - dt);

    if (S.mode === 'village') updateVillage(dt);
    else updateWarehouse(dt);
    if (S.over) return;
    checkMilestones();

    if (actQueued) {
      actQueued = false;
      if (S.mode === 'village') interactVillage();
      else interactWarehouse();
    }

    // Effects
    S.particles.forEach((q) => { q.t -= dt; q.x += q.vx * dt; q.y += q.vy * dt; q.vy += 600 * dt; });
    S.particles = S.particles.filter((q) => q.t > 0);
    S.popups.forEach((q) => { q.t -= dt * 0.9; q.y -= 30 * dt; });
    S.popups = S.popups.filter((q) => q.t > 0);
    S.shake = Math.max(0, S.shake - dt);
  }

  // ===== Villager mode =====
  function updateVillage(dt) {
    const p = S.player;
    const gy = world.groundY;

    // Restricted area + guard
    const g = S.guard;
    g.x += g.dir * 40 * dt;
    g.walk += dt * 6;
    if (g.x > W - 24) g.dir = -1;
    if (g.x < world.signX + 34) g.dir = 1;
    g.alert = Math.max(0, g.alert - dt);
    if (p.x > world.signX - 4) {
      g.alert = 1.5;
      if (p.invuln > 0) {
        // Just sent back (or still flashing from another hit): the fence blocks you.
        // Bouncing again here let players hold right and climb into the sky.
        p.x = world.signX - 4;
      } else {
        S.score = Math.max(0, S.score - 25);
        popup(p.x, p.y - 10, '−25', '#e2574c');
        hurt(tr('restricted'));
        p.x = world.signX - 60;
        p.vy = -320;
        p.onGround = false;
        if (S.over) return;
      }
    }

    // Spawn drops from the clouds
    S.spawnT -= dt;
    if (S.spawnT <= 0) {
      S.spawnT = Math.max(0.32, 1.05 - S.level * 0.13) * rand(0.7, 1.3);
      const dirtyChance = Math.min(0.6, (0.16 + S.level * 0.06) * diff().dirty);
      S.drops.push({
        x: rand(20, W - 20), y: -20,
        vy: (rand(110, 170) + S.level * 22) * diff().rain * clamp(H / CFG.baseH, 0.75, 1.4),
        dirty: Math.random() < dirtyChance,
        wob: Math.random() * 6,
      });
    }

    // Drops: fall, collide with player, or splash
    const px1 = p.x - p.w / 2 - 8, px2 = p.x + p.w / 2 + 8;
    for (let i = S.drops.length - 1; i >= 0; i--) {
      const d = S.drops[i];
      d.y += d.vy * dt;
      const hit = d.x > px1 && d.x < px2 && d.y > p.y - 6 && d.y < p.y + p.h;
      if (hit) {
        S.drops.splice(i, 1);
        if (d.dirty) {
          S.score = Math.max(0, S.score - 20);
          burst(d.x, d.y, '#6b5634', 10);
          popup(d.x, d.y, '−20', '#e2574c');
          hurt(tr('polluted'));
          if (S.over) return;
        } else if (S.carry < CFG.canCapacity) {
          S.carry += 1;
          S.score += 10;
          addToken('drop');
          sfx('catch', 0.45);
          burst(d.x, d.y, '#8fd0f5', 6, 120);
          popup(d.x, d.y, '+10', '#8fd0f5');
          if (S.carry === CFG.canCapacity) toast(tr('canFull'));
        } else {
          burst(d.x, d.y, '#8fd0f5', 4, 80);
          warn(tr('canFullWarn'));
        }
        continue;
      }
      if (d.y >= gy - 2) {
        S.drops.splice(i, 1);
        burst(d.x, gy - 2, d.dirty ? '#6b5634' : '#8fd0f5', 5, 90);
      }
    }

    // Litter appears on the ground (and in the pond)
    S.trashT -= dt;
    if (S.trashT <= 0) {
      S.trashT = Math.max(4, 10 - S.level);
      if (S.trash.length < 3) {
        let x;
        let tries = 0;
        do { x = rand(30, world.signX - 30); tries++; }
        while (tries < 10 && (Math.abs(x - world.stationX) < 60 || Math.abs(x - p.x) < 40));
        S.trash.push({ x, kind: Math.random() < 0.5 ? 0 : 1 });
      }
    }

    // Filter
    const pu = S.purify;
    if (pu.active) {
      pu.t += dt;
      if (pu.t >= CFG.purifyTime) {
        pu.active = false;
        pu.done = 1.4;
        const gained = pu.amount * CFG.waterPerDrop;
        S.water += gained;
        S.score += pu.amount * 15;
        popup(world.stationX, gy - 120, tr('popWater', { n: gained }), '#8fd0f5');
        burst(world.stationX + 30, gy - 40, '#8fd0f5', 14, 160);
        toast(tr('filtered', { n: gained }));
        sfx('filter');
      }
    }
    pu.done = Math.max(0, pu.done - dt);

    // Village uses water over time
    S.water -= (0.45 + S.level * 0.25) * diff().drain * dt;
    if (S.water <= 0) {
      S.water = CFG.startWater;
      S.livestock = Math.max(0, S.livestock - 1);
      renderPen(true);
      hurt(tr('ranDry'), true);
      if (S.over) return;
    }

    // Level up
    if (S.water >= diff().goal) {
      S.score += 200 * S.level;
      if (S.level >= CFG.maxLevel) {
        S.water = diff().goal;
        endGame(true);
        return;
      }
      S.level += 1;
      S.water = 25;
      S.livestock += 2;
      S.hearts = Math.min(CFG.maxHearts, S.hearts + 1);
      renderHearts();
      renderPen(true);
      resetMilestones();
      sfx('levelup');
      toast(tr('levelVillage', { n: S.level }), 2800);
      celebrate(60);
      burst(p.x, p.y, '#ffc907', 20, 220);
    }
  }

  function nearStation() { return Math.abs(S.player.x - world.stationX) < 55; }
  function nearestTrash() {
    let best = -1, bd = 48;
    S.trash.forEach((t, i) => { const d = Math.abs(t.x - S.player.x); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function interactVillage() {
    const p = S.player;
    if (nearStation()) {
      if (S.purify.active) { toast(tr('filterBusy')); return; }
      if (S.carry === 0) { toast(tr('canEmpty')); return; }
      S.purify = { active: true, t: 0, amount: S.carry, done: 0 };
      S.carry = 0;
      removeTokens();
      sfx('pickup', 0.4);
      return;
    }
    const ti = nearestTrash();
    if (ti >= 0) {
      const t = S.trash.splice(ti, 1)[0];
      S.score += 25;
      sfx('pickup');
      popup(t.x, world.groundY - 30, tr('popCleanup'), '#9fd39a');
      burst(t.x, world.groundY - 10, '#c9b28a', 8);
      return;
    }
    toast(tr(onScreenRight(p.x < world.stationX) ? 'filterRight' : 'filterLeft'));
  }

  // ===== Volunteer (warehouse) mode =====
  function updateWarehouse(dt) {
    const p = S.player;
    const gy = world.groundY;
    const cs = CFG.crateSize;

    // Conveyor belt: cases slide right and queue at the end
    const spacing = cs + 6;
    S.beltT -= dt;
    if (S.beltT <= 0) {
      const last = S.belt[S.belt.length - 1];
      if (!last || last.x > spacing - cs) {
        S.belt.push({ x: -cs, bad: Math.random() < Math.min(0.5, (0.12 + S.level * 0.05) * diff().leak) });
      }
      S.beltT = Math.max(0.8, 1.7 - S.level * 0.15) * rand(0.8, 1.2);
    }
    let limit = world.beltEnd - cs / 2;
    S.belt.forEach((c) => {
      c.x = Math.min(c.x + CFG.beltSpeed * warehouseStride() * dt, limit);
      limit = c.x - spacing;
    });

    // Forklift patrol
    const L = S.lift;
    L.x += L.dir * (60 + S.level * 18) * diff().lift * dt;
    if (L.x > world.liftMax) { L.x = world.liftMax; L.dir = -1; }
    if (L.x < world.liftMin) { L.x = world.liftMin; L.dir = 1; }
    L.honk = Math.max(0, L.honk - dt);
    const touching = Math.abs(p.x - L.x) < 34 + p.w / 2 - 4 && p.y + p.h > gy - 40;
    if (touching && p.invuln <= 0) {
      L.honk = 1.2;
      S.score = Math.max(0, S.score - 25);
      popup(p.x, p.y - 24, '−25', '#e2574c');
      const dropped = S.stack.length;
      if (dropped) {
        burst(p.x, p.y + 20, '#8fd0f5', 12, 180);
        burst(p.x, p.y + 20, '#c79a62', 8, 160);
        popup(p.x, p.y, tr('popDropped', { n: dropped }), '#e2574c');
        S.stack = [];
        removeTokens();
      }
      hurt(tr(dropped ? 'forkliftDrop' : 'forkliftHit'));
      p.x = clamp(p.x + (p.x < L.x ? -50 : 50), 14, W - 14);
      p.vy = -300;
      p.onGround = false;
      if (S.over) return;
    }

    // Spills appear on the floor
    S.spillT -= dt;
    if (S.spillT <= 0) {
      S.spillT = rand(8, 13) - S.level;
      if (S.spills.length < 2) {
        S.spills.push({ x: rand(world.beltEnd + 40, world.truckBack - 30), w: 56, life: 14 });
      }
    }
    S.spills.forEach((s) => (s.life -= dt));
    S.spills = S.spills.filter((s) => s.life > 0);

    // Truck timer / departures
    const T = S.truck;
    if (T.arriving > 0) {
      T.arriving = Math.max(0, T.arriving - dt);
    } else if (T.leaving > 0) {
      T.leaving += dt;
      if (T.leaving > 1.6) {
        if (T.full) {
          if (S.trucksSent >= CFG.maxLevel) { endGame(true); return; }
          S.level += 1;
          toast(tr('levelTruck', { n: S.level }), 2600);
          celebrate(60);
        }
        S.truck = makeTruck(S.level);
        resetMilestones();
      }
    } else {
      T.time -= dt;
      if (T.time <= 0) {
        T.time = 0;
        T.leaving = 0.001;
        S.score += T.load * 5;
        hurt(tr('truckLeft', { load: T.load, target: T.target }), true);
      }
    }
    S.deliveredFlash = Math.max(0, S.deliveredFlash - dt);
  }

  // The warehouse stretches to fit the screen. On wide screens the player walks and the
  // belt runs faster, so a belt-to-truck trip takes the same time on every device.
  function warehouseStride() {
    return Math.max(1, (world.truckBack - world.beltEnd) / CFG.warehouseWalk);
  }

  function beltReady() {
    const head = S.belt[0];
    return head && head.x >= world.beltEnd - CFG.crateSize / 2 - 1 ? head : null;
  }
  function nearBelt() { return Math.abs(S.player.x - world.beltEnd) < 50; }
  function nearBin() { return Math.abs(S.player.x - world.binX) < 46; }
  function nearTruck() { return S.player.x > world.truckBack - 55; }
  function nearSpill() {
    let best = -1, bd = 44;
    S.spills.forEach((s, i) => { const d = Math.abs(s.x - S.player.x); if (d < bd) { bd = d; best = i; } });
    return best;
  }

  function interactWarehouse() {
    const gy = world.groundY;
    const holdingBad = S.stack.some((b) => b);

    // Recycling a leaking case wins over grabbing when the bin and belt are close together
    if (nearBin() && (holdingBad || !nearBelt())) {
      const bad = S.stack.filter((b) => b).length;
      if (!bad) {
        toast(tr(S.stack.length ? 'casesFine' : 'onlyLeaking'));
        return;
      }
      S.stack = S.stack.filter((b) => !b);
      removeTokens('.bad');
      sfx('pickup');
      S.score += bad * 15;
      popup(world.binX + 20, gy - 90, tr('popRecycled', { n: bad * 15 }), '#9fd39a');
      burst(world.binX, gy - 60, '#9fd39a', 8);
      return;
    }

    if (nearBelt()) {
      if (S.stack.length >= CFG.carryMax) { toast(tr('handsFull')); return; }
      const head = beltReady();
      if (!head) { toast(tr('waitingCase')); return; }
      S.belt.shift();
      S.stack.push(head.bad);
      addToken(head.bad ? 'case bad' : 'case');
      sfx('pickup', 0.5);
      popup(world.beltEnd, gy - 80, tr(head.bad ? 'popLeaking' : 'popCase'), head.bad ? '#e2574c' : '#8fd0f5');
      if (head.bad) toast(tr('leakingHeld'));
      return;
    }

    if (nearTruck()) {
      const T = S.truck;
      if (T.arriving > 0 || T.leaving > 0) { toast(tr('truckBusy')); return; }
      if (!S.stack.length) { toast(tr('handsEmpty')); return; }
      const bad = S.stack.filter((b) => b).length;
      const good = S.stack.length - bad;
      S.stack = [];
      removeTokens();
      if (good) {
        sfx('filter', 0.5);
        const add = Math.min(good, T.target - T.load);
        T.load += add;
        S.score += add * 20;
        popup(world.truckBack + 40, gy - 120, tr('popLoaded', { n: add }), '#8fd0f5');
      }
      if (bad) {
        S.score = Math.max(0, S.score - bad * 30);
        popup(world.truckBack + 40, gy - 140, tr('popLeakPenalty', { n: bad * 30 }), '#e2574c');
        burst(world.truckBack, gy - 50, '#8a6a45', 10);
        hurt(tr('leakLoaded', { n: bad * 30 }), true);
        if (S.over) return;
      }
      if (T.load >= T.target) {
        T.full = true;
        T.leaving = 0.001;
        S.trucksSent += 1;
        const bonus = 100 * S.level + Math.round(T.time) * 5;
        S.score += bonus;
        S.deliveredFlash = 1.6;
        renderPen(true);
        sfx('levelup');
        toast(tr('truckFull', { n: bonus }), 2600);
        burst(world.truckBack + 60, gy - 80, '#ffc907', 18, 220);
      }
      return;
    }

    const si = nearSpill();
    if (si >= 0) {
      const s = S.spills.splice(si, 1)[0];
      S.score += 10;
      sfx('pickup');
      popup(s.x, gy - 30, tr('popMopped'), '#9fd39a');
      burst(s.x, gy - 4, '#bfe6ff', 8, 100);
      return;
    }

    if (S.stack.length) toast(tr(onScreenRight(true) ? 'truckRight' : 'truckLeftDir'));
    else toast(tr(onScreenRight(false) ? 'beltRight' : 'beltLeft'));
  }

  // ---------- DOM HUD ----------
  const cache = {};
  function setText(el, key, val) {
    if (cache[key] !== val) { cache[key] = val; el.textContent = val; }
  }

  const HEART = '<path d="M12 20.5s-7.3-4.4-9.4-9C1.1 8.1 3.1 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.6 0 5.6 3.6 4.1 7-2.1 4.6-9.4 9-9.4 9z"/>';
  function renderHearts() {
    ui.hearts.innerHTML = '';
    for (let i = 0; i < CFG.maxHearts; i++) {
      ui.hearts.insertAdjacentHTML('beforeend',
        `<svg class="heart${i < S.hearts ? '' : ' lost'}" viewBox="0 0 24 24">${HEART}</svg>`);
    }
  }

  function renderPen(force) {
    const count = S.mode === 'village' ? S.livestock : S.trucksSent;
    const key = S.mode + count;
    if (!force && cache.pen === key) return;
    cache.pen = key;
    cache.low = undefined;
    ui.pen.innerHTML = '';
    if (S.mode === 'warehouse' && count === 0) {
      ui.pen.innerHTML = `<span class="empty-note">${tr('emptyTrucks')}</span>`;
      return;
    }
    const icon = S.mode === 'village' ? '#i-goat' : '#i-truck';
    for (let i = 0; i < count; i++) {
      ui.pen.insertAdjacentHTML('beforeend',
        `<svg class="animal" style="animation-delay:${(i * 0.4).toFixed(1)}s"><use href="${icon}"/></svg>`);
    }
  }

  function lightSteps(stage) {
    if (cache.stage === stage) return;
    cache.stage = stage;
    ui.steps.forEach((el, i) => {
      el.classList.toggle('on', i < stage);
      el.classList.toggle('now', i === stage - 1);
    });
  }

  function setBar(value, max, low) {
    const pct = Math.round(clamp(value / max, 0, 1) * 100);
    setText(ui.waterText, 'barText', `${Math.round(clamp(value, 0, max))}/${max}`);
    if (cache.barW !== pct) { cache.barW = pct; ui.waterFill.style.width = pct + '%'; }
    if (cache.low !== low) {
      cache.low = low;
      ui.bar.classList.toggle('low', low);
      ui.pen.querySelectorAll('.animal').forEach((a) => a.classList.toggle('thirsty', low && S.mode === 'village'));
    }
  }

  function setReady(ready) {
    if (cache.ready !== ready) {
      cache.ready = ready;
      ui.actBtns.forEach((b) => b.classList.toggle('ready', ready));
    }
  }

  function syncUI() {
    setText(ui.score, 'score', String(S.score));
    setText(ui.level, 'level', String(S.level));
    setText(ui.levelTop, 'levelTop', String(S.level));
    if (S.mode === 'village') syncVillageUI();
    else syncWarehouseUI();
  }

  function syncVillageUI() {
    setBar(S.water, diff().goal, S.water < 15);
    setText(ui.livestock, 'herd', String(S.livestock));
    setText(ui.livestockTop, 'herdTop', String(S.livestock));
    setText(ui.carry, 'carry', `${S.carry}/${CFG.canCapacity}`);

    const pu = S.purify;
    let stage = 0;
    if (pu.done > 0) stage = 4;
    else if (pu.active) stage = 2 + Math.min(1, Math.floor(pu.t / (CFG.purifyTime / 2)));
    else if (S.carry > 0) stage = 1;
    lightSteps(stage);

    let status;
    if (pu.done > 0) status = tr('sDelivered');
    else if (pu.active) status = tr(pu.t < CFG.purifyTime / 2 ? 'sPouring' : 'sFiltering');
    else if (S.carry >= CFG.canCapacity) status = tr('sCanFull');
    else if (S.carry > 0) status = tr('sKeepCatching');
    else status = tr('sCatch');
    setText(ui.status, 'status', status);

    setReady(S.running && ((nearStation() && S.carry > 0 && !pu.active) || (!nearStation() && nearestTrash() >= 0)));
  }

  function syncWarehouseUI() {
    const T = S.truck;
    setBar(T.load, T.target, !T.leaving && !T.arriving && T.time < 10);
    setText(ui.livestock, 'herd', String(S.trucksSent));
    setText(ui.livestockTop, 'herdTop', String(S.trucksSent));
    const n = S.stack.length;
    setText(ui.carry, 'carry', `${n}/${CFG.carryMax}`);

    // 1 = waiting on belt, 2 = carrying, 3 = some cases loaded, 4 = truck delivered
    let stage = 1;
    if (S.deliveredFlash > 0) stage = 4;
    else if (n) stage = 2;
    else if (T.load > 0) stage = 3;
    lightSteps(stage);

    const bad = S.stack.some((b) => b);
    const left = T.target - T.load;
    let status;
    if (S.deliveredFlash > 0) status = tr('sTruckDelivered');
    else if (T.arriving > 0) status = tr('sPulling');
    else if (bad) status = tr('sHoldingLeak');
    else if (n >= CFG.carryMax) status = tr('sHandsFull');
    else if (n) status = tr('sGrabMore');
    else status = tr('sTruckNeeds', { n: left, s: Math.ceil(T.time) });
    setText(ui.status, 'status', status);

    const truckOpen = !T.leaving && !T.arriving;
    setReady(S.running && (
      (nearBelt() && n < CFG.carryMax && !!beltReady()) ||
      (nearBin() && bad) ||
      (nearTruck() && n > 0 && truckOpen) ||
      (!nearBelt() && !nearBin() && !nearTruck() && nearSpill() >= 0)));
  }

  // =========================================================
  //  ART — flat illustrated style with soft light and depth
  // =========================================================
  // Arabic-script languages get the Cairo font; others use Montserrat (the closest
  // free match to charity: water's Proxima Nova), with system fonts for other scripts
  const ARABIC_SCRIPT = ['ar', 'fa', 'ur'];
  const fontFor = () => (ARABIC_SCRIPT.includes(window.I18N.lang)
    ? '"Cairo", "Segoe UI", Tahoma, sans-serif'
    : 'Montserrat, "Segoe UI", "Noto Sans", system-ui, sans-serif');

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function ellipse(x, y, rx, ry) { ctx.beginPath(); ctx.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, Math.PI * 2); }
  function lin(x1, y1, x2, y2, stops) {
    const g = ctx.createLinearGradient(x1, y1, x2, y2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  function rad(x, y, r1, r2, stops) {
    const g = ctx.createRadialGradient(x, y, r1, x, y, r2);
    stops.forEach(([o, c]) => g.addColorStop(o, c));
    return g;
  }
  // The sky, hills and warehouse walls never move, so they're drawn once into
  // offscreen canvases and copied each frame instead of redrawing every gradient.
  const bgCache = { key: '', layers: [] };
  function cachedLayer(i, draw) {
    const key = [S.mode, W, H, world.groundY, scale, dpr, I18N.lang].join('|');
    if (bgCache.key !== key) { bgCache.key = key; bgCache.layers = []; }
    let layer = bgCache.layers[i];
    if (!layer) {
      layer = document.createElement('canvas');
      layer.width = Math.ceil(W * scale * dpr);
      layer.height = Math.ceil(H * scale * dpr);
      const main = ctx;
      ctx = layer.getContext('2d');
      ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
      draw();
      ctx = main;
      bgCache.layers[i] = layer;
    }
    ctx.drawImage(layer, 0, 0, W, H);
  }
  // Redraw the cached signs once the web fonts arrive
  if (document.fonts) document.fonts.ready.then(() => { bgCache.key = ''; });

  let hudSpace = false; // true while drawing on-screen HUD (no mirroring)
  // maxWidth squeezes long words (e.g. German) so they fit on signs
  function label(text, x, y, color, size = 9, weight = 600, align = 'center', maxWidth) {
    ctx.font = `${weight} ${size}px ${fontFor()}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = color;
    if (!isRTL() || hudSpace) {
      ctx.textAlign = align;
      if (maxWidth) ctx.fillText(text, x, y, maxWidth);
      else ctx.fillText(text, x, y);
      return;
    }
    // The world is drawn mirrored in Arabic, so flip each word back to read normally.
    // Swapping left/right alignment keeps the text in the same spot on screen.
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.textAlign = align === 'left' ? 'right' : align === 'right' ? 'left' : align;
    if (maxWidth) ctx.fillText(text, 0, 0, maxWidth);
    else ctx.fillText(text, 0, 0);
    ctx.restore();
  }

  // Is a world direction (true = toward larger x) on the right side of the screen?
  function onScreenRight(worldRight) {
    return worldRight !== isRTL();
  }
  function groundShadow(x, y, rx, a = 0.25) {
    ctx.fillStyle = `rgba(20, 12, 8, ${a})`;
    ellipse(x, y, rx, rx * 0.22);
    ctx.fill();
  }

  // Soft prompt chip ("E  Purify")
  function prompt(x, y, text) {
    const bob = Math.sin(S.time * 3) * 1.5;
    ctx.font = `600 11px ${fontFor()}`;
    const tw = ctx.measureText(text).width;
    const key = !isTouch;
    const w = tw + (key ? 34 : 20), h = 24;
    const visL = visibleLeft();
    x = clamp(x, visL + w / 2 + 4, visL + viewW - w / 2 - 4); // keep the chip on screen
    ctx.fillStyle = 'rgba(15, 17, 20, 0.82)';
    rr(x - w / 2, y - h / 2 + bob, w, h, 7);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
    ctx.lineWidth = 1;
    ctx.stroke();
    let tx = x - w / 2 + 10;
    if (key) {
      ctx.fillStyle = '#ffc907';
      rr(tx - 2, y - 7 + bob, 15, 14, 3);
      ctx.fill();
      label('E', tx + 5.5, y + 4 + bob, '#16130a', 10, 700);
      tx += 19;
    }
    label(text, tx, y + 4 + bob, '#ece8e1', 11, 600, 'left');
  }

  // ---------- People ----------
  // Side-view figure with a simple walk cycle. Light comes from the right.
  function person(x, footY, o) {
    const f = o.facing || 1;
    const s = o.scale || 1;
    ctx.save();
    ctx.translate(x, footY);
    ctx.scale(s, s);
    if (o.alpha !== undefined) ctx.globalAlpha = o.alpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const ph = o.walk || 0;
    const amp = o.moving ? 1 : 0;
    const thigh = 15, shin = 15;
    const leg = (phase) => {
      const th = Math.sin(phase) * 0.5 * amp;
      const bend = amp ? Math.max(0, Math.cos(phase)) * 0.75 : 0.04;
      const kx = Math.sin(th) * thigh * f, ky = Math.cos(th) * thigh;
      const a2 = th - bend;
      return { kx, ky, fx: kx + Math.sin(a2) * shin * f, fy: ky + Math.cos(a2) * shin };
    };
    const legA = leg(ph), legB = leg(ph + Math.PI);
    const hipY = -Math.max(legA.fy, legB.fy) + (o.airborne ? -2 : 0);
    const shoulderY = hipY - 23;
    const headY = shoulderY - 10;
    const bottom = o.bottom || '#3a3f4a';
    const top = o.top || '#2f6f7a';
    const skin = o.skin || '#7a4a30';

    const drawLeg = (L, dark) => {
      ctx.strokeStyle = dark ? shadeColor(bottom, -0.25) : bottom;
      ctx.lineWidth = 5.5;
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(L.kx, hipY + L.ky);
      ctx.stroke();
      ctx.strokeStyle = o.skirt ? (dark ? shadeColor(skin, -0.25) : skin) : (dark ? shadeColor(bottom, -0.25) : bottom);
      ctx.lineWidth = 4.5;
      ctx.beginPath();
      ctx.moveTo(L.kx, hipY + L.ky);
      ctx.lineTo(L.fx, hipY + L.fy);
      ctx.stroke();
      ctx.fillStyle = dark ? '#1a1714' : '#2a2520';
      rr(L.fx - 3 + f * 1.5, hipY + L.fy - 2.5, 7, 3.5, 1.5);
      ctx.fill();
    };

    // arm angles measured from straight down, positive = forward
    let backArm, frontArm;
    if (o.pose === 'can') {
      backArm = [-Math.sin(ph) * 0.45 * amp - 0.1, 0.35];
      frontArm = [0.12, 0.05];
    } else if (o.pose === 'carry') {
      backArm = [0.85, 1.2];
      frontArm = [0.95, 1.25];
    } else {
      backArm = [Math.sin(ph) * 0.45 * amp - 0.05, 0.3];
      frontArm = [-Math.sin(ph) * 0.45 * amp + 0.05, 0.3];
    }
    const shoulder = { x: f * 0.5, y: shoulderY + 3 };
    const drawArm = ([a1, bendA], dark) => {
      const ex = shoulder.x + Math.sin(a1) * 11 * f, ey = shoulder.y + Math.cos(a1) * 11;
      const a2 = a1 + (bendA || 0); // elbows bend forward
      const hx = ex + Math.sin(a2) * 10.5 * f, hy = ey + Math.cos(a2) * 10.5;
      ctx.strokeStyle = dark ? shadeColor(top, -0.25) : top;
      ctx.lineWidth = 4.6;
      ctx.beginPath(); ctx.moveTo(shoulder.x, shoulder.y); ctx.lineTo(ex, ey); ctx.stroke();
      ctx.strokeStyle = dark ? shadeColor(skin, -0.25) : skin;
      ctx.lineWidth = 3.6;
      ctx.beginPath(); ctx.moveTo(ex, ey); ctx.lineTo(hx, hy); ctx.stroke();
      return { x: hx, y: hy };
    };

    drawLeg(legB, true);
    const backHand = drawArm(backArm, true);
    drawLeg(legA, false);

    // skirt / dress
    if (o.skirt) {
      ctx.fillStyle = bottom;
      ctx.beginPath();
      ctx.moveTo(-5, hipY - 3);
      ctx.lineTo(5.5, hipY - 3);
      ctx.lineTo(8 + amp * Math.sin(ph) * 2, hipY + 17);
      ctx.lineTo(-8 + amp * Math.sin(ph) * 2, hipY + 17);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-8, hipY + 10, 16, 2);
    }

    // torso
    rr(-5.5, shoulderY, 11, hipY - shoulderY + 2, 4.5);
    ctx.fillStyle = top;
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.fillRect(-6, shoulderY, 5.5, 40);
    if (o.vest) {
      ctx.fillStyle = '#ef7d22';
      ctx.fillRect(-6, shoulderY + 2, 12, hipY - shoulderY - 1);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(-6, shoulderY, 5.5, 40);
      ctx.fillStyle = '#d9dde0';
      ctx.fillRect(-6, shoulderY + 9, 12, 2.2);
      ctx.fillRect(-6, shoulderY + 15, 12, 2.2);
    }
    ctx.restore();

    // neck + head
    ctx.fillStyle = shadeColor(skin, -0.12);
    ctx.fillRect(-1.6 + f * 0.5, headY + 4, 3.2, 5);
    ellipse(f * 1, headY, 5.4, 6.4);
    ctx.fillStyle = skin;
    ctx.fill();
    ctx.save();
    ellipse(f * 1, headY, 5.4, 6.4);
    ctx.clip();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    ctx.fillRect(f * 1 - 7, headY - 8, 6.5, 16);
    ctx.restore();

    // headwear
    if (o.head === 'wrap') {
      ctx.fillStyle = o.wrap || '#d9a441';
      ctx.beginPath();
      ctx.ellipse(f * 0.5, headY - 3.5, 6.2, 4.8, 0, Math.PI, 0);
      ctx.fill();
      ellipse(-f * 5, headY - 4, 3.2, 2.6);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(f * 0.5 - 6, headY - 3.8, 12, 1.2);
    } else if (o.head === 'hardhat') {
      ctx.fillStyle = '#f2c230';
      ctx.beginPath();
      ctx.ellipse(f * 1, headY - 3, 6.2, 5.2, 0, Math.PI, 0);
      ctx.fill();
      rr(f * 1 - 7 + f * 1.5, headY - 3.6, 14, 2.2, 1);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(f * 1 + 1, headY - 7, 2, 3);
    } else if (o.head === 'cap') {
      ctx.fillStyle = o.capColor || '#2b3328';
      ctx.beginPath();
      ctx.ellipse(f * 1, headY - 3, 6, 4.5, 0, Math.PI, 0);
      ctx.fill();
      rr(f > 0 ? f * 1 : f * 1 - 7, headY - 3.8, 7, 1.8, 0.8);
      ctx.fill();
      if (o.glasses) {
        ctx.fillStyle = '#111';
        rr(f > 0 ? f * 2 : f * 2 - 5, headY - 1.5, 5, 2.2, 1);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = '#1e1a17';
      ctx.beginPath();
      ctx.ellipse(f * 0.6, headY - 2.4, 5.8, 4.6, 0, Math.PI, 0);
      ctx.fill();
    }

    // things being carried
    if (o.pose === 'can') {
      const hand = drawArm(frontArm, false);
      jerryCan(hand.x + f * 1, hand.y - 3, o.canFill || 0);
    } else if (o.pose === 'carry') {
      const hand = drawArm(frontArm, false);
      let y = hand.y + 6;
      (o.stack || []).forEach((bad) => {
        drawCase(hand.x + f * 6, y, bad, 0.82);
        y -= CFG.crateSize * 0.82 * 0.85;
      });
    } else {
      drawArm(frontArm, false);
    }
    void backHand;
    ctx.restore();
  }

  // Official charity: water jerry can (same path as assets/cw-jerry-can.svg, 26 x 34)
  const JERRY_CAN = new Path2D('m15.7682 16.7009h-5.4839c-.49851 0-.89734.3988-.89734.8973v2.3432c0 .4985.39883.8973.89734.8973h5.4839c.4985 0 .8974-.3988.8974-.8973v-2.3432c0-.5483-.3989-.8973-.8974-.8973zm8.9237-12.26395c-.1495-.34897-1.1964-2.44281-1.1964-2.44281s.3988-.24927.5982-.34898c.1496-.04985.2991-.14956.0499-.648092-.2493-.498534-.5484-.348974-.5484-.348974s-.349.199413-.7478.398826c-.6481-.9472133-1.5455-1.04692-1.8446-1.04692-.1994 0-1.0968 0-1.346 0-.2493 0-.5484.0498534-.6481.199414-.0997.14956-.349.249266-.698.249266-.2991 0-9.22286 0-9.22286 0-.09971 0-.09971-.049853-.14956-.099706-.59824-.348974-1.29619 0-1.44575.14956s-.7478.897356-1.09677 1.246336c-.34897.39883-.64809.44868-.89736.54839.14956-.19942.04985-.39883.04985-.39883l-.09971-.19942.19942-.49853.14956-.09971-.09971-.249263s-.0997.049854-.29912.149561c-.19941.099702-.19941.149562-.19941.149562-.09971.34897-.29912.34897-.29912.34897s-.54839-.997066-.59824-1.096773c-.04986-.14956-.19942-.548387-1.99414.398827-1.794718.947216-1.346038 1.296186-1.346038 1.296186l.598238 1.14663-.19941.19941.44868.89736s-.09971.04986-.49853.29912c-.398832.24927-.797658.49854-.797658 1.19649v25.42525c0 1.8944.548388 2.7918 2.692078 2.7918h19.44286c1.2463 0 2.4428-.6481 2.4428-2.8417v-25.17594c0-1.24634-.2493-1.24634-.3989-1.59531zm-13.9589-2.09384h6.4809c.5484 0 .9971.44868.9971.99707 0 .54838-.4487.99706-.9971.99706h-6.4809c-.5484 0-.99706-.44868-.99706-.99706 0-.54839.44866-.99707.99706-.99707zm8.2258 19.99119s2.1437 3.7889 2.6422 4.6364c.5983 1.1466-.1994 1.6451-.1994 1.6451s-1.0968.5484-1.6451-.4486c-.4487-.8475-1.9942-3.4898-2.4927-4.3373-.698-1.0469-.9971-1.4457-1.8944-1.4457-1.2464 0-.4487 0-2.1936 0h-.1495c-1.7449 0-.9473 0-2.2434 0-.94726 0-1.24638.3489-1.94433 1.4457-.54838.7977-2.04398 3.4898-2.54252 4.3373-.54838.997-1.64516.4486-1.64516.4486s-.84751-.4985-.19941-1.6451c.44868-.8475 2.64223-4.6364 2.64223-4.6364s.54838-.8475.54838-1.5454v-1.9443c0-.1994 0-.349 0-.349v-1.9443c0-.6979-.54838-1.5454-.54838-1.5454s-2.19355-3.7889-2.64223-4.6364c-.59824-1.14663.19941-1.64516.19941-1.64516s1.09678-.54839 1.64516.44868c.44868.84748 1.99414 3.48978 2.54252 4.33728.69795 1.0469.99707 1.3959 1.94433 1.3959h2.2434.1495 2.1936c.9472 0 1.1964-.349 1.8944-1.3959.5484-.7977 2.044-3.4898 2.4927-4.33728.5483-.99707 1.6451-.44868 1.6451-.44868s.7977.49853.1994 1.64516c-.4486.8475-2.6422 4.6364-2.6422 4.6364s-.5484.8475-.5484 1.5454v1.9443.349 1.9443c0 .6979.5484 1.5454.5484 1.5454z');
  function jerryCan(x, y, fill) {
    const k = 13 / 26; // 13 units wide, keeps the official 26:34 shape
    ctx.save();
    ctx.translate(x - 13 / 2, y - 2);
    ctx.scale(k, k);
    ctx.fillStyle = '#ffca0a';
    ctx.fill(JERRY_CAN);
    // water inside makes the lower part of the can a little darker
    if (fill > 0) {
      ctx.clip(JERRY_CAN);
      ctx.fillStyle = 'rgba(120, 70, 0, 0.22)';
      ctx.fillRect(0, 34 - 30 * fill, 26, 30 * fill);
    }
    ctx.restore();
  }

  function shadeColor(hex, amt) {
    if (hex[0] !== '#') return hex;
    const n = parseInt(hex.slice(1), 16);
    let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const t = amt < 0 ? 0 : 255, p = Math.abs(amt);
    r = Math.round((t - r) * p + r);
    g = Math.round((t - g) * p + g);
    b = Math.round((t - b) * p + b);
    return `rgb(${r},${g},${b})`;
  }

  // ---------- Village art ----------
  function drawVillage() {
    const gy = world.groundY;
    const sx = W * 0.74, sy = gy - Math.min(130, gy * 0.42); // sun, also reflected in the pond

    cachedLayer(0, () => {
      // Sky at golden hour
      ctx.fillStyle = lin(0, 0, 0, gy, [[0, '#1d3350'], [0.4, '#4b5c78'], [0.72, '#c58466'], [1, '#f1c08a']]);
      ctx.fillRect(0, 0, W, gy);

      // Sun + haze
      ctx.fillStyle = rad(sx, sy, 10, Math.max(W, gy) * 0.45, [[0, 'rgba(255, 214, 160, 0.55)'], [0.25, 'rgba(255, 190, 140, 0.18)'], [1, 'rgba(255, 190, 140, 0)']]);
      ctx.fillRect(0, 0, W, gy);
      ellipse(sx, sy, 22, 22);
      ctx.fillStyle = '#ffe7c2';
      ctx.fill();
    });

    // Long thin clouds
    S.clouds.forEach((c) => {
      const x = ((c.fx * (W + 300) + S.time * c.v) % (W + 300)) - 150;
      const y = gy * c.y;
      ctx.fillStyle = 'rgba(255, 210, 190, 0.22)';
      ellipse(x, y, 70 * c.s, 5 * c.s);
      ctx.fill();
      ctx.fillStyle = 'rgba(120, 90, 110, 0.15)';
      ellipse(x + 10, y + 3 * c.s, 50 * c.s, 3 * c.s);
      ctx.fill();
    });

    // Birds
    ctx.strokeStyle = 'rgba(40, 30, 40, 0.55)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 3; i++) {
      const bx = ((S.time * 14 + i * 90) % (W + 100)) - 50, by = gy * 0.28 + i * 9 + Math.sin(S.time * 2 + i) * 3;
      const flap = Math.sin(S.time * 8 + i) * 2.5;
      ctx.beginPath();
      ctx.moveTo(bx - 5, by - flap); ctx.quadraticCurveTo(bx - 2, by - 1, bx, by);
      ctx.quadraticCurveTo(bx + 2, by - 1, bx + 5, by - flap);
      ctx.stroke();
    }

    cachedLayer(1, () => {
      // Layered land with atmospheric depth
      ridge(gy, gy * 0.42, 1.3, 'rgba(176, 124, 112, 0.85)', 0.5);
      ridge(gy, gy * 0.3, 4.1, '#8b6260', 1);
      [0.2, 0.42, 0.86].forEach((fx, i) => acacia(W * fx, gy - gy * 0.12 - i * 3, 0.55, '#5a403f'));
      for (let i = 0; i < 4; i++) distantHut(W * (0.58 + i * 0.035), gy - gy * 0.115);
      ridge(gy, gy * 0.16, 7.7, '#6a4a45', 1.4);

      // Ground
      ctx.fillStyle = lin(0, gy, 0, H, [[0, '#b88a55'], [1, '#7c5733']]);
      ctx.fillRect(0, gy, W, H - gy);
      ctx.fillStyle = 'rgba(255, 220, 170, 0.25)';
      ctx.fillRect(0, gy, W, 2);
      world.speck.forEach((s) => {
        ctx.fillStyle = `rgba(70, 45, 25, ${0.12 + s.a * 0.12})`;
        ctx.fillRect(s.x, gy + 6 + s.y * (H - gy - 8), s.w, 1.5);
      });
    });

    // Pond under the bridge
    const pl = world.pondL, pr = world.pondR;
    ctx.beginPath();
    ctx.moveTo(pl - 22, gy);
    ctx.quadraticCurveTo(pl, H + 10, (pl + pr) / 2, H + 4);
    ctx.quadraticCurveTo(pr, H + 10, pr + 22, gy);
    ctx.closePath();
    ctx.fillStyle = '#5a3d23';
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(pl - 16, gy + 1);
    ctx.quadraticCurveTo(pl + 2, H + 4, (pl + pr) / 2, H);
    ctx.quadraticCurveTo(pr - 2, H + 4, pr + 16, gy + 1);
    ctx.closePath();
    ctx.fillStyle = lin(0, gy, 0, H, [[0, '#d7a77c'], [0.15, '#6f8ea0'], [1, '#2c4a5c']]);
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = 'rgba(255, 220, 170, 0.35)';
    ellipse(sx * 0.5 + (pl + pr) / 4, gy + 16, 26, 2.5);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 240, 220, 0.25)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 6; i++) {
      const y = gy + 12 + i * 8;
      const off = Math.sin(S.time * 1.2 + i * 1.7) * 12;
      ctx.beginPath();
      ctx.moveTo(pl + 30 + off + i * 9, y);
      ctx.lineTo(pl + 58 + off + i * 9, y);
      ctx.moveTo(pr - 70 - off, y + 3);
      ctx.lineTo(pr - 48 - off, y + 3);
      ctx.stroke();
    }
    ctx.restore();
    reeds(pl - 10, gy);
    reeds(pr + 6, gy);

    // Bridge
    ctx.fillStyle = '#4a3220';
    [pl - 14, (pl + pr) / 2 - 60, (pl + pr) / 2 + 60, pr + 10].forEach((x) => ctx.fillRect(x, gy + 4, 5, 34));
    ctx.fillStyle = lin(0, gy - 5, 0, gy + 5, [[0, '#9a6f45'], [0.4, '#7a5434'], [1, '#5a3c24']]);
    ctx.fillRect(pl - 24, gy - 5, pr - pl + 48, 10);
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = pl - 22; x < pr + 22; x += 11) ctx.fillRect(x, gy - 5, 1, 10);
    const postsX = [];
    for (let i = 0; i <= 6; i++) postsX.push(pl - 20 + ((pr - pl + 40) * i) / 6);
    ctx.fillStyle = '#5a3c24';
    postsX.forEach((x) => ctx.fillRect(x - 1.5, gy - 28, 3, 24));
    ctx.strokeStyle = 'rgba(214, 190, 150, 0.9)';
    ctx.lineWidth = 1.4;
    for (let i = 0; i < postsX.length - 1; i++) {
      const a = postsX[i], b = postsX[i + 1];
      ctx.beginPath();
      ctx.moveTo(a, gy - 26);
      ctx.quadraticCurveTo((a + b) / 2, gy - 18, b, gy - 26);
      ctx.stroke();
    }

    // Foreground tree, rocks, village
    acacia(W * 0.035, gy, 1.25, '#2f2622', true);
    world.rocks.forEach((r) => rock(r.x, gy, r.r));
    village(world.houseX, gy);

    // Grass tufts on the ground line
    world.tufts.forEach((t) => {
      if (inPond(t.x) && t.x > world.pondL - 10 && t.x < world.pondR + 10) return;
      ctx.strokeStyle = `rgba(110, 85, 40, ${0.5 + t.y * 0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(t.x, gy + 1);
      ctx.lineTo(t.x + t.lean * 2, gy - t.h);
      ctx.moveTo(t.x + 2, gy + 1);
      ctx.lineTo(t.x + 2 + t.lean * 3, gy - t.h * 0.7);
      ctx.stroke();
    });

    biosandFilter(world.stationX, gy - 5);
    restrictedArea(gy);

    S.trash.forEach(litter);
    S.drops.forEach(drawDrop);

    const p = S.player;
    if (!(p.invuln > 0 && Math.floor(p.invuln * 10) % 2)) {
      groundShadow(p.x, gy + 1, 13, p.onGround ? 0.3 : 0.15);
      person(p.x, p.y + p.h, {
        facing: p.facing, walk: p.walk, moving: p.moving, airborne: !p.onGround,
        skin: '#6e4129', top: '#2f6f7a', bottom: '#b4562f', skirt: true,
        head: 'wrap', wrap: '#d9a441', pose: 'can', canFill: S.carry / CFG.canCapacity,
      });
    }
  }

  function ridge(baseY, h, seed, color, rough) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= W + 8; x += 6) {
      const y = baseY - h * (0.55 + 0.25 * Math.sin(x * 0.0045 + seed) + 0.12 * Math.sin(x * 0.013 + seed * 2.1) + 0.04 * rough * Math.sin(x * 0.06 + seed * 3.7));
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, baseY);
    ctx.closePath();
    ctx.fill();
  }

  function acacia(x, y, s, color, rim) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineCap = 'round';
    ctx.lineWidth = 3.4 * s;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.quadraticCurveTo(x - 1 * s, y - 16 * s, x + 2 * s, y - 28 * s);
    ctx.stroke();
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x + 2 * s, y - 28 * s); ctx.quadraticCurveTo(x - 6 * s, y - 34 * s, x - 15 * s, y - 42 * s);
    ctx.moveTo(x + 2 * s, y - 28 * s); ctx.quadraticCurveTo(x + 10 * s, y - 36 * s, x + 17 * s, y - 43 * s);
    ctx.moveTo(x + 2 * s, y - 28 * s); ctx.lineTo(x + 3 * s, y - 45 * s);
    ctx.stroke();
    [[1, -47, 31, 5.5], [-15, -44, 16, 4.5], [18, -45, 16, 4.5], [3, -51, 20, 4]].forEach(([ox, oy, rx, ry]) => {
      ellipse(x + ox * s, y + oy * s, rx * s, ry * s);
      ctx.fill();
    });
    if (rim) {
      ctx.fillStyle = 'rgba(255, 190, 120, 0.22)';
      ellipse(x + 10 * s, y - 53 * s, 16 * s, 1.6 * s);
      ctx.fill();
    }
  }

  function distantHut(x, y) {
    ctx.fillStyle = '#5e4141';
    ctx.fillRect(x - 5, y - 6, 10, 6);
    ctx.beginPath();
    ctx.moveTo(x - 7, y - 5); ctx.lineTo(x, y - 13); ctx.lineTo(x + 7, y - 5);
    ctx.fill();
  }

  function reeds(x, gy) {
    ctx.strokeStyle = '#5b5a2e';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      const sway = Math.sin(S.time * 1.5 + i) * 1.5;
      ctx.beginPath();
      ctx.moveTo(x + i * 2.5, gy + 4);
      ctx.quadraticCurveTo(x + i * 2.5, gy - 8, x + i * 2.5 + sway, gy - 14 - (i % 3) * 4);
      ctx.stroke();
    }
  }

  function rock(x, gy, r) {
    ctx.fillStyle = lin(x - r, gy - r, x + r, gy, [[0, '#5d5550'], [1, '#a0948a']]);
    ctx.beginPath();
    ctx.moveTo(x - r * 1.4, gy + 1);
    ctx.quadraticCurveTo(x - r * 1.2, gy - r * 0.9, x - r * 0.2, gy - r);
    ctx.quadraticCurveTo(x + r * 1.2, gy - r * 0.9, x + r * 1.4, gy + 1);
    ctx.closePath();
    ctx.fill();
    groundShadow(x, gy + 1, r * 1.5, 0.18);
  }

  function village(x, gy) {
    hut(x - 4, gy, 1);
    if (W > 520) hut(x + 62, gy, 0.72);
    waterTank(x + 36, gy);
    label(tr('cVillage'), x + 10, gy - 76, 'rgba(255, 240, 220, 0.65)', 8, 700);
  }

  function hut(x, gy, s) {
    const w = 44 * s, h = 25 * s;
    // wall (mud plaster, lit from the right)
    ctx.fillStyle = lin(x - w / 2, 0, x + w / 2, 0, [[0, '#7d5236'], [0.6, '#b07a52'], [1, '#d39c6c']]);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, gy - h);
    ctx.lineTo(x + w / 2, gy - h);
    ctx.lineTo(x + w / 2, gy);
    ctx.ellipse(x, gy, w / 2, 3 * s, 0, 0, Math.PI);
    ctx.closePath();
    ctx.fill();
    // doorway
    ctx.fillStyle = '#2a1a12';
    ctx.beginPath();
    ctx.moveTo(x - 7 * s, gy);
    ctx.lineTo(x - 7 * s, gy - 13 * s);
    ctx.quadraticCurveTo(x - 1 * s, gy - 19 * s, x + 5 * s, gy - 13 * s);
    ctx.lineTo(x + 5 * s, gy);
    ctx.fill();
    // eave shadow
    ctx.fillStyle = 'rgba(30, 15, 5, 0.3)';
    ctx.fillRect(x - w / 2, gy - h, w, 4 * s);
    // thatch roof
    ctx.fillStyle = lin(x - w / 2, 0, x + w / 2, 0, [[0, '#8c6a32'], [0.55, '#c49a52'], [1, '#e2bd76']]);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 - 7 * s, gy - h + 3 * s);
    ctx.lineTo(x, gy - h - 30 * s);
    ctx.lineTo(x + w / 2 + 7 * s, gy - h + 3 * s);
    ctx.quadraticCurveTo(x, gy - h + 7 * s, x - w / 2 - 7 * s, gy - h + 3 * s);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70, 45, 15, 0.25)';
    ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) {
      ctx.beginPath();
      ctx.moveTo(x + i * 1.5 * s, gy - h - 27 * s);
      ctx.lineTo(x + i * 8 * s, gy - h + 3 * s);
      ctx.stroke();
    }
    groundShadow(x, gy + 1, w * 0.6, 0.22);
  }

  function waterTank(x, gy) {
    const w = 22, h = 46, top = gy - h;
    ctx.fillStyle = lin(x - w / 2, 0, x + w / 2, 0, [[0, '#1f2d24'], [0.6, '#38513f'], [1, '#4f6b55']]);
    rr(x - w / 2, top, w, h, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let i = 1; i < 5; i++) ctx.fillRect(x - w / 2, top + i * 9, w, 1);
    ellipse(x, top + 1, w / 2, 3);
    ctx.fillStyle = '#4f6b55';
    ctx.fill();
    // level gauge
    const lvl = clamp(S.water / CFG.maxWater, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(x + 4, top + 6, 3, h - 12);
    ctx.fillStyle = S.water < 15 ? '#d9734d' : '#5bb6f0';
    ctx.fillRect(x + 4, top + 6 + (h - 12) * (1 - lvl), 3, (h - 12) * lvl);
    // tap
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(x - w / 2 - 4, gy - 9, 5, 2.5);
    groundShadow(x, gy + 1, 14, 0.22);
  }

  function biosandFilter(x, base) {
    const pu = S.purify;
    const w = 40, h = 64, top = base - h;
    groundShadow(x, base + 1, 28, 0.25);
    // concrete body
    ctx.fillStyle = lin(x - w / 2, 0, x + w / 2, 0, [[0, '#76726b'], [0.6, '#a9a49b'], [1, '#c9c3b8']]);
    ctx.beginPath();
    ctx.moveTo(x - w / 2 + 2, top);
    ctx.lineTo(x + w / 2 - 2, top);
    ctx.lineTo(x + w / 2, base);
    ctx.lineTo(x - w / 2, base);
    ctx.closePath();
    ctx.fill();
    // lid
    ctx.fillStyle = '#5c5852';
    rr(x - w / 2, top - 5, w, 6, 2);
    ctx.fill();
    // cut-away window showing the layers
    const wx = x - 11, ww = 22, wy = top + 8, wh = 44;
    ctx.fillStyle = '#2a2622';
    rr(wx - 1.5, wy - 1.5, ww + 3, wh + 3, 3);
    ctx.fill();
    const progress = pu.active ? pu.t / CFG.purifyTime : 0;
    const dirtyH = pu.active ? 10 * (1 - progress) : 0;
    ctx.fillStyle = '#7a6040';
    ctx.fillRect(wx, wy + (10 - dirtyH), ww, dirtyH);
    ctx.fillStyle = '#dcc69c'; ctx.fillRect(wx, wy + 10, ww, 14);
    ctx.fillStyle = '#c1a678'; ctx.fillRect(wx, wy + 24, ww, 8);
    ctx.fillStyle = '#8c9094'; ctx.fillRect(wx, wy + 32, ww, 12);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    for (let i = 0; i < 9; i++) { ellipse(wx + 2 + (i * 7) % ww, wy + 35 + (i % 3) * 3, 1.6, 1.2); ctx.fill(); }
    if (pu.active) {
      ctx.fillStyle = 'rgba(91, 182, 240, 0.35)';
      ctx.fillRect(wx, wy + 10, ww, 34 * progress);
    }
    // outlet pipe + bucket
    ctx.fillStyle = '#4f5358';
    ctx.fillRect(x + w / 2 - 2, top + 12, 12, 3);
    ctx.fillRect(x + w / 2 + 8, top + 12, 3, 7);
    const bx = x + w / 2 + 10;
    ctx.fillStyle = lin(bx - 7, 0, bx + 7, 0, [[0, '#1f5f96'], [1, '#3f8fd0']]);
    ctx.beginPath();
    ctx.moveTo(bx - 7, base - 15); ctx.lineTo(bx + 7, base - 15); ctx.lineTo(bx + 5.5, base); ctx.lineTo(bx - 5.5, base);
    ctx.closePath();
    ctx.fill();
    if (pu.active || pu.done > 0) {
      ctx.fillStyle = 'rgba(160, 220, 255, 0.85)';
      ctx.fillRect(bx + 0.5, top + 19, 1.6, base - 15 - top - 19);
    }
    label(tr('cFilter'), x + 4, top - 12, 'rgba(255, 245, 230, 0.7)', 8, 700);

    if (pu.active) {
      ctx.strokeStyle = 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 3;
      ellipse(x, top - 30, 9, 9);
      ctx.stroke();
      ctx.strokeStyle = '#5bb6f0';
      ctx.beginPath();
      ctx.arc(x, top - 30, 9, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
      ctx.stroke();
    } else if (nearStation() && S.carry > 0) {
      prompt(x, top - 32, tr('pPurify'));
    }
  }

  function restrictedArea(gy) {
    const x0 = world.signX;
    // fenced private water point behind chain-link
    const pumpX = x0 + (W - x0) * 0.62;
    ctx.fillStyle = '#8f8a82';
    rr(pumpX - 16, gy - 4, 32, 5, 1);
    ctx.fill();
    ctx.fillStyle = '#2d3236';
    ctx.fillRect(pumpX - 3, gy - 30, 6, 26);
    ctx.fillRect(pumpX - 3, gy - 30, 12, 4);
    ctx.fillRect(pumpX + 8, gy - 30, 2, 8);
    ctx.save();
    ctx.translate(pumpX - 2, gy - 28);
    ctx.rotate(-0.5);
    ctx.fillRect(-16, -1.5, 18, 3);
    ctx.restore();

    // chain-link fence
    const top = gy - 58;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0, top, W - x0, gy - top);
    ctx.clip();
    ctx.strokeStyle = 'rgba(205, 210, 215, 0.3)';
    ctx.lineWidth = 0.7;
    for (let i = -60; i < W - x0 + 60; i += 6) {
      ctx.beginPath();
      ctx.moveTo(x0 + i, top); ctx.lineTo(x0 + i + 58, gy);
      ctx.moveTo(x0 + i + 58, top); ctx.lineTo(x0 + i, gy);
      ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#80868c';
    for (let x = x0; x < W + 10; x += 46) ctx.fillRect(x - 1.5, top - 6, 3, gy - top + 6);
    ctx.fillRect(x0, top, W - x0, 2);
    // barbed wire
    ctx.strokeStyle = 'rgba(160, 165, 170, 0.8)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = x0; x < W; x += 5) ctx.lineTo(x, top - 4 + (x % 10 === 0 ? -1.5 : 1.5));
    ctx.stroke();

    // guard
    const g = S.guard;
    groundShadow(g.x, gy + 1, 13, 0.25);
    person(g.x, gy, {
      facing: g.dir, walk: g.walk, moving: true, scale: 1.04,
      skin: '#8a5a3c', top: '#4a5540', bottom: '#2f352b', head: 'cap', capColor: '#2b3328', glasses: true,
    });
    if (g.alert > 0) prompt(g.x, gy - 86, tr('pKeepOut'));

    // sign on the gate post
    ctx.fillStyle = '#5c6268';
    ctx.fillRect(x0 - 2, gy - 70, 4, 70);
    const sx = x0 - 30;
    ctx.fillStyle = '#efece6';
    rr(sx, gy - 82, 60, 30, 2);
    ctx.fill();
    ctx.fillStyle = '#b8312a';
    ctx.fillRect(sx, gy - 82, 60, 11);
    label(tr('cSign1'), sx + 30, gy - 73.5, '#fff', 7.5, 700, 'center', 54);
    label(tr('cSign2'), sx + 30, gy - 61, '#2a2622', 9, 700, 'center', 54);
    ctx.fillStyle = 'rgba(140, 80, 40, 0.3)';
    ellipse(sx + 52, gy - 56, 4, 2);
    ctx.fill();
  }

  function drawDrop(d) {
    const r = 6;
    const x = d.x + Math.sin(S.time * 3 + d.wob) * 1.2;
    const y = d.y;
    ctx.beginPath();
    ctx.moveTo(x, y - r * 2.2);
    ctx.bezierCurveTo(x + r * 0.5, y - r * 1.2, x + r, y - r * 0.6, x + r, y);
    ctx.arc(x, y, r, 0, Math.PI);
    ctx.bezierCurveTo(x - r, y - r * 0.6, x - r * 0.5, y - r * 1.2, x, y - r * 2.2);
    ctx.fillStyle = d.dirty
      ? rad(x - 2, y - 2, 1, r * 2, [[0, '#b39a63'], [0.6, '#6b5634'], [1, '#3d2f1b']])
      : rad(x - 2, y - 2, 1, r * 2, [[0, '#e3f5ff'], [0.45, '#7cc6f2'], [1, '#2a7fc4']]);
    ctx.fill();
    if (d.dirty) {
      ctx.fillStyle = 'rgba(30, 40, 15, 0.55)';
      ellipse(x + 1.5, y + 1, 1.2, 1.2); ctx.fill();
      ellipse(x - 2, y + 2.5, 0.9, 0.9); ctx.fill();
    }
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ellipse(x - 2.2, y - 2, 1.4, 2.4);
    ctx.fill();
  }

  function litter(t) {
    const gy = world.groundY;
    const floating = inPond(t.x);
    const y = floating ? gy + 16 + Math.sin(S.time * 2 + t.x) * 1.5 : gy;
    if (!floating) groundShadow(t.x, gy + 1, 11, 0.2);
    if (t.kind === 0) {
      // plastic bag
      ctx.fillStyle = 'rgba(232, 232, 228, 0.92)';
      ctx.beginPath();
      ctx.moveTo(t.x - 10, y);
      ctx.quadraticCurveTo(t.x - 12, y - 12, t.x - 5, y - 15);
      ctx.lineTo(t.x + 6, y - 14);
      ctx.quadraticCurveTo(t.x + 12, y - 10, t.x + 10, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.beginPath();
      ctx.moveTo(t.x - 2, y - 14); ctx.lineTo(t.x + 1, y); ctx.lineTo(t.x - 4, y);
      ctx.fill();
      ctx.strokeStyle = 'rgba(232, 232, 228, 0.9)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(t.x - 3, y - 16, 3, Math.PI, 0);
      ctx.stroke();
    } else {
      // plastic bottle
      ctx.save();
      ctx.translate(t.x, y - 4);
      ctx.rotate(0.15);
      ctx.fillStyle = 'rgba(200, 225, 235, 0.75)';
      rr(-11, -4, 18, 8, 3);
      ctx.fill();
      ctx.fillRect(7, -2, 3, 4);
      ctx.fillStyle = '#2a6fb0';
      ctx.fillRect(10, -2, 2.5, 4);
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      ctx.fillRect(-9, -3, 12, 1.2);
      ctx.restore();
    }
    if (!nearStation() && Math.abs(S.player.x - t.x) < 48) prompt(t.x, y - 34, tr('pPickUp'));
  }

  // ---------- Warehouse art ----------
  function drawWarehouse() {
    const gy = world.groundY;

    cachedLayer(0, () => {
      // Back wall
      ctx.fillStyle = lin(0, 0, 0, gy, [[0, '#2b2f35'], [1, '#41464d']]);
      ctx.fillRect(0, 0, W, gy);
      for (let x = 0; x < W; x += 64) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)';
        ctx.fillRect(x, 0, 1, gy);
        ctx.fillStyle = 'rgba(255,255,255,0.04)';
        ctx.fillRect(x + 1, 0, 1, gy);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(0, gy - 26, W, 26);

      // High windows with evening light
      const winY = 26, winH = 34;
      const winXs = [];
      for (let x = 30; x < world.truckBack - 70; x += 120) winXs.push(x);
      winXs.forEach((x) => {
        ctx.fillStyle = lin(0, winY, 0, winY + winH, [[0, '#3c5574'], [1, '#d9a27a']]);
        ctx.fillRect(x, winY, 70, winH);
        ctx.fillStyle = '#23272c';
        for (let i = 1; i < 4; i++) ctx.fillRect(x + i * 17.5, winY, 1.5, winH);
        ctx.fillRect(x, winY + winH / 2, 70, 1.5);
      });
      // Steel truss
      ctx.fillStyle = '#1d2024';
      ctx.fillRect(0, 12, W, 6);
      ctx.fillStyle = '#3a3f46';
      ctx.fillRect(0, 12, W, 1);
      ctx.strokeStyle = '#1d2024';
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let x = 0; x < W; x += 40) { ctx.moveTo(x, 18); ctx.lineTo(x + 20, 0); ctx.lineTo(x + 40, 18); }
      ctx.stroke();

      // Stenciled wall sign
      label(tr('cDepot'), W * 0.42, gy * 0.42, 'rgba(236, 232, 225, 0.16)', Math.min(26, W * 0.035), 800);

      // Pallet racking with shrink-wrapped water
      rack(W * 0.05, gy, Math.min(170, W * 0.26));
      if (W > 680) rack(W * 0.52, gy, Math.min(140, W * 0.14));

      // Loading door with the evening outside
      const doorX = world.truckBack - 16;
      ctx.fillStyle = lin(0, 70, 0, gy, [[0, '#33496a'], [0.7, '#c68a64'], [1, '#e7b483']]);
      ctx.fillRect(doorX, 70, W - doorX, gy - 70);
      ctx.fillStyle = '#4e3a33';
      ctx.fillRect(doorX, gy - 16, W - doorX, 16);
      ctx.fillStyle = '#1d2024';
      ctx.fillRect(doorX - 8, 62, W - doorX + 8, 10);
      ctx.fillRect(doorX - 8, 62, 8, gy - 62);
      ctx.fillStyle = '#5b6168';
      for (let i = 0; i < 3; i++) ctx.fillRect(doorX, 72 + i * 4, W - doorX, 2.5);

      // Light shafts from the windows, with dust
      ctx.fillStyle = 'rgba(255, 214, 170, 0.05)';
      winXs.forEach((x) => {
        ctx.beginPath();
        ctx.moveTo(x, winY + winH);
        ctx.lineTo(x + 70, winY + winH);
        ctx.lineTo(x + 70 + gy * 0.5, gy);
        ctx.lineTo(x + gy * 0.5, gy);
        ctx.closePath();
        ctx.fill();
      });

      // Polished concrete floor
      ctx.fillStyle = lin(0, gy, 0, H, [[0, '#6b7178'], [1, '#43484e']]);
      ctx.fillRect(0, gy, W, H - gy);
      winXs.forEach((x) => {
        ctx.fillStyle = 'rgba(255, 220, 180, 0.07)';
        ctx.fillRect(x + gy * 0.5, gy + 2, 70, H - gy);
      });
      ctx.fillStyle = '#c9a227';
      ctx.fillRect(0, gy + 6, W, 2.5);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      for (let x = 40; x < W; x += 110) ctx.fillRect(x, gy + 12, 1, H - gy);
      // hatched zone at the truck
      ctx.save();
      ctx.beginPath();
      ctx.rect(world.truckBack - 60, gy + 10, 60, H - gy);
      ctx.clip();
      ctx.strokeStyle = 'rgba(201, 162, 39, 0.5)';
      ctx.lineWidth = 3;
      for (let i = -80; i < 100; i += 12) {
        ctx.beginPath();
        ctx.moveTo(world.truckBack - 60 + i, gy + 10);
        ctx.lineTo(world.truckBack - 60 + i + 30, H);
        ctx.stroke();
      }
      ctx.restore();
    });

    // Dust drifting through the light
    world.motes.forEach((m) => {
      const x = (m.x * W + Math.sin(S.time * 0.3 + m.p) * 20) % W;
      const y = (m.y * gy + S.time * m.v) % gy;
      ctx.fillStyle = `rgba(255, 230, 200, ${0.15 + Math.sin(S.time + m.p) * 0.1})`;
      ctx.fillRect(x, y, m.s, m.s);
    });

    S.spills.forEach(spill);
    recyclingBin(world.binX, gy);
    conveyor(gy);
    truck(gy, S.truck);
    forklift(S.lift, gy);

    const p = S.player;
    if (!(p.invuln > 0 && Math.floor(p.invuln * 10) % 2)) {
      groundShadow(p.x, gy + 1, 13, p.onGround ? 0.3 : 0.15);
      person(p.x, p.y + p.h, {
        facing: p.facing, walk: p.walk, moving: p.moving, airborne: !p.onGround,
        skin: '#c8906a', top: '#34465e', bottom: '#2b3038', head: 'hardhat', vest: true,
        pose: S.stack.length ? 'carry' : null, stack: S.stack,
      });
      if (p.slipping) label(tr('cSlippery'), p.x, p.y - 10, 'rgba(191, 230, 255, 0.85)', 9, 600);
    }
  }

  function rack(x, gy, w) {
    const h = 150, levels = 3;
    ctx.fillStyle = '#b75a28';
    ctx.fillRect(x, gy - h, 4, h);
    ctx.fillRect(x + w - 4, gy - h, 4, h);
    for (let i = 0; i < levels; i++) {
      const y = gy - 44 - i * 50;
      ctx.fillStyle = '#2a5590';
      ctx.fillRect(x, y, w, 4);
      const n = Math.floor((w - 12) / 38);
      for (let k = 0; k < n; k++) waterPallet(x + 8 + k * 38, y, 32);
    }
  }

  function waterPallet(x, y, w) {
    ctx.fillStyle = '#8a6a45';
    ctx.fillRect(x, y - 4, w, 4);
    ctx.fillStyle = 'rgba(160, 205, 235, 0.55)';
    ctx.fillRect(x + 1, y - 30, w - 2, 26);
    ctx.fillStyle = 'rgba(30, 90, 150, 0.45)';
    for (let r = 0; r < 3; r++) for (let c = 0; c < 4; c++) {
      ctx.fillRect(x + 3 + c * 7.4, y - 28 + r * 8.5, 4.6, 7);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x + 2, y - 29, 2, 24);
  }

  // Cardboard case of bottled water, drawn with a little depth
  function drawCase(cx, bottomY, bad, s = 1) {
    const w = CFG.crateSize * s, h = CFG.crateSize * 0.78 * s, d = 5 * s;
    const x = cx - w / 2, y = bottomY - h;
    const front = bad ? '#8f6a45' : '#c79a62';
    ctx.fillStyle = bad ? '#a8825a' : '#ddb67f';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + d, y - d); ctx.lineTo(x + w + d, y - d); ctx.lineTo(x + w, y);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = bad ? '#6e5034' : '#a87f4f';
    ctx.beginPath();
    ctx.moveTo(x + w, y); ctx.lineTo(x + w + d, y - d); ctx.lineTo(x + w + d, y + h - d); ctx.lineTo(x + w, y + h);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = front;
    ctx.fillRect(x, y, w, h);
    // tape
    ctx.fillStyle = bad ? 'rgba(220, 200, 170, 0.5)' : '#ead6ad';
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 1.5 * s, y); ctx.lineTo(x + w / 2 - 1.5 * s + d, y - d);
    ctx.lineTo(x + w / 2 + 1.5 * s + d, y - d); ctx.lineTo(x + w / 2 + 1.5 * s, y);
    ctx.fill();
    ctx.fillRect(x + w / 2 - 1.5 * s, y, 3 * s, h * 0.3);
    // printed drop logo
    ctx.fillStyle = bad ? 'rgba(40, 90, 140, 0.4)' : '#2a7fc4';
    ctx.beginPath();
    const lx = x + w * 0.3, ly = y + h * 0.62, lr = 2.6 * s;
    ctx.moveTo(lx, ly - lr * 2);
    ctx.quadraticCurveTo(lx + lr, ly - lr * 0.5, lx + lr, ly);
    ctx.arc(lx, ly, lr, 0, Math.PI);
    ctx.quadraticCurveTo(lx - lr, ly - lr * 0.5, lx, ly - lr * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(x + w * 0.45, y + h * 0.55, w * 0.38, 1.2 * s);
    ctx.fillRect(x + w * 0.45, y + h * 0.7, w * 0.28, 1.2 * s);
    if (bad) {
      // water stain, torn corner, drip
      ctx.fillStyle = 'rgba(40, 25, 10, 0.4)';
      ctx.beginPath();
      ctx.moveTo(x, y + h * 0.5);
      ctx.quadraticCurveTo(x + w * 0.4, y + h * 0.35, x + w, y + h * 0.6);
      ctx.lineTo(x + w, y + h); ctx.lineTo(x, y + h);
      ctx.fill();
      ctx.fillStyle = '#1e1a16';
      ctx.beginPath();
      ctx.moveTo(x + w, y); ctx.lineTo(x + w - 6 * s, y); ctx.lineTo(x + w, y + 6 * s);
      ctx.fill();
      const dy = (S.time * 26 + cx) % (10 * s);
      ctx.fillStyle = 'rgba(150, 190, 210, 0.8)';
      ellipse(x + w * 0.7, bottomY + dy, 1.2 * s, 1.8 * s);
      ctx.fill();
    }
  }

  function conveyor(gy) {
    const top = gy - 38, end = world.beltEnd;
    // legs with bracing
    ctx.fillStyle = '#5b6168';
    for (let x = 16; x < end; x += 54) {
      ctx.fillRect(x, top + 12, 4, gy - top - 12);
      ctx.fillRect(x - 3, gy - 2, 10, 2);
    }
    // motor box
    ctx.fillStyle = '#2f5d8a';
    rr(4, top + 16, 22, 14, 2);
    ctx.fill();
    // frame
    ctx.fillStyle = lin(0, top, 0, top + 14, [[0, '#b7bdc4'], [0.4, '#8a9098'], [1, '#4f555c']]);
    rr(-10, top + 2, end + 18, 12, 3);
    ctx.fill();
    // belt surface
    ctx.fillStyle = '#202327';
    ctx.fillRect(-10, top, end + 14, 4);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    const off = (S.time * CFG.beltSpeed * warehouseStride()) % 14;
    for (let x = -10 + off; x < end + 2; x += 14) ctx.fillRect(x, top + 1, 6, 1);
    // end roller
    ellipse(end + 4, top + 7, 6, 6);
    ctx.fillStyle = '#9aa1a8';
    ctx.fill();
    ellipse(end + 4, top + 7, 2, 2);
    ctx.fillStyle = '#4f555c';
    ctx.fill();
    S.belt.forEach((c) => drawCase(c.x, top, c.bad));
    label(tr('cPickUp'), end - 4, top - 30, 'rgba(236, 232, 225, 0.55)', 8, 700);
    if (nearBelt() && S.stack.length < CFG.carryMax && beltReady()) prompt(end, top - 50, tr('pGrab'));
  }

  function recyclingBin(x, gy) {
    const w = 34, h = 44;
    groundShadow(x, gy + 1, 20, 0.25);
    ctx.fillStyle = lin(x - w / 2, 0, x + w / 2, 0, [[0, '#1f4232'], [0.6, '#2f5e46'], [1, '#3d7258']]);
    ctx.beginPath();
    ctx.moveTo(x - w / 2, gy - h); ctx.lineTo(x + w / 2, gy - h);
    ctx.lineTo(x + w / 2 - 3, gy - 4); ctx.lineTo(x - w / 2 + 3, gy - 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#244d3a';
    rr(x - w / 2 - 2, gy - h - 5, w + 4, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#1a1c1f';
    ellipse(x - w / 2 + 6, gy - 3, 4, 4); ctx.fill();
    // recycling mark
    ctx.strokeStyle = 'rgba(236, 232, 225, 0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.moveTo(x + Math.cos(a) * 6, gy - 22 + Math.sin(a) * 6);
      ctx.lineTo(x + Math.cos(a + 1.6) * 6, gy - 22 + Math.sin(a + 1.6) * 6);
    }
    ctx.stroke();
    label(tr('cRecycling'), x, gy - h - 10, 'rgba(236, 232, 225, 0.55)', 8, 700);
    if (nearBin() && S.stack.some((b) => b)) prompt(x, gy - h - 30, tr('pRecycle'));
  }

  function spill(s) {
    const gy = world.groundY;
    const a = Math.min(1, s.life / 2);
    ctx.globalAlpha = a;
    ctx.fillStyle = rad(s.x - 6, gy + 3, 2, s.w / 2, [[0, 'rgba(220, 240, 255, 0.6)'], [1, 'rgba(120, 180, 220, 0.25)']]);
    ellipse(s.x, gy + 4, s.w / 2, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ellipse(s.x - 10, gy + 3, 7, 1);
    ctx.fill();
    // wet floor A-frame sign
    const fx = s.x + s.w / 2 + 6;
    ctx.fillStyle = '#e8b21c';
    ctx.beginPath();
    ctx.moveTo(fx - 6, gy + 2); ctx.lineTo(fx - 2, gy - 20); ctx.lineTo(fx + 2, gy - 20); ctx.lineTo(fx + 6, gy + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d2024';
    ctx.fillRect(fx - 2.5, gy - 12, 5, 1.2);
    ctx.globalAlpha = 1;
    if (Math.abs(S.player.x - s.x) < 44 && !nearBelt() && !nearBin() && !nearTruck()) prompt(s.x, gy - 74, tr('pMop'));
  }

  function truck(gy, T) {
    let dx = 0;
    if (T.arriving > 0) dx = T.arriving * 260;
    if (T.leaving > 0) dx = T.leaving * T.leaving * 260;
    const x = world.truckBack + dx;
    const boxW = Math.max(100, (W - world.truckBack) * 0.62);
    const boxH = 92;
    const boxTop = gy - 24 - boxH;

    groundShadow(x + boxW / 2 + 20, gy + 2, boxW * 0.7, 0.35);

    // cargo box
    ctx.fillStyle = lin(0, boxTop, 0, boxTop + boxH, [[0, '#f4f2ec'], [1, '#d4d1c8']]);
    rr(x, boxTop, boxW, boxH, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    for (let rx = x + 14; rx < x + boxW; rx += 14) ctx.fillRect(rx, boxTop + 2, 1, boxH - 4);
    ctx.fillStyle = '#ffc907';
    ctx.fillRect(x, boxTop + boxH - 18, boxW, 5);

    // open side door showing the load
    const ix = x + 6, iy = boxTop + 6, iw = boxW - 12, ih = boxH - 28;
    ctx.fillStyle = '#2a2a2c';
    ctx.fillRect(ix, iy, iw, ih);
    const cols = 4, rows = Math.ceil(T.target / cols);
    const cw = iw / cols, ch = ih / rows;
    for (let i = 0; i < T.load; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      const cx = ix + c * cw, cy = iy + ih - (r + 1) * ch;
      ctx.fillStyle = (c + r) % 2 ? '#c79a62' : '#bf925a';
      ctx.fillRect(cx + 1, cy + 1, cw - 2, ch - 2);
      ctx.fillStyle = '#ead6ad';
      ctx.fillRect(cx + cw / 2 - 1, cy + 1, 2, ch - 2);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(ix, iy, iw, 4);
    // small drop logo on the box
    label(tr('cTruckSide'), x + boxW / 2, boxTop + boxH - 6, 'rgba(40, 40, 40, 0.55)', 7, 700);

    // cab
    const cabX = x + boxW + 3, cabTop = boxTop + 26;
    ctx.fillStyle = lin(0, cabTop, 0, gy, [[0, '#e9ecef'], [1, '#bfc4c9']]);
    ctx.beginPath();
    ctx.moveTo(cabX, gy - 22);
    ctx.lineTo(cabX, cabTop + 4);
    ctx.quadraticCurveTo(cabX, cabTop, cabX + 6, cabTop);
    ctx.lineTo(cabX + 28, cabTop);
    ctx.lineTo(cabX + 42, cabTop + 28);
    ctx.lineTo(cabX + 46, cabTop + 30);
    ctx.lineTo(cabX + 46, gy - 22);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = lin(cabX, cabTop, cabX + 40, cabTop + 26, [[0, '#2b3d52'], [0.6, '#4d6886'], [1, '#9db3c6']]);
    ctx.beginPath();
    ctx.moveTo(cabX + 6, cabTop + 4);
    ctx.lineTo(cabX + 27, cabTop + 4);
    ctx.lineTo(cabX + 38, cabTop + 26);
    ctx.lineTo(cabX + 6, cabTop + 26);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.fillRect(cabX + 22, cabTop + 30, 1, gy - 22 - cabTop - 34);
    ctx.fillStyle = '#ffe7a8';
    ctx.fillRect(cabX + 42, gy - 36, 4, 5);
    ctx.fillStyle = '#9aa0a6';
    ctx.fillRect(cabX + 40, gy - 26, 8, 4);

    // chassis + wheels
    ctx.fillStyle = '#1d2024';
    ctx.fillRect(x - 3, gy - 26, boxW + 52, 6);
    [x + 22, x + boxW - 22, cabX + 26].forEach((wx) => {
      ctx.fillStyle = '#16181b';
      ellipse(wx, gy - 11, 11, 11);
      ctx.fill();
      ctx.fillStyle = lin(wx - 5, gy - 16, wx + 5, gy - 6, [[0, '#d9dde0'], [1, '#7d8288']]);
      ellipse(wx, gy - 11, 5, 5);
      ctx.fill();
    });

    // loading ramp
    if (!T.leaving && !T.arriving) {
      ctx.fillStyle = '#5b6168';
      ctx.beginPath();
      ctx.moveTo(x - 36, gy); ctx.lineTo(x, gy - 24); ctx.lineTo(x, gy - 19); ctx.lineTo(x - 28, gy);
      ctx.closePath();
      ctx.fill();
    }

    // load + timer readout
    const cx = x + boxW / 2;
    const open = !T.leaving && !T.arriving;
    const pillW = 112, pillY = boxTop - 36;
    ctx.fillStyle = 'rgba(15, 17, 20, 0.8)';
    rr(cx - pillW / 2, pillY, pillW, 26, 7);
    ctx.fill();
    if (open) {
      const urgent = T.time < 10;
      label(tr('cCases', { a: T.load, b: T.target }), cx - pillW / 2 + 10, pillY + 13, '#ece8e1', 10, 600, 'left', pillW * 0.6);
      label(tr('cSecs', { n: Math.ceil(T.time) }), cx + pillW / 2 - 10, pillY + 13, urgent ? '#e2574c' : '#ffc907', 10, 700, 'right', pillW * 0.28);
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(cx - pillW / 2 + 10, pillY + 18, pillW - 20, 2);
      ctx.fillStyle = urgent ? '#e2574c' : '#5bb6f0';
      ctx.fillRect(cx - pillW / 2 + 10, pillY + 18, (pillW - 20) * (T.time / T.maxTime), 2);
      if (nearTruck() && S.stack.length) prompt(cx, boxTop + 34, tr('pLoad'));
    } else {
      label(tr(T.full ? 'cOnWay' : (T.arriving ? 'cPulling' : 'cLeaving')),
        cx, pillY + 17, T.full ? '#9fd39a' : '#ece8e1', 10, 600, 'center', pillW - 12);
    }
  }

  function forklift(L, gy) {
    const x = L.x, f = L.dir;
    groundShadow(x, gy + 1, 32, 0.3);
    // body
    ctx.fillStyle = lin(0, gy - 36, 0, gy - 8, [[0, '#f0bd2c'], [1, '#c48f0f']]);
    ctx.beginPath();
    ctx.moveTo(x - 24 * f, gy - 10);
    ctx.lineTo(x - 24 * f, gy - 28);
    ctx.lineTo(x + 2 * f, gy - 30);
    ctx.lineTo(x + 16 * f, gy - 22);
    ctx.lineTo(x + 16 * f, gy - 10);
    ctx.closePath();
    ctx.fill();
    // counterweight
    ctx.fillStyle = '#2a2d31';
    rr(f > 0 ? x - 28 : x + 18, gy - 30, 10, 20, 3);
    ctx.fill();
    // overhead guard
    ctx.strokeStyle = '#1d2024';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x - 16 * f, gy - 28); ctx.lineTo(x - 16 * f, gy - 58);
    ctx.lineTo(x + 8 * f, gy - 58); ctx.lineTo(x + 10 * f, gy - 30);
    ctx.stroke();
    // operator
    person(x - 5 * f, gy - 26, {
      facing: f, scale: 0.62, skin: '#a8724e', top: '#34465e', bottom: '#2b3038', head: 'hardhat', vest: true,
    });
    // mast + forks
    const mx = x + 20 * f;
    ctx.fillStyle = lin(mx - 2, 0, mx + 2, 0, [[0, '#3b4047'], [1, '#6b7178']]);
    ctx.fillRect(mx - 2, gy - 62, 4, 56);
    ctx.fillStyle = '#2a2d31';
    ctx.fillRect(f > 0 ? mx : mx - 22, gy - 8, 22, 3);
    // wheels
    [[x + 8 * f, 9], [x - 16 * f, 7]].forEach(([wx, r]) => {
      ctx.fillStyle = '#16181b';
      ellipse(wx, gy - r + 1, r, r);
      ctx.fill();
      ctx.fillStyle = '#c48f0f';
      ellipse(wx, gy - r + 1, r * 0.4, r * 0.4);
      ctx.fill();
    });
    // beacon
    if (Math.floor(S.time * 3) % 2) {
      ctx.fillStyle = rad(x - 4 * f, gy - 61, 0, 10, [[0, 'rgba(255, 170, 40, 0.9)'], [1, 'rgba(255, 170, 40, 0)']]);
      ellipse(x - 4 * f, gy - 61, 10, 10);
      ctx.fill();
    }
    ctx.fillStyle = '#ff9a1f';
    ellipse(x - 4 * f, gy - 61, 2.2, 2.2);
    ctx.fill();
    if (L.honk > 0) prompt(x, gy - 82, tr('pBeep'));
  }

  // ---------- Confetti (win celebration) ----------
  const confettiCanvas = $('confetti');
  const cctx = confettiCanvas.getContext('2d');
  let confetti = [];
  let confettiLast = 0;
  const CONFETTI_COLORS = ['#ffc907', '#ffd84d', '#4aa8e8', '#8fd0f5', '#ece8e1', '#e2574c', '#6fbf73'];

  function celebrate(count) {
    const r = stage.getBoundingClientRect();
    confettiCanvas.width = Math.round(r.width * dpr);
    confettiCanvas.height = Math.round(r.height * dpr);
    // two cannons from the bottom corners plus a pop from the middle
    const origins = [
      { x: 0, y: r.height, vx: [120, 520], vy: [-900, -520] },
      { x: r.width, y: r.height, vx: [-520, -120], vy: [-900, -520] },
      { x: r.width / 2, y: r.height * 0.45, vx: [-380, 380], vy: [-520, -120] },
    ];
    for (let i = 0; i < count; i++) {
      const o = origins[i % origins.length];
      confetti.push({
        x: o.x, y: o.y,
        vx: rand(o.vx[0], o.vx[1]), vy: rand(o.vy[0], o.vy[1]),
        w: rand(5, 9), h: rand(9, 15),
        rot: rand(0, Math.PI * 2), vr: rand(-9, 9),
        flip: rand(0, Math.PI * 2), vf: rand(6, 14),
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        life: rand(3.2, 4.8),
      });
    }
    if (confetti.length === count) {
      confettiLast = performance.now();
      requestAnimationFrame(stepConfetti);
    }
  }

  function stepConfetti(now) {
    const dt = Math.min(0.033, (now - confettiLast) / 1000);
    confettiLast = now;
    const w = confettiCanvas.width / dpr, h = confettiCanvas.height / dpr;
    cctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cctx.clearRect(0, 0, w, h);
    confetti.forEach((c) => {
      c.life -= dt;
      c.vy = Math.min(c.vy + 900 * dt, 260);   // falls, then flutters at a slow speed
      c.vx *= 1 - 1.6 * dt;                   // air drag
      c.x += (c.vx + Math.sin(c.flip) * 30) * dt;
      c.y += c.vy * dt;
      c.rot += c.vr * dt;
      c.flip += c.vf * dt;
      cctx.save();
      cctx.globalAlpha = Math.min(1, c.life);
      cctx.translate(c.x, c.y);
      cctx.rotate(c.rot);
      cctx.scale(1, Math.cos(c.flip));          // paper turning over
      cctx.fillStyle = c.color;
      cctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
      cctx.restore();
    });
    confetti = confetti.filter((c) => c.life > 0 && c.y < h + 30);
    if (confetti.length) requestAnimationFrame(stepConfetti);
    else cctx.clearRect(0, 0, w, h);
  }

  // ---------- Render ----------
  function render() {
    const sx = S.shake > 0 ? rand(-3, 3) : 0;
    const sy = S.shake > 0 ? rand(-2, 2) : 0;
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, sx * dpr * scale, sy * dpr * scale);
    ctx.translate(-camX, 0);
    if (isRTL()) {
      // Arabic reads right to left, so the village / warehouse starts on the right
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    }
    if (S.mode === 'village') drawVillage();
    else drawWarehouse();

    S.particles.forEach((q) => {
      ctx.globalAlpha = clamp(q.t / 0.5, 0, 1);
      ctx.fillStyle = q.color;
      ellipse(q.x, q.y, q.r, q.r);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
    S.popups.forEach((q) => {
      ctx.globalAlpha = clamp(q.t * 1.4, 0, 1);
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 4;
      label(q.text, q.x, q.y, q.color, 12, 700);
      ctx.shadowBlur = 0;
    });
    ctx.globalAlpha = 1;

    // Everything below is drawn on the screen itself, not in the world
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    hudSpace = true;
    // gentle vignette for a cinematic frame
    ctx.fillStyle = rad(viewW / 2, H * 0.45, Math.min(viewW, H) * 0.35, Math.max(viewW, H) * 0.8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(10, 6, 4, 0.35)']]);
    ctx.fillRect(0, 0, viewW, H);
    // red edge when hurt
    if (S.player.invuln > 1.2) {
      ctx.fillStyle = `rgba(226, 87, 76, ${(S.player.invuln - 1.2) * 0.4})`;
      ctx.fillRect(0, 0, viewW, H);
    }
    if (followCam && S.running) {
      drawGoalArrow();
      drawMiniMap();
    }
    hudSpace = false;
  }

  // ---------- Phone camera ----------
  // Where the player is on the (possibly mirrored) world, from the left edge
  const shownX = (x) => (isRTL() ? W - x : x);
  // Left edge of the visible slice, in world coordinates
  function visibleLeft() {
    return isRTL() ? W - camX - viewW : camX;
  }
  function updateCamera(dt) {
    if (!followCam) { camX = 0; return; }
    const target = clamp(shownX(S.player.x) - viewW / 2, 0, Math.max(0, W - viewW));
    camX = snapCam ? target : camX + (target - camX) * Math.min(1, dt * 6);
    snapCam = false;
  }

  // The next place the player should go, with its prompt label
  function currentGoal() {
    if (S.mode === 'village') {
      if (S.carry > 0 && !S.purify.active) return { x: world.stationX, key: 'pPurify' };
      return null;
    }
    if (S.stack.some((b) => b)) return { x: world.binX, key: 'pRecycle' };
    if (S.stack.length) return { x: world.truckBack + 30, key: 'pLoad' };
    return { x: world.beltEnd, key: 'pGrab' };
  }

  // An arrow on the screen edge pointing to the goal when it's off screen
  function drawGoalArrow() {
    const goal = currentGoal();
    if (!goal) return;
    const sxGoal = shownX(goal.x) - camX;
    if (sxGoal > 24 && sxGoal < viewW - 24) return;
    const right = sxGoal >= viewW - 24;
    const text = tr(goal.key);
    ctx.font = `600 11px ${fontFor()}`;
    const w = ctx.measureText(text).width + 34;
    const h = 26;
    const y = H * 0.38 + Math.sin(S.time * 4) * 2;
    const x = right ? viewW - w - 8 : 8;
    ctx.fillStyle = 'rgba(15, 17, 20, 0.82)';
    rr(x, y - h / 2, w, h, 13);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255, 201, 7, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // arrow head
    const ax = right ? x + w - 13 : x + 13;
    ctx.fillStyle = '#ffc907';
    ctx.beginPath();
    ctx.moveTo(ax + (right ? 5 : -5), y);
    ctx.lineTo(ax + (right ? -3 : 3), y - 6);
    ctx.lineTo(ax + (right ? -3 : 3), y + 6);
    ctx.closePath();
    ctx.fill();
    label(text, right ? x + 10 : x + 24, y + 4, '#ece8e1', 11, 600, 'left');
  }

  // A thin strip showing the whole level, the part on screen, and key places
  function drawMiniMap() {
    const pad = 14, mw = viewW - pad * 2, my = H - 15, mh = 6;
    const mapX = (wx) => pad + (shownX(wx) / W) * mw;
    ctx.fillStyle = 'rgba(15, 17, 20, 0.7)';
    rr(pad - 6, my - 7, mw + 12, mh + 14, 9);
    ctx.fill();
    ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
    rr(pad, my, mw, mh, 3);
    ctx.fill();
    const dot = (wx, color, r = 3) => {
      ctx.fillStyle = color;
      ellipse(mapX(wx), my + mh / 2, r, r);
      ctx.fill();
    };
    if (S.mode === 'village') {
      // restricted area as a red stretch
      const a = mapX(world.signX), b = mapX(W);
      ctx.fillStyle = 'rgba(226, 87, 76, 0.75)';
      ctx.fillRect(Math.min(a, b), my, Math.abs(b - a), mh);
      dot(world.houseX, '#d9a273');
      dot(world.stationX, '#5bb6f0', 3.5);
    } else {
      dot(world.beltEnd, '#c79a62');
      dot(world.binX, '#6fbf73', 3.5);
      dot(S.lift.x, '#ff9f1a');
      dot(world.truckBack + 40, '#ece8e1', 3.5);
    }
    // the part of the world on screen
    const l = pad + (camX / W) * mw, rw = (viewW / W) * mw;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 1;
    rr(l, my - 3, rw, mh + 6, 3);
    ctx.stroke();
    dot(S.player.x, '#ffc907', 3.5);
  }

  // ---------- Main loop ----------
  let last = performance.now();
  function loop(now) {
    const playing = S.running && !S.paused && !S.over;
    // Behind menus the scene only drifts, so ~20fps is plenty and saves battery
    if (!playing && now - last < 50) { requestAnimationFrame(loop); return; }
    const dt = Math.min(playing ? 0.033 : 0.06, (now - last) / 1000);
    last = now;
    if (playing) update(dt);
    else S.time += dt * 0.3; // keep the scene gently moving behind menus
    updateCamera(dt);
    render();
    syncUI();
    requestAnimationFrame(loop);
  }

  // ---------- Language ----------
  const langSelect = $('langSelect');
  // Fill the menu from the language list in i18n.js
  window.I18N.languages.forEach(({ code, name }) => {
    const opt = document.createElement('option');
    opt.value = code;
    opt.lang = code;
    opt.dir = window.I18N.directionOf(code);
    opt.textContent = name;
    langSelect.appendChild(opt);
  });
  langSelect.value = window.I18N.lang;
  langSelect.addEventListener('change', () => window.I18N.setLang(langSelect.value));
  window.I18N.onChange(() => {
    langSelect.value = window.I18N.lang;
    applyModeText();
    for (const k in cache) delete cache[k];
    renderPen(true);
    renderDifficulty();
    renderSoundBtn();
    // refresh an open end screen in the new language
    if (S.over) {
      const village = S.mode === 'village';
      $('endTitle').textContent = tr(S.won ? 'wellDone' : 'gameOver');
      $('endText').textContent = tr(village ? (S.won ? 'winVillage' : 'loseVillage') : (S.won ? 'winWarehouse' : 'loseWarehouse'));
      $('endFact').textContent = tr('facts')[S.factIndex || 0];
    }
  });
  window.I18N.init();
  renderDifficulty();
  renderSoundBtn();

  // ---------- Boot ----------
  window.addEventListener('resize', resize);
  landscapeMQ.addEventListener('change', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(stage);
  resize();
  newGame('village');
  requestAnimationFrame(loop);
})();
