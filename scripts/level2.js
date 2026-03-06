'use strict';

const Level2 = (() => {

  // ── Constants ───────────────────────────────────────────────────────────────

  // Statues
  const SPRITE_COLS     = 4;
  const SPRITE_ROWS     = 2;
  const STATUE_FRAME    = 0;
  const STATUE_MAX_HP   = 1000;
  const STATUE_H_FACTOR = 0.33;

  // Miners
  const MINER_COLS        = 4;
  const MINER_ROWS        = 2;
  const MINER_H_FACTOR    = 0.11;
  const MINER_SPEED       = 80;           // px/s
  const MINER_FRAME_MS    = 110;
  const MINE_DURATION     = 3000;         // ms spent at mine site
  const MINE_REWARD       = 25;           // gold per completed trip
  const MINE_X_FACTOR     = 0.46;         // fraction of W where miners dig
  const MINER_WALK_FRAMES = [0,1,2,3,4,5,6,7];
  const MINER_MINE_FRAMES = [2,3];
  const STARTING_GOLD     = 50;
  const MINER_COST        = 10;

  // Fighters
  const FIGHTER_H_FACTOR       = 0.13;
  const FIGHTER_SPEED          = 60;      // px/s marching
  const FIGHTER_MAX_HP         = 100;
  const FIGHTER_AMMO           = 3;
  const FIGHTER_SHOOT_RANGE    = 220;     // px gap to target to start shooting
  const FIGHTER_MELEE_RANGE    = 55;      // px gap to switch to melee
  const FIGHTER_SHOOT_CD       = 1500;    // ms between shots
  const FIGHTER_MELEE_CD       = 900;     // ms between swings
  const FIGHTER_SHOOT_DMG      = 30;
  const FIGHTER_MELEE_DMG      = 15;
  const FIGHTER_PROJ_SPEED     = 380;     // px/s
  const FIGHTER_FRAME_MS       = 90;
  const FIGHTER_MELEE_FRAME_MS = 65;      // faster tick for swing
  const FIGHTER_RUN_FRAMES     = [0,1,2,3,4,5,6,7];
  const FIGHTER_SHOOT_FRAME    = 2;       // row 0, col 2 – shooting pose
  const FIGHTER_MELEE_FRAMES   = [4,5,6,7]; // row 1 frames – improvised swing
  const FIGHTER_COST           = 25;

  // ── State ───────────────────────────────────────────────────────────────────

  let canvas, ctx, running, rafId, lastTime;
  let onWin, onLose;

  const spriteImg = new Image();   // statues + fighters share military sheet
  const minerImg  = new Image();

  let groundY;
  let frameW,      frameH,      statueW,  statueH;
  let minerFrameW, minerFrameH, minerW,   minerH;
  let fighterW,    fighterH;

  let playerStatue, enemyStatue;
  let miners, gold;
  let fighters, fighterProjectiles;

  // ── Asset Loading ────────────────────────────────────────────────────────────

  function loadAssets(cb) {
    let n = 0;
    const done = () => { if (++n === 2) cb(); };
    [
      [spriteImg, 'game-assets/SeanSpriteMilitary.png'],
      [minerImg,  'game-assets/SeanSpriteCivilian.png'],
    ].forEach(([img, src]) => {
      if (img.complete && img.naturalWidth > 0) { done(); }
      else { img.onload = img.onerror = done; img.src = src; }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    const parent  = canvas.parentElement;
    canvas.width  = parent.clientWidth  || window.innerWidth;
    canvas.height = parent.clientHeight || window.innerHeight;

    const W = canvas.width;
    const H = canvas.height;

    groundY = H * 0.74;

    frameW  = (spriteImg.naturalWidth  || 256) / SPRITE_COLS;
    frameH  = (spriteImg.naturalHeight || 128) / SPRITE_ROWS;
    statueH = H * STATUE_H_FACTOR;
    statueW = (frameW / frameH) * statueH;

    minerFrameW = (minerImg.naturalWidth  || 256) / MINER_COLS;
    minerFrameH = (minerImg.naturalHeight || 128) / MINER_ROWS;
    minerH      = H * MINER_H_FACTOR;
    minerW      = (minerFrameW / minerFrameH) * minerH;

    fighterH = H * FIGHTER_H_FACTOR;
    fighterW = (frameW / frameH) * fighterH;

    playerStatue = { x: W * 0.08,           hp: STATUE_MAX_HP, maxHp: STATUE_MAX_HP };
    enemyStatue  = { x: W * 0.92 - statueW, hp: STATUE_MAX_HP, maxHp: STATUE_MAX_HP };

    gold               = STARTING_GOLD;
    miners             = [];
    fighters           = [];
    fighterProjectiles = [];
  }

  // ── Game Loop ────────────────────────────────────────────────────────────────

  function loop(ts) {
    if (!running) return;
    const dt = Math.min(ts - lastTime, 50);
    lastTime = ts;
    update(dt);
    draw();
    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    if (enemyStatue.hp  <= 0) { triggerWin();  return; }
    if (playerStatue.hp <= 0) { triggerLose(); return; }
    updateMiners(dt);
    updateFighters(dt);
    updateFighterProjectiles(dt);
  }

  // ── Miners ───────────────────────────────────────────────────────────────────

  function deployMiner() {
    if (gold < MINER_COST) return;
    gold -= MINER_COST;
    const startX = playerStatue.x + statueW + 6;
    miners.push({
      x: startX, startX,
      mineX:     canvas.width * MINE_X_FACTOR,
      state:     'walking_out',
      mineTimer: 0,
      frameIdx:  0,
      frameTick: 0,
    });
  }

  function updateMiners(dt) {
    for (const m of miners) {
      m.frameTick += dt;
      if (m.frameTick >= MINER_FRAME_MS) {
        m.frameTick -= MINER_FRAME_MS;
        const frames = m.state === 'mining' ? MINER_MINE_FRAMES : MINER_WALK_FRAMES;
        m.frameIdx = (m.frameIdx + 1) % frames.length;
      }
      if (m.state === 'walking_out') {
        m.x += MINER_SPEED * dt / 1000;
        if (m.x >= m.mineX) { m.x = m.mineX; m.state = 'mining'; m.mineTimer = 0; m.frameIdx = 0; }
      } else if (m.state === 'mining') {
        m.mineTimer += dt;
        if (m.mineTimer >= MINE_DURATION) { m.state = 'walking_back'; m.frameIdx = 0; }
      } else if (m.state === 'walking_back') {
        m.x -= MINER_SPEED * dt / 1000;
        if (m.x <= m.startX) { m.x = m.startX; gold += MINE_REWARD; m.state = 'walking_out'; m.frameIdx = 0; }
      }
    }
  }

  // ── Fighters ─────────────────────────────────────────────────────────────────

  function deployFighter() {
    if (gold < FIGHTER_COST) return;
    gold -= FIGHTER_COST;
    fighters.push({
      x:           playerStatue.x + statueW + 6,
      hp:          FIGHTER_MAX_HP,
      maxHp:       FIGHTER_MAX_HP,
      ammo:        FIGHTER_AMMO,
      state:       'marching',
      frameIdx:    0,
      frameTick:   0,
      shootTimer:  FIGHTER_SHOOT_CD,  // start ready to fire on first tick in range
      meleeTimer:  FIGHTER_MELEE_CD,
      shootHoldMs: 0,
    });
  }

  function updateFighters(dt) {
    for (let i = fighters.length - 1; i >= 0; i--) {
      const f = fighters[i];

      if (f.hp <= 0) { fighters.splice(i, 1); continue; }

      // gap from fighter's right edge to enemy statue's left edge
      const dist = enemyStatue.x - (f.x + fighterW);

      // tick cooldown timers up to their cap
      f.shootTimer  = Math.min(f.shootTimer  + dt, FIGHTER_SHOOT_CD);
      f.meleeTimer  = Math.min(f.meleeTimer  + dt, FIGHTER_MELEE_CD);
      f.shootHoldMs = Math.max(f.shootHoldMs - dt, 0);

      if (dist <= FIGHTER_MELEE_RANGE) {
        // ── melee ──────────────────────────────────────────────
        f.state = 'melee';
        if (f.meleeTimer >= FIGHTER_MELEE_CD) {
          f.meleeTimer = 0;
          f.frameIdx   = 0;
          enemyStatue.hp = Math.max(0, enemyStatue.hp - FIGHTER_MELEE_DMG);
        }

      } else if (dist <= FIGHTER_SHOOT_RANGE && f.ammo > 0) {
        // ── shoot ──────────────────────────────────────────────
        f.state = 'shooting';
        if (f.shootTimer >= FIGHTER_SHOOT_CD) {
          f.shootTimer  = 0;
          f.shootHoldMs = 220;
          f.ammo--;
          fighterProjectiles.push({
            x: f.x + fighterW * 0.85,
            y: groundY - fighterH * 0.62,
            w: 16,
            h: 5,
          });
        }

      } else {
        // ── march ──────────────────────────────────────────────
        f.state  = 'marching';
        f.x     += FIGHTER_SPEED * dt / 1000;
      }

      // ── animate ────────────────────────────────────────────────
      f.frameTick += dt;
      const tickMs = f.state === 'melee' ? FIGHTER_MELEE_FRAME_MS : FIGHTER_FRAME_MS;
      if (f.frameTick >= tickMs) {
        f.frameTick -= tickMs;
        if (f.state === 'marching') {
          f.frameIdx = (f.frameIdx + 1) % FIGHTER_RUN_FRAMES.length;
        } else if (f.state === 'melee') {
          f.frameIdx = (f.frameIdx + 1) % FIGHTER_MELEE_FRAMES.length;
        }
        // 'shooting': frame held until shootHoldMs expires, then reverts
      }
    }
  }

  function updateFighterProjectiles(dt) {
    for (let i = fighterProjectiles.length - 1; i >= 0; i--) {
      const p = fighterProjectiles[i];
      p.x += FIGHTER_PROJ_SPEED * dt / 1000;
      if (p.x + p.w >= enemyStatue.x) {
        enemyStatue.hp = Math.max(0, enemyStatue.hp - FIGHTER_SHOOT_DMG);
        fighterProjectiles.splice(i, 1);
      } else if (p.x > canvas.width) {
        fighterProjectiles.splice(i, 1);
      }
    }
  }

  // ── Input ────────────────────────────────────────────────────────────────────

  function onKeyDown(e) {
    if (e.key === 'm' || e.key === 'M') deployMiner();
    if (e.key === 'f' || e.key === 'F') deployFighter();
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    drawMiners();
    drawFighters();
    drawFighterProjectiles();
    drawPedestal(playerStatue);
    drawPedestal(enemyStatue);
    drawStatue(playerStatue, false);
    drawStatue(enemyStatue,  true);
    drawHealthBar(playerStatue, true);
    drawHealthBar(enemyStatue,  false);
    drawGoldHUD();
  }

  function drawBackground() {
    const W = canvas.width;
    const H = canvas.height;

    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0,   '#080818');
    sky.addColorStop(0.5, '#111830');
    sky.addColorStop(1,   '#1e2a48');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    const gnd = ctx.createLinearGradient(0, groundY, 0, H);
    gnd.addColorStop(0, '#2a1a0a');
    gnd.addColorStop(1, '#0a0804');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, groundY, W, H - groundY);

    ctx.strokeStyle = '#4a3010';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    ctx.fillStyle = 'rgba(60,120,255,0.05)';
    ctx.fillRect(0, 0, W * 0.22, H);
    ctx.fillStyle = 'rgba(255,50,50,0.05)';
    ctx.fillRect(W * 0.78, 0, W * 0.22, H);

    ctx.save();
    ctx.setLineDash([8, 14]);
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, groundY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  function drawMiners() {
    if (!minerImg.complete || minerImg.naturalWidth === 0) return;
    for (let i = 0; i < miners.length; i++) {
      const m      = miners[i];
      const frames = m.state === 'mining' ? MINER_MINE_FRAMES : MINER_WALK_FRAMES;
      const fi     = frames[m.frameIdx % frames.length];
      const col    = fi % MINER_COLS;
      const row    = Math.floor(fi / MINER_COLS);
      const drawY  = groundY - minerH + (i % 3) * 3;
      const flip   = m.state === 'walking_back';

      ctx.save();
      if (flip) {
        ctx.scale(-1, 1);
        ctx.drawImage(minerImg,
          col * minerFrameW, row * minerFrameH, minerFrameW, minerFrameH,
          -(m.x + minerW), drawY, minerW, minerH);
      } else {
        ctx.drawImage(minerImg,
          col * minerFrameW, row * minerFrameH, minerFrameW, minerFrameH,
          m.x, drawY, minerW, minerH);
      }
      ctx.restore();
    }
  }

  function drawFighters() {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;
    for (const f of fighters) {
      const drawY = groundY - fighterH;

      // resolve sprite frame
      let fi;
      if (f.state === 'shooting' && f.shootHoldMs > 0) {
        fi = FIGHTER_SHOOT_FRAME;
      } else if (f.state === 'melee') {
        fi = FIGHTER_MELEE_FRAMES[f.frameIdx % FIGHTER_MELEE_FRAMES.length];
      } else {
        fi = FIGHTER_RUN_FRAMES[f.frameIdx % FIGHTER_RUN_FRAMES.length];
      }

      const col = fi % SPRITE_COLS;
      const row = Math.floor(fi / SPRITE_COLS);

      ctx.drawImage(spriteImg,
        col * frameW, row * frameH, frameW, frameH,
        f.x, drawY, fighterW, fighterH);

      drawFighterBars(f);
    }
  }

  function drawFighterBars(f) {
    const barW = fighterW;
    const barH = 4;
    const barX = f.x;
    const barY = groundY - fighterH - barH - 5;
    const hpR  = f.hp / f.maxHp;

    // hp bar background
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);

    // hp fill
    ctx.fillStyle = hpR > 0.5 ? '#33dd55' : hpR > 0.25 ? '#ddaa11' : '#dd2222';
    ctx.fillRect(barX, barY, barW * hpR, barH);

    // ammo dots (yellow = loaded, dark = spent)
    const dotR   = 2.5;
    const dotGap = 2;
    const dotsW  = FIGHTER_AMMO * (dotR * 2 + dotGap) - dotGap;
    let dotX     = barX + barW / 2 - dotsW / 2 + dotR;
    const dotY   = barY - dotR - 4;
    for (let i = 0; i < FIGHTER_AMMO; i++) {
      ctx.beginPath();
      ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
      ctx.fillStyle = i < f.ammo ? '#ffee44' : '#333333';
      ctx.fill();
      dotX += dotR * 2 + dotGap;
    }
  }

  function drawFighterProjectiles() {
    for (const p of fighterProjectiles) {
      // outer glow
      ctx.fillStyle = 'rgba(255,220,50,0.22)';
      ctx.fillRect(p.x - 5, p.y - 4, p.w + 10, p.h + 8);
      // body
      ctx.fillStyle = '#ffee44';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // bright tip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x + p.w - 4, p.y + 1, 4, p.h - 2);
    }
  }

  function drawPedestal(statue) {
    const pedW = statueW * 1.15;
    const pedH = statueH * 0.09;
    const pedX = statue.x + statueW / 2 - pedW / 2;
    const pedY = groundY - pedH;
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(pedX, pedY, pedW, pedH);
    ctx.fillStyle = '#5a4428';
    ctx.fillRect(pedX, pedY, pedW, 3);
  }

  function drawStatue(statue, flip) {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;
    const col   = STATUE_FRAME % SPRITE_COLS;
    const row   = Math.floor(STATUE_FRAME / SPRITE_COLS);
    const pedH  = statueH * 0.09;
    const drawY = groundY - statueH - pedH;

    ctx.save();
    if (flip) {
      ctx.scale(-1, 1);
      ctx.drawImage(spriteImg,
        col * frameW, row * frameH, frameW, frameH,
        -(statue.x + statueW), drawY, statueW, statueH);
    } else {
      ctx.drawImage(spriteImg,
        col * frameW, row * frameH, frameW, frameH,
        statue.x, drawY, statueW, statueH);
    }
    ctx.restore();
  }

  function drawHealthBar(statue, isPlayer) {
    const barW  = Math.max(statueW * 1.9, 130);
    const barH  = 13;
    const barX  = statue.x + statueW / 2 - barW / 2;
    const pedH  = statueH * 0.09;
    const barY  = groundY - statueH - pedH - barH - 20;
    const ratio = Math.max(0, statue.hp / statue.maxHp);

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);

    if (ratio > 0) {
      ctx.fillStyle = ratio > 0.6 ? '#33dd55' : ratio > 0.3 ? '#ddaa11' : '#dd2222';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }

    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.save();
    ctx.shadowColor  = '#000';
    ctx.shadowBlur   = 5;

    ctx.font         = 'bold 11px Arial';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = isPlayer ? '#88aaff' : '#ff8888';
    ctx.textAlign    = isPlayer ? 'left' : 'right';
    ctx.fillText(
      isPlayer ? 'PLAYER BASE' : 'ENEMY BASE',
      isPlayer ? barX : barX + barW,
      barY - 4
    );

    ctx.font         = 'bold 9px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillStyle    = 'rgba(255,255,255,0.75)';
    ctx.fillText(statue.hp + ' / ' + statue.maxHp, barX + barW / 2, barY + barH / 2);
    ctx.restore();
  }

  function drawGoldHUD() {
    const pad = 18;
    ctx.save();
    ctx.shadowColor  = 'rgba(0,0,0,0.95)';
    ctx.shadowBlur   = 6;
    ctx.textBaseline = 'top';
    ctx.textAlign    = 'left';

    ctx.font      = 'bold 24px "Arial Black", Arial';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('\u25c6 ' + Math.floor(gold), pad, pad);

    ctx.font      = 'bold 12px Arial';
    ctx.fillStyle = gold >= MINER_COST   ? '#aaaaaa' : '#555';
    ctx.fillText('[M] Miner  \u25c6' + MINER_COST,   pad, pad + 34);

    ctx.fillStyle = gold >= FIGHTER_COST ? '#aaaaaa' : '#555';
    ctx.fillText('[F] Fighter  \u25c6' + FIGHTER_COST, pad, pad + 52);

    ctx.restore();
  }

  // ── End Conditions ───────────────────────────────────────────────────────────

  function triggerWin() {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    if (onWin) onWin();
  }

  function triggerLose() {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    if (onLose) onLose();
  }

  // ── Public API ───────────────────────────────────────────────────────────────

  function start(winCb, loseCb) {
    stop();
    canvas = document.getElementById('game-canvas-l2');
    ctx    = canvas.getContext('2d');
    onWin  = winCb;
    onLose = loseCb;

    loadAssets(() => {
      init();
      running  = true;
      lastTime = performance.now();
      document.addEventListener('keydown', onKeyDown);
      rafId = requestAnimationFrame(loop);
    });
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
  }

  return { start, stop };

})();
