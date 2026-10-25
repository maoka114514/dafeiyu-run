// 大肥鱼快跑 · 引擎
// 所有内容（关卡、怪物、商品、贴图）都来自 content/*.json，这里只放规则。
export function start(DATA, opts) {
  const { sprites, items: ITEMS, enemies: ENEMY_DEF, chapter } = DATA;
  const PAL = sprites.palette, S = sprites.scale || 3;
  const SPR = { run0: sprites.run0, run1: sprites.run1, jump: sprites.jump };
  const INF = !!(opts && opts.infinite);
  const SAVEKEY = 'dfy_save' + (INF ? '_inf' : '');
  const THEME = chapter.theme;
  const LEVELS = chapter.levels.length;

  const cv = document.getElementById('c'), ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const W = 960, H = 320, GY = 250;
  let PW = 16 * S, PH = 18 * S;
  const PIMG = (opts && opts.playerImg) || null;
  if (PIMG) { PH = 76; PW = Math.round(76 * PIMG.width / PIMG.height); }

  const DARK = { bg: THEME.bg, fg: '#e6ecf5', dim: '#8b97a8' };

  /* ---------- 存档 ---------- */
  const DEF = { v: 2, mute: false, pts: 0, owned: [], eq: { head: null, face: null, tail: null }, clears: {}, best: {} };
  let SAVE = JSON.parse(JSON.stringify(DEF));
  try {
    const raw = localStorage.getItem(SAVEKEY);
    if (raw) SAVE = migrate(JSON.parse(raw));
  } catch (e) { }
  function migrate(old) {
    const s = Object.assign({}, DEF, old);
    s.eq = Object.assign({}, DEF.eq, old.eq || {});
    if (!Array.isArray(s.owned)) s.owned = [];
    if (!s.clears) s.clears = {};
    if (!s.best) s.best = {};
    s.v = 2;
    return s;
  }
  const save = () => localStorage.setItem(SAVEKEY, JSON.stringify(SAVE));

  /* ---------- 音效 ---------- */
  let AC = null;
  const ac = () => AC || (AC = new (window.AudioContext || window.webkitAudioContext)());
  function beep(f, d, t, v) {
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.type = t || 'square'; o.frequency.value = f; g.gain.value = v || .05;
      g.gain.exponentialRampToValueAtTime(.0001, a.currentTime + d);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + d);
    } catch (e) { }
  }
  const SFX = {
    jump: () => beep(520, .09, 'square', .04),
    jump2: () => beep(660, .09, 'square', .04),
    dive: () => beep(220, .12, 'sawtooth', .04),
    slide: () => beep(300, .14, 'sawtooth', .035),
    stomp: () => { beep(180, .08, 'square', .05); setTimeout(() => beep(520, .1, 'square', .05), 50); },
    pick: () => { beep(720, .07, 'triangle', .05); setTimeout(() => beep(960, .09, 'triangle', .05), 60); },
    hit: () => { beep(140, .25, 'sawtooth', .07); setTimeout(() => beep(90, .3, 'sawtooth', .05), 60); },
    clear: () => [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, .16, 'triangle', .05), i * 90)),
    ui: () => beep(440, .05, 'square', .03),
    buy: () => [880, 1170].forEach((f, i) => setTimeout(() => beep(f, .12, 'triangle', .05), i * 70))
  };

  /* ---------- BGM（程序化 chiptune，无音频文件） ---------- */
  const BGM = { on: false, timer: null, step: 0, next: 0, gain: null, cfg: null };
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);

  function bgmNote(midi, at, dur, type, vol) {
    const a = ac();
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.value = mtof(midi);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(BGM.gain);
    o.start(at); o.stop(at + dur + 0.02);
  }
  function bgmNoise(at, dur, vol, hp) {
    const a = ac();
    const len = Math.floor(a.sampleRate * dur);
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = a.createBufferSource(); s.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 6000;
    const g = a.createGain(); g.gain.value = vol;
    s.connect(f); f.connect(g); g.connect(BGM.gain);
    s.start(at);
  }

  // 4 小节循环：Am - F - C - G，小调五声
  const PROG = [
    { root: 45, tones: [57, 60, 64, 69] },
    { root: 41, tones: [53, 57, 60, 65] },
    { root: 48, tones: [48, 52, 55, 60] },
    { root: 43, tones: [55, 59, 62, 67] }
  ];

  function bgmStep(step, at, spb) {
    const bar = Math.floor(step / 16) % 4;
    const s16 = step % 16;
    const ch = PROG[bar];
    const boss = BGM.cfg.boss;

    // 和弦垫：每小节一铺，两音就够，撑住气氛不抢戏
    if (s16 === 0) {
      bgmNote(ch.tones[0] - 12, at, spb * 15, 'sine', 0.030);
      bgmNote(ch.tones[2], at, spb * 15, 'sine', 0.018);
    }
    // 贝斯：一、二拍半、三拍半，走起来有推进但不密
    if (s16 === 0 || s16 === 6 || s16 === 10) {
      bgmNote(ch.root, at, spb * 3, 'triangle', 0.130);
    }
    // 主旋律：八分音符，跳过第一拍让鼓说话
    if (s16 % 4 === 0 && s16 !== 0) {
      bgmNote(ch.tones[(bar + s16 / 4) % 4] + 12, at, spb * 2.4, 'triangle', 0.055);
    }
    // 底鼓：一、三拍
    if (s16 === 0 || s16 === 8) bgmNote(45, at, 0.16, 'sine', 0.150);
    // 军鼓：二、四拍，很轻
    if (s16 === 4 || s16 === 12) bgmNoise(at, 0.09, 0.030, 1800);
    // 高音镲：只在每小节第一拍，一下
    if (s16 === 0) bgmNoise(at, 0.04, 0.012, 7000);
  }

  function bgmSched() {
    try {
      const a = ac();
      if (!a || !BGM.on) return;
      const spb = 60 / BGM.cfg.tempo / 4;
      while (BGM.next < a.currentTime + 0.15) {
        bgmStep(BGM.step, BGM.next, spb);
        BGM.step = (BGM.step + 1) % 64;
        BGM.next += spb;
      }
    } catch (e) { }
  }

  function bgmStart(conf) {
    try {
      const a = ac();
      if (!a) return;
      if (!BGM.gain) {
        BGM.gain = a.createGain(); BGM.gain.gain.value = 0;
        BGM.lp = a.createBiquadFilter(); BGM.lp.type = 'lowpass'; BGM.lp.frequency.value = 3600; BGM.lp.Q.value = 0.3;
        BGM.gain.connect(BGM.lp); BGM.lp.connect(a.destination);
      }
      BGM.cfg = Object.assign({ tempo: 128, boss: false }, conf || {});
      BGM.step = 0; BGM.next = a.currentTime + 0.08; BGM.on = true;
      if (a.state === 'suspended') a.resume();
      BGM.gain.gain.cancelScheduledValues(a.currentTime);
      BGM.gain.gain.setTargetAtTime(SAVE.mute ? 0 : 0.85, a.currentTime, 0.2);
      if (!BGM.timer) BGM.timer = setInterval(bgmSched, 25);
    } catch (e) { }
  }
  function bgmStop() {
    try {
      if (!BGM.on) return;
      BGM.on = false;
      const a = ac();
      if (a && BGM.gain) BGM.gain.gain.setTargetAtTime(0, a.currentTime, 0.12);
    } catch (e) { }
  }
  function bgmMuteToggle() {
    SAVE.mute = !SAVE.mute; save();
    const a = ac();
    if (a && BGM.gain) BGM.gain.gain.setTargetAtTime(SAVE.mute ? 0 : 0.85, a.currentTime, 0.05);
  }
  /* ---------- 关卡 ---------- */
  const cfgOf = n => Object.assign({}, chapter.levels[n - 1]);

  /* ---------- 状态 ---------- */
  let st = 'menu', level = 1, cfg = cfgOf(1);
  let player, enemies, bullets, pickups, pops, rice, cam, tSec, dist, target, buffs;
  let flash = 0, shake = 0, deadT = 0, winT = 0, R = Math.random, lvSel = 0;
  let paused = false, toast = null, toastT = 0, settled = null, deathGain = 0;

  const newPlayer = () => ({ x: 120, y: GY - PH, vy: 0, onGround: true, jumps: 0, frame: 0, ft: 0, duck: false, hurt: 0, inv: 0 });
  function rng(seed) { let a = seed >>> 0; return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  function startLevel(n) {
    level = n; cfg = cfgOf(n);
    player = newPlayer(); enemies = []; bullets = []; pickups = []; pops = []; rice = [];
    cam = 0; dist = 0; tSec = 0; buffs = { spd: 0, inv: 0, mag: 0, slow: 0, trj: 0 };
    flash = 0; shake = 0; deadT = 0; winT = 0; toast = null; toastT = 0; paused = false; settled = null;
    R = rng(1000 + n * 7717);
    target = cfg.speed * 60 * cfg.dur;
    if (cfg.boss) enemies.push({ type: 'boss', x: 0, y: GY - 150, hp: 60, maxhp: 60, t: 0, dead: false, volley: 0 });
    else {
      let x = 520;
      while (x < target - 700) {
        const r = R(); let type = 'stat';
        if (r < cfg.flyP) type = 'fly';
        else if (r < cfg.flyP + cfg.patrolP) type = 'patrol';
        else if (r < cfg.flyP + cfg.patrolP + cfg.shotP) type = 'shot';
        const def = ENEMY_DEF[type] || {};
        const wy = type === 'fly' ? Math.min(206, 150 + R() * 55) : GY;
        const isElite = cfg.elite && R() < 0.35;
        enemies.push({
          type, x, baseX: x, y: wy, hp: isElite ? 2 : (def.hp || 1), t: R() * 6,
          elite: isElite, dead: false, cool: 1 + R() * 2, hitT: 0
        });
        x += cfg.gap * (0.7 + R() * 0.9);
        if (R() < 0.45) pickups.push({ x: x - 60, y: R() < .5 ? GY - 60 - R() * 70 : GY - 30, got: false });
      }
      rice.push({ x: target, y: GY });
    }
    st = 'play';
    bgmStart(Object.assign({ boss: !!cfg.boss }, cfg.bgm || chapter.bgm || {}));
  }

  /* ---------- 输入 ---------- */
  const keys = {};
  addEventListener('keydown', e => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter', 'Escape'].includes(e.code)) e.preventDefault();
    keys[e.code] = true;
    if (e.code === 'Space' || e.code === 'ArrowUp') onJump();
    if (e.code === 'ArrowDown') onDive();
    if (e.code === 'Enter') onConfirm();
    if (e.code === 'Escape') onBack();
    if (e.code === 'KeyM') bgmMuteToggle();
  });
  addEventListener('keyup', e => {
    keys[e.code] = false;
    if (e.code === 'ArrowDown' && st === 'play') player.duck = false;
  });

  function onJump() {
    if (st === 'menu') { st = 'levels'; SFX.ui(); return; }
    if (st === 'levels') { startLevel(lvSel + 1); SFX.ui(); return; }
    if (st !== 'play') return;
    const maxJ = 2 + (buffs.trj > 0 ? 1 : 0);
    player.duck = false;
    if (player.onGround) { player.vy = -13.2; player.onGround = false; player.jumps = 1; SFX.jump(); }
    else if (player.jumps < maxJ) { player.vy = -13.2; player.jumps++; SFX.jump2(); }
  }
  function onDive() {
    if (st !== 'play') return;
    if (!player.onGround) { player.vy = 19; SFX.dive(); }
    else if (!player.duck) { player.duck = true; SFX.slide(); }
  }
  function onConfirm() {
    if (st === 'menu') { st = 'levels'; return; }
    if (st === 'levels') { startLevel(lvSel + 1); return; }
    if (st === 'dead') { startLevel(level); return; }
    if (st === 'clear') { lvSel = Math.min(LEVELS - 1, level); st = 'levels'; }
  }
  function onBack() {
    if (st === 'play') { paused = !paused; return; }
    if (['levels', 'shop', 'wardrobe'].includes(st)) { st = 'menu'; return; }
    if (st === 'dead') { st = 'levels'; return; }
  }

  const buttons = [];
  const hitTest = (x, y) => buttons.some(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h && (b.act(), true));
  function toCanvas(ev) {
    const r = cv.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (W / r.width), y: (ev.clientY - r.top) * (H / r.height) };
  }
  const wakeAudio = () => { const a = ac(); if (a && a.state === 'suspended') a.resume(); };
  addEventListener('pointerdown', wakeAudio, { once: false });
  addEventListener('keydown', wakeAudio, { once: false });

  cv.addEventListener('pointerdown', ev => {
    ev.preventDefault();
    const p = toCanvas(ev);
    if (hitTest(p.x, p.y)) return;
    if (st === 'play') onJump();
    else if (st === 'menu') { st = 'levels'; }
    else if (st === 'dead') { startLevel(level); }
  });

  /* ---------- 更新 ---------- */
  function update(dt) {
    if (toastT > 0) { toastT -= dt / 60; if (toastT <= 0) toast = null; }
    if (st !== 'play' || paused) return;
    tSec += dt / 60;
    for (const k in buffs) if (buffs[k] > 0) buffs[k] = Math.max(0, buffs[k] - dt / 60);

    const sliding = player.duck && player.onGround;
    const slowF = buffs.slow > 0 ? 0.55 : 1;
    const spd = cfg.speed * (buffs.spd > 0 ? 1.35 : 1) * (sliding ? 1.12 : 1);
    dist += spd * dt * slowF; cam += spd * dt * slowF;

    player.vy += 0.72 * dt; player.y += player.vy * dt;
    if (player.y >= GY - PH) { player.y = GY - PH; player.vy = 0; player.onGround = true; player.jumps = 0; }
    player.ft += dt; if (player.ft > 7) { player.ft = 0; player.frame ^= 1; }

    if (buffs.mag > 0) for (const p of pickups) {
      if (p.got) continue;
      const sx = p.x - cam + 120;
      const dx = player.x - sx, dy = (player.y + PH / 2) - p.y, d = Math.hypot(dx, dy);
      if (d < 160) { p.x += dx * .05; p.y += dy * .05; }
    }
    for (const p of pickups) {
      if (p.got) continue;
      const sx = p.x - cam + 120;
      if (Math.abs(sx - (player.x + PW / 2)) < 28 && Math.abs(p.y - (player.y + PH / 2)) < 34) {
        p.got = true; giveBuff(); SFX.pick();
      }
    }

    for (const e of enemies) {
      if (e.dead) continue;
      if (e.hitT > 0) e.hitT = Math.max(0, e.hitT - dt / 60);
      e.t += dt;
      const def = ENEMY_DEF[e.type] || {};
      if (e.type === 'patrol') e.x = e.baseX + Math.sin(e.t * .05) * (def.patrolRange || 90);
      if (e.type === 'shot') {
        const onScreen = (e.x - cam + 120) < W + 60;
        e.cool -= dt / 60;
        if (onScreen && e.cool <= 0) {
          e.cool = Math.max(def.bulletMin || .9, (def.shootCooldown || 2.4) - tSec * .015);
          bullets.push({ x: e.x - cam + 120, y: e.y - 28, vx: -(def.bulletSpeed || 7.2), vy: 0, r: 6 });
        }
      }
      if (e.type === 'boss') bossTick(e, dt);
    }
    for (const b of bullets) { b.x += b.vx * dt * slowF; b.y += b.vy * dt; if (b.y > GY - 8) b.y = GY - 8; }
    bullets = bullets.filter(b => b.x > -60);

    if (buffs.inv <= 0) {
      const dk = player.duck && player.onGround;
      const px = player.x + PW * 0.28, pw = PW * 0.44;
      const py = player.y + (dk ? PH * .55 : 8);
      const ph = dk ? PH * .42 : PH - 12;
      for (const e of enemies) {
        if (e.dead) continue;
        const def = ENEMY_DEF[e.type] || {};
        let hx, hy, hw, hh;
        if (e.type === 'boss') { hx = 760; hy = GY - 150; hw = 150; hh = 150; }
        else {
          const s = e.elite ? 1.5 : 1, ex = e.x - cam + 120;
          if (e.type === 'fly') {
            // 飞行怪以 e.y 为中心，判定盒要和贴图对上
            hw = 30 * s; hh = 18 * s; hx = ex - hw / 2; hy = e.y - 11 * s;
          } else {
            const bw = (def.w || 24) * s, bh = (def.h || 30) * s;
            hx = ex - bw / 2; hy = e.y - bh; hw = bw; hh = bh;
          }
        }
        if (px < hx + hw - 6 && px + pw > hx + 6 && py < hy + hh - 4 && py + ph > hy + 4) {
          const feet = player.y + PH;
          const stompable = (def.stomp !== false) && e.type !== 'boss' && player.vy > -5 && feet <= hy + hh * 0.9;
          if (stompable) {
            e.hp -= 1;
            if (e.hp > 0) { e.hitT = .6; player.vy = -10.5; player.jumps = 1; player.duck = false; score += 10; shake = 2; SFX.stomp(); }
            else { e.dead = true; player.vy = -11.5; player.jumps = 1; player.duck = false; score += 50; pops.push({ x: player.x + 20, y: player.y, t: 1 }); shake = 3; SFX.stomp(); }
          } else { die(); break; }
        }
      }
      if (st === 'play') for (const b of bullets) {
        if (Math.abs(b.x - (player.x + PW / 2)) < 24 && Math.abs(b.y - (player.y + PH / 2)) < 26) { die(); break; }
      }
    }

    if (rice.length && st === 'play') {
      const gx = rice[0].x - cam + 120;
      if (player.x + PW > gx - 30) { player.inv = 999; st = 'eating'; winT = 0; SFX.clear(); }
    }
    for (const q of pops) { q.t -= dt / 60; q.y -= dt * .6; }
    pops = pops.filter(q => q.t > 0);
    flash = Math.max(0, flash - dt * .06);
    shake = Math.max(0, shake - dt * .5);
  }

  function bossTick(b, dt) {
    b.t += dt / 60;
    b.hp = Math.max(0, 60 - 60 * (tSec / cfg.dur));
    b.volley -= dt / 60;
    if (b.volley <= 0) {
      b.volley = Math.max(.55, 1.6 - b.t * .02);
      const sx = 780, mode = Math.floor(b.t * 2) % 3;
      if (mode === 0) for (let i = 0; i < 3; i++) bullets.push({ x: sx - 40, y: b.y + 40 + i * 26, vx: -6.4, vy: 0, r: 6 });
      else if (mode === 1) { bullets.push({ x: sx - 40, y: b.y + 70, vx: -7.4, vy: 0, r: 7 }); bullets.push({ x: sx - 40, y: b.y + 110, vx: -6.0, vy: 0, r: 6 }); }
      else bullets.push({ x: sx - 40, y: GY - 26, vx: -8.2, vy: 0, r: 7 });
    }
  }

  const BUFF_NAME = { spd: '加速', inv: '无敌', mag: '米粒磁铁', slow: '子弹减速', trj: '三段跳' };
  function giveBuff() {
    const pool = (chapter.pickups && chapter.pickups.pool) || ['spd', 'inv'];
    const k = pool[Math.floor(Math.random() * pool.length)];
    buffs[k] = k === 'trj' ? (chapter.pickups.threeJumpSeconds || 12) : (chapter.pickups.buffSeconds || 6);
    toast = '米饭！' + (BUFF_NAME[k] || k); toastT = 1.6;
  }

  function die() {
    if (st !== 'play') return;
    const pg = Math.min(99, Math.floor(dist / target * 100));
    const oldBest = SAVE.best[level] || 0;
    deathGain = 0;
    if (pg > oldBest) {
      deathGain = pg - oldBest;          // 只给"进步"的那部分，防止反复刷
      if (!INF) SAVE.pts += deathGain;
      SAVE.best[level] = pg;
      save();
    }
    player.hurt = 1; st = 'dead'; deadT = 0; shake = 8; SFX.hit(); bgmStop();
  }

  function settle() {
    const sc = chapter.scoring || { base: 100, timeBonusPerSec: 5, noHitBonus: 200, repeatMult: [1, .5, .2] };
    const base = level * (sc.base || 100);
    const timeBonus = Math.max(0, Math.floor((cfg.dur - tSec) * (sc.timeBonusPerSec || 5)));
    const noHit = player.hurt === 0 ? (sc.noHitBonus || 200) : 0;
    const n = SAVE.clears[level] || 0;
    const mult = (sc.repeatMult || [1, .5, .2])[Math.min(n, 2)];
    return { base, timeBonus, noHit, mult, gain: Math.floor((base + timeBonus + noHit) * mult) };
  }

  /* ---------- 绘制 ---------- */
  let score = 0;

  function bg() {
    ctx.fillStyle = THEME.bg; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = THEME.far;
    for (let i = 0; i < 8; i++) { const bx = ((i * 180 - cam * .25) % 1440 + 1440) % 1440 - 180; ctx.fillRect(bx, 110, 120, 140); ctx.fillRect(bx + 20, 80, 80, 40); }
    ctx.fillStyle = THEME.mid;
    for (let i = 0; i < 10; i++) { const bx = ((i * 140 - cam * .55) % 1400 + 1400) % 1400 - 140; ctx.fillRect(bx, 170, 90, 90); }
    ctx.fillStyle = THEME.ground; ctx.fillRect(0, GY, W, H - GY);
    ctx.fillStyle = THEME.groundLine;
    for (let i = 0; i < 40; i++) { const x = ((i * 48 - cam) % 1920 + 1920) % 1920 - 48; ctx.fillRect(x, GY, 26, 3); }
    ctx.fillStyle = THEME.groundEdge; ctx.fillRect(0, GY, W, 2);
  }

  function drawMap(map, x, y, s) {
    for (let r = 0; r < map.length; r++) {
      const row = map[r];
      for (let c = 0; c < row.length; c++) {
        const ch = row[c]; if (ch === '.') continue;
        ctx.fillStyle = PAL[ch] || '#000'; ctx.fillRect(x + c * s, y + r * s, s, s);
      }
    }
  }

  // 饰品：按角色贴图比例定位（0~1 归一化），换模型也不用改
  function drawCostume(x, y, w, h) {
    const eq = SAVE.eq;
    const R = (nx, ny, nw, nh, c) => { ctx.fillStyle = c; ctx.fillRect(x + nx * w, y + ny * h, nw * w, nh * h); };

    if (eq.head === 'cat') {
      R(0.21, 0.10, 0.12, 0.11, '#2f4f7f'); R(0.65, 0.10, 0.12, 0.11, '#2f4f7f');
      R(0.23, 0.075, 0.06, 0.05, '#e06a7a'); R(0.69, 0.075, 0.06, 0.05, '#e06a7a');
    } else if (eq.head === 'pot') {
      R(0.22, 0.085, 0.56, 0.05, '#9aa0aa');
      R(0.16, 0.125, 0.68, 0.07, '#8a8f98');
      R(0.12, 0.19, 0.76, 0.045, '#6d7178');
      R(0.31, 0.055, 0.13, 0.035, '#b6bcc6');
    } else if (eq.head === 'coral') {
      R(0.29, 0.09, 0.06, 0.09, '#e06a7a');
      R(0.47, 0.07, 0.06, 0.11, '#e06a7a');
      R(0.65, 0.10, 0.06, 0.08, '#e06a7a');
    }

    if (eq.face === 'shade') {
      R(0.31, 0.355, 0.38, 0.05, '#141a24');
      R(0.31, 0.355, 0.12, 0.025, '#2b3a4a');
    } else if (eq.face === 'mono') {
      R(0.56, 0.345, 0.15, 0.07, '#dfe6f2');
      R(0.56, 0.375, 0.15, 0.016, '#141a24');
      R(0.585, 0.352, 0.035, 0.035, '#ffffff');
    } else if (eq.face === 'mask') {
      R(0.38, 0.465, 0.25, 0.08, '#dfe6f2');
    }

    if (eq.tail === 'bell') {
      R(0.78, 0.76, 0.07, 0.07, '#e6c86a');
    } else if (eq.tail === 'flag') {
      R(0.755, 0.66, 0.025, 0.18, '#8b97a8');
      R(0.78, 0.66, 0.12, 0.09, '#e06a7a');
    } else if (eq.tail === 'star') {
      R(0.72, 0.70, 0.04, 0.04, '#ffffff');
      R(0.86, 0.68, 0.03, 0.03, '#ffffff');
      R(0.79, 0.86, 0.03, 0.03, '#ffffff');
    }
  }
  function drawPlayer() {
    const p = player;
    let map = SPR.run0;
    if (st === 'eating' || p.eat) map = SPR.run1;
    else if (!p.onGround) map = SPR.jump;
    else map = p.frame ? SPR.run1 : SPR.run0;
    ctx.save();
    const cx = p.x + PW / 2, cy = p.y + PH / 2;
    ctx.translate(cx, cy);
    if (st === 'dead') ctx.rotate(-0.35);
    if (st === 'eating') ctx.rotate(0.25);
    const dk = p.duck && p.onGround;
    const sq = st === 'eating' ? 1.1 : 1;
    const airStretch = (PIMG && !p.onGround) ? (p.vy < 0 ? 1.06 : 1.03) : 1;
    const dy = dk ? 0.58 : sq;
    ctx.scale(1 / Math.sqrt(airStretch), dy * airStretch);
    if (dk || sq !== 1) ctx.translate(0, (1 - dy) * PH / 2);
    ctx.translate(-cx, -cy);
    if (p.inv > 0 || buffs.inv > 0) ctx.globalAlpha = 0.78 + 0.22 * Math.sin(performance.now() / 90);
    const bob = (PIMG && p.onGround && st === 'play' && p.frame) ? 1.5 : 0;
    if (PIMG) ctx.drawImage(PIMG, p.x, p.y + bob, PW, PH);
    else drawMap(map, p.x, p.y, S);
    ctx.globalAlpha = 1;
    drawCostume(p.x, p.y + bob, PW, PH);
    ctx.restore();
  }

  function drawEnemy(e) {
    if (e.dead) return;
    const x = e.type === 'boss' ? 760 : e.x - cam + 120;
    if (e.type !== 'boss' && (x < -160 || x > W + 160)) return;
    const def = ENEMY_DEF[e.type] || {};
    if (e.type === 'boss') { drawBoss(e, x); return; }
    const s = e.elite ? 1.5 : 1;
    ctx.save(); ctx.translate(x, e.y);
    const body = e.elite ? (def.eliteColor || '#b04a5a') : (def.color || '#5a7a9a');
    const eye = '#141a24';
    if (e.type === 'fly') {
      ctx.fillStyle = body; ctx.fillRect(-14 * s, -10 * s, 28 * s, 14 * s);
      ctx.fillStyle = '#7fb0e8';
      const f = Math.sin(e.t * .2) > 0;
      ctx.fillRect(-22 * s, f ? -18 * s : -8 * s, 10 * s, 4 * s);
      ctx.fillRect(12 * s, f ? -18 * s : -8 * s, 10 * s, 4 * s);
      ctx.fillStyle = eye; ctx.fillRect(-8 * s, -6 * s, 4 * s, 4 * s); ctx.fillRect(4 * s, -6 * s, 4 * s, 4 * s);
    } else if (e.type === 'shot') {
      ctx.fillStyle = body; ctx.fillRect(-12 * s, -30 * s, 24 * s, 30 * s);
      ctx.fillStyle = '#3f5a72'; ctx.fillRect(-6 * s, -36 * s, 12 * s, 8 * s);
      ctx.fillStyle = eye; ctx.fillRect(-6 * s, -22 * s, 4 * s, 4 * s); ctx.fillRect(2 * s, -22 * s, 4 * s, 4 * s);
    } else {
      ctx.fillStyle = body; ctx.fillRect(-12 * s, -30 * s, 24 * s, 30 * s);
      ctx.fillStyle = '#3f5a72'; ctx.fillRect(-12 * s, -10 * s, 24 * s, 10 * s);
      ctx.fillStyle = eye; ctx.fillRect(-8 * s, -22 * s, 5 * s, 5 * s); ctx.fillRect(3 * s, -22 * s, 5 * s, 5 * s);
      ctx.fillStyle = '#e06a7a'; ctx.fillRect(-4 * s, -12 * s, 8 * s, 3 * s);
    }
    if (e.elite) {
      ctx.strokeStyle = e.hitT > 0 ? '#ffffff' : '#e6c86a'; ctx.lineWidth = 2;
      ctx.strokeRect(-16 * s, -36 * s, 32 * s, 38 * s);
      if (e.hp > 1) { ctx.fillStyle = '#e6c86a'; ctx.fillRect(-16 * s, -42 * s, 32 * s, 3 * s); }
    }
    ctx.restore();
  }

  function drawBoss(e, x) {
    ctx.save(); ctx.translate(x, e.y);
    const wob = Math.sin(e.t * .06) * 4;
    ctx.fillStyle = '#3b4f72'; ctx.fillRect(-70, wob, 150, 150 - wob);
    ctx.fillStyle = '#2c3c59'; ctx.fillRect(-70, 90, 150, 60);
    ctx.fillStyle = '#e6ecf5'; ctx.fillRect(-42, 30, 34, 26); ctx.fillRect(20, 30, 34, 26);
    ctx.fillStyle = '#141a24'; ctx.fillRect(-32, 36, 16, 14); ctx.fillRect(30, 36, 16, 14);
    ctx.fillStyle = '#141a24'; ctx.fillRect(-30, 96, 70, 26);
    ctx.fillStyle = '#e06a7a'; ctx.fillRect(-24, 102, 58, 6);
    ctx.fillStyle = '#141a24'; ctx.fillRect(-70, -24, 150, 10);
    ctx.fillStyle = '#e06a7a'; ctx.fillRect(-70, -24, 150 * (e.hp / e.maxhp), 10);
    ctx.restore();
  }

  function drawPickup(p) {
    const x = p.x - cam + 120;
    if (x < -40 || x > W + 40 || p.got) return;
    ctx.fillStyle = '#f2f4f8';
    ctx.beginPath(); ctx.ellipse(x, p.y, 9, 7, 0, 0, 7); ctx.fill();
    ctx.fillStyle = '#e6ecf5'; ctx.fillRect(x - 4, p.y - 9, 8, 3);
  }
  function drawRice() {
    if (!rice.length) return;
    const gx = rice[0].x - cam + 120;
    if (gx < -200) return;
    ctx.fillStyle = '#f2f4f8';
    for (let i = 0; i < 7; i++) {
      const bx = gx - 90 + (i % 4) * 34, by = GY - 10 - Math.floor(i / 4) * 26;
      ctx.beginPath(); ctx.ellipse(bx, by, 26, 18, 0, 0, 7); ctx.fill();
    }
    ctx.fillStyle = '#e6ecf5';
    ctx.beginPath(); ctx.ellipse(gx - 40, GY - 52, 30, 22, 0, 0, 7); ctx.fill();
  }
  function drawBullet(b) {
    ctx.fillStyle = '#e6c86a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill();
    ctx.fillStyle = '#fff6d0'; ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, b.r * .4, 0, 7); ctx.fill();
  }

  function hud() {
    const progress = cfg.boss ? Math.min(1, tSec / cfg.dur) : Math.min(1, dist / target);
    ctx.fillStyle = '#2a3547'; ctx.fillRect(30, 26, W - 60, 8);
    ctx.fillStyle = cfg.boss ? '#e06a7a' : '#7fb0e8'; ctx.fillRect(30, 26, (W - 60) * progress, 8);
    ctx.fillStyle = DARK.fg; ctx.font = '600 14px sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('第 ' + level + ' 关  ' + (cfg.name || ''), 30, 18);
    ctx.textAlign = 'right';
    if (cfg.boss) { ctx.fillStyle = '#e6c86a'; ctx.fillText('力竭倒计时 ' + Math.max(0, Math.ceil(cfg.dur - tSec)) + 's', W - 30, 18); }
    else { ctx.fillStyle = '#8b97a8'; ctx.fillText(String(Math.floor(score)).padStart(5, '0') + ' 分', W - 30, 18); }

    ctx.textAlign = 'right'; ctx.font = '600 13px sans-serif';
    ctx.fillStyle = SAVE.mute ? '#5a6577' : '#7fb0e8';
    ctx.fillText(SAVE.mute ? '♪ 静音' : '♪ 音乐', W - 30, 42);
    let bx = 30; ctx.textAlign = 'left'; ctx.font = '600 13px sans-serif';
    for (const k of ['spd', 'inv', 'mag', 'slow', 'trj']) {
      if (buffs[k] > 0) {
        ctx.fillStyle = '#7fb0e8'; ctx.fillRect(bx, 42, 78, 17);
        ctx.fillStyle = '#0e1118'; ctx.fillText((BUFF_NAME[k] || k) + ' ' + buffs[k].toFixed(1), bx + 5, 55);
        bx += 84;
      }
    }
    if (toast && toastT > 0) {
      ctx.textAlign = 'center'; ctx.font = '700 18px sans-serif'; ctx.fillStyle = '#f2f4f8';
      ctx.fillText(toast, W / 2, 96);
    }
    if (paused) {
      ctx.fillStyle = 'rgba(10,14,20,.72)'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = DARK.fg; ctx.textAlign = 'center'; ctx.font = '700 26px sans-serif';
      ctx.fillText('暂停', W / 2, 150);
      ctx.font = '600 15px sans-serif'; ctx.fillStyle = DARK.dim; ctx.fillText('ESC 继续', W / 2, 182);
    }
  }

  /* ---------- 界面 ---------- */
  function btn(x, y, w, h, label) {
    ctx.fillStyle = '#1c2634'; ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = '#2f3c4f'; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = '#c8d2e0'; ctx.font = '600 17px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(label, x + w / 2, y + h / 2 + 6);
    return { x, y, w, h };
  }
  const ownedOf = id => SAVE.owned.includes(id);

  function screenMenu() {
    bg(); ctx.textAlign = 'center';
    ctx.fillStyle = '#eef4ff'; ctx.font = '700 40px "Microsoft YaHei",sans-serif';
    ctx.fillText('大肥鱼快跑', W / 2, 104);
    ctx.fillStyle = '#8b97a8'; ctx.font = '600 14px sans-serif';
    ctx.fillText(chapter.name || '', W / 2, 130);
    ctx.fillStyle = '#e6c86a'; ctx.font = '600 16px sans-serif';
    ctx.fillText('积分 ' + (INF ? '∞' : SAVE.pts), W / 2, 150);
    const cleared = Object.keys(SAVE.clears).filter(k => SAVE.clears[k] > 0).length;
    ctx.fillStyle = '#7b8799'; ctx.font = '500 13px sans-serif';
    ctx.fillText('已通关 ' + cleared + ' / ' + LEVELS + ' 关', W / 2, 170);

    const b1 = btn(W / 2 - 140, 188, 280, 42, '开始游戏');
    const b2 = btn(W / 2 - 140, 238, 132, 36, '商城');
    const b3 = btn(W / 2 + 8, 238, 132, 36, '换装');
    buttons.push({ ...b1, act: () => { st = 'levels'; lvSel = 0; SFX.ui(); } });
    buttons.push({ ...b2, act: () => { st = 'shop'; SFX.ui(); } });
    buttons.push({ ...b3, act: () => { st = 'wardrobe'; SFX.ui(); } });

    ctx.fillStyle = '#5a6577'; ctx.font = '500 12px sans-serif';
    ctx.fillText('空格/↑ 跳 · 空中↓ 下坠 · 地面↓ 滑铲 · ESC 暂停 · M 静音', W / 2, 300);
  }

  function screenLevels() {
    bg(); ctx.textAlign = 'center'; ctx.fillStyle = '#eef4ff';
    ctx.font = '700 24px "Microsoft YaHei",sans-serif'; ctx.fillText('选择关卡', W / 2, 50);
    const per = 5, bw = 150, bh = 62, gap = 18;
    for (let i = 0; i < LEVELS; i++) {
      const col = i % per, row = Math.floor(i / per);
      const x = W / 2 - (per * (bw + gap) - gap) / 2 + col * (bw + gap);
      const y = 84 + row * (bh + 16);
      const lv = chapter.levels[i];
      const done = SAVE.clears[i + 1];
      ctx.fillStyle = '#1c2634'; ctx.fillRect(x, y, bw, bh);
      ctx.strokeStyle = lv.boss ? '#e06a7a' : (lv.elite ? '#e6c86a' : '#2f3c4f');
      ctx.lineWidth = 2; ctx.strokeRect(x, y, bw, bh);
      ctx.fillStyle = '#c8d2e0'; ctx.font = '600 15px sans-serif';
      ctx.fillText('第 ' + (i + 1) + ' 关', x + bw / 2, y + 24);
      ctx.fillStyle = lv.boss ? '#e06a7a' : (lv.elite ? '#e6c86a' : '#6f7c90');
      ctx.font = '500 12px sans-serif';
      ctx.fillText(lv.boss ? 'BOSS' : (lv.elite ? '精英' : (lv.name || '普通')), x + bw / 2, y + 42);
      if (done) { ctx.fillStyle = '#7fb0e8'; ctx.fillText('已通关', x + bw / 2, y + 56); }
      buttons.push({ x, y, w: bw, h: bh, act: (n => () => { lvSel = n; startLevel(n + 1); SFX.ui(); })(i) });
    }
    const bb = btn(W / 2 - 70, 270, 140, 34, '返回');
    buttons.push({ ...bb, act: () => { st = 'menu'; SFX.ui(); } });
  }

  function screenShop() {
    bg(); ctx.textAlign = 'left'; ctx.fillStyle = '#eef4ff';
    ctx.font = '700 22px "Microsoft YaHei",sans-serif'; ctx.fillText('商城', 40, 46);
    ctx.textAlign = 'right'; ctx.fillStyle = '#e6c86a'; ctx.font = '600 16px sans-serif';
    ctx.fillText('积分 ' + (INF ? '∞' : SAVE.pts), W - 40, 44);

    const cw = 280, ch = 54, cols = 3, cx = W / 2 - (cols * (cw + 16) - 16) / 2;
    ITEMS.forEach((it, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const x = cx + col * (cw + 16), y = 74 + row * (ch + 12);
      const owned = ownedOf(it.id), used = SAVE.eq[it.slot] === it.id;
      ctx.fillStyle = '#18222f'; ctx.fillRect(x, y, cw, ch);
      ctx.strokeStyle = used ? '#7fb0e8' : (owned ? '#3d6b4f' : '#2f3c4f');
      ctx.lineWidth = 2; ctx.strokeRect(x, y, cw, ch);
      ctx.textAlign = 'left'; ctx.fillStyle = '#dbe4f0'; ctx.font = '600 15px "Microsoft YaHei",sans-serif';
      ctx.fillText(it.name, x + 14, y + 23);
      ctx.fillStyle = '#7b8799'; ctx.font = '500 12px sans-serif';
      ctx.fillText(it.desc, x + 14, y + 41);
      ctx.textAlign = 'right';
      if (owned) { ctx.fillStyle = used ? '#7fb0e8' : '#8fa0b6'; ctx.font = '600 13px sans-serif'; ctx.fillText(used ? '佩戴中' : '已拥有', x + cw - 14, y + 23); }
      else { ctx.fillStyle = SAVE.pts >= it.price ? '#e6c86a' : '#5a6577'; ctx.font = '600 14px sans-serif'; ctx.fillText(it.price + ' 分', x + cw - 14, y + 23); }
      buttons.push({ x, y, w: cw, h: ch, act: () => buy(it) });
    });
    const bb = btn(W / 2 - 70, 272, 140, 34, '返回');
    buttons.push({ ...bb, act: () => { st = 'menu'; SFX.ui(); } });
    showToast();
  }

  function buy(it) {
    if (ownedOf(it.id)) {
      SAVE.eq[it.slot] = SAVE.eq[it.slot] === it.id ? null : it.id;
      save(); SFX.ui(); return;
    }
    if (INF || SAVE.pts >= it.price) {
      if (!INF) SAVE.pts -= it.price; SAVE.owned.push(it.id); SAVE.eq[it.slot] = it.id;
      save(); SFX.buy(); toast = it.name + ' 到手！'; toastT = 1.4;
    } else { SFX.hit(); toast = '积分不够'; toastT = 1.2; }
  }

  function screenWardrobe() {
    bg(); ctx.textAlign = 'center'; ctx.fillStyle = '#eef4ff';
    ctx.font = '700 22px "Microsoft YaHei",sans-serif'; ctx.fillText('我的鲸鱼', W / 2, 44);
    const sc = 4, w4 = 16 * sc, h4 = 18 * sc, x = W / 2 - w4 / 2, y = 104;
    ctx.fillStyle = 'rgba(0,0,0,.25)';
    ctx.beginPath(); ctx.ellipse(W / 2, y + h4 + 6, w4 * .5, 7, 0, 0, 7); ctx.fill();
    if (PIMG) ctx.drawImage(PIMG, x, y, w4, h4);
    else drawMap(SPR.run0, x, y, sc);
    drawCostume(x, y, w4, h4);
    ctx.fillStyle = '#8b97a8'; ctx.font = '500 13px sans-serif';
    ctx.fillText('商城买到就能戴 · 点商品切换佩戴', W / 2, 296);
    const bb = btn(W / 2 - 70, 258, 140, 32, '返回');
    buttons.push({ ...bb, act: () => { st = 'menu'; SFX.ui(); } });
  }

  function screenDead() {
    bg(); ctx.textAlign = 'center';
    ctx.fillStyle = '#e06a7a'; ctx.font = '700 34px "Microsoft YaHei",sans-serif';
    ctx.fillText('被撞了', W / 2, 104);
    ctx.fillStyle = '#8b97a8'; ctx.font = '500 14px sans-serif';
    ctx.fillText('第 ' + level + ' 关  ' + (cfg.name || ''), W / 2, 132);
    const pg = Math.min(99, Math.floor(dist / target * 100));
    ctx.fillStyle = '#e6c86a'; ctx.font = '600 16px sans-serif';
    ctx.fillText('本局 ' + pg + '%    最佳 ' + (SAVE.best[level] || 0) + '%', W / 2, 156);
    if (deathGain > 0) { ctx.fillStyle = '#7fb0e8'; ctx.font = '700 18px sans-serif'; ctx.fillText('刷新进度  +' + deathGain + ' 分', W / 2, 184); }
    const a = btn(W / 2 - 160, 172, 150, 40, '重来');
    const b = btn(W / 2 + 10, 172, 150, 40, '回主界面');
    buttons.push({ ...a, act: () => startLevel(level) });
    buttons.push({ ...b, act: () => { st = 'menu'; SFX.ui(); } });
  }

  function screenClear() {
    if (!settled) settled = settle();
    bg(); ctx.textAlign = 'center';
    ctx.fillStyle = '#e6c86a'; ctx.font = '700 32px "Microsoft YaHei",sans-serif';
    ctx.fillText(cfg.boss ? '力竭通关！' : '通关！', W / 2, 80);
    ctx.fillStyle = '#dbe4f0'; ctx.font = '500 15px sans-serif';
    ctx.fillText('基础 ' + settled.base + '   时间奖励 ' + settled.timeBonus + '   无伤 ' + settled.noHit, W / 2, 118);
    ctx.fillStyle = '#7fb0e8'; ctx.font = '700 22px sans-serif';
    ctx.fillText('获得积分 ' + settled.gain + (settled.mult < 1 ? '（重复挑战 ×' + settled.mult + '）' : ''), W / 2, 154);
    ctx.fillStyle = '#8b97a8'; ctx.font = '500 13px sans-serif';
    ctx.fillText('总积分 ' + (INF ? '∞' : SAVE.pts), W / 2, 180);
    if (level < LEVELS) {
      const a = btn(W / 2 - 170, 204, 160, 40, '下一关');
      buttons.push({ ...a, act: () => { const n = level + 1; settled = null; startLevel(n); } });
    }
    const b = btn(W / 2 + 10, 204, 160, 40, '回主界面');
    buttons.push({ ...b, act: () => { settled = null; st = 'menu'; SFX.ui(); } });
  }

  function showToast() {
    if (toast && toastT > 0) {
      ctx.fillStyle = 'rgba(10,14,20,.8)'; ctx.fillRect(W / 2 - 110, 284, 220, 24);
      ctx.fillStyle = '#e6c86a'; ctx.font = '600 14px "Microsoft YaHei",sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(toast, W / 2, 301);
    }
  }

  /* ---------- 主循环 ---------- */
  let lastT = 0;
  function frame(ts) {
    const dt = Math.min(2.6, (ts - lastT) / 16.667) || 1;
    lastT = ts;
    buttons.length = 0;
    update(dt);

    if (st === 'eating') {
      winT += dt / 60;
      bg(); drawRice(); drawPlayer(); hud();
      if (winT > (chapter.goal && chapter.goal.countdownSec || 1)) {
        const s = settle();
        if (!INF) SAVE.pts += s.gain; SAVE.clears[level] = (SAVE.clears[level] || 0) + 1; save();
        settled = s; st = 'clear'; bgmStop();
      }
    } else if (st === 'play' || st === 'dead') {
      ctx.save();
      if (shake > 0) ctx.translate((Math.random() - .5) * shake, (Math.random() - .5) * shake);
      bg(); drawRice();
      for (const p of pickups) drawPickup(p);
      for (const e of enemies) drawEnemy(e);
      for (const b of bullets) drawBullet(b);
      if (st === 'dead') deadT += dt / 60;
      drawPlayer();
      for (const q of pops) {
        ctx.globalAlpha = Math.max(0, q.t);
        ctx.fillStyle = '#e6c86a'; ctx.font = '700 16px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('+50', q.x, q.y); ctx.globalAlpha = 1;
      }
      hud();
      ctx.restore();
      if (st === 'dead') {
        ctx.fillStyle = 'rgba(10,14,20,' + Math.min(.6, deadT * 1.2) + ')'; ctx.fillRect(0, 0, W, H);
        if (deadT > .6) screenDead();
      }
    } else if (st === 'menu') screenMenu();
    else if (st === 'levels') screenLevels();
    else if (st === 'shop') screenShop();
    else if (st === 'wardrobe') screenWardrobe();
    else if (st === 'clear') screenClear();

    requestAnimationFrame(frame);
  }
  if (opts && opts.eq) { const [s, id] = opts.eq.split(':'); if (SAVE.eq[s] !== undefined) SAVE.eq[s] = id; }
  if (opts && opts.grant) { SAVE.pts += opts.grant; save(); }
  if (opts && opts.level) startLevel(Math.max(1, Math.min(LEVELS, opts.level)));
  requestAnimationFrame(frame);
}
