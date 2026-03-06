'use strict';

const Level2 = (() => {

  // ── Constants ───────────────────────────────────────────────────────────────

  // Statues
  const SPRITE_COLS     = 4;
  const SPRITE_ROWS     = 2;
  const STATUE_FRAME    = 0;
  const STATUE_MAX_HP   = 1000;
  const STATUE_H_FACTOR = 0.33;

  // Miners (player + enemy share these)
  const MINER_COLS        = 4;
  const MINER_ROWS        = 2;
  const MINER_H_FACTOR    = 0.11;
  const MINER_SPEED       = 80;
  const MINER_FRAME_MS    = 110;
  const MINE_DURATION     = 3000;
  const MINE_REWARD       = 25;
  const PLAYER_MINE_X     = 0.46;   // player mine site (fraction of W)
  const ENEMY_MINE_X      = 0.54;   // enemy mine site (fraction of W)
  const MINER_WALK_FRAMES = [0,1,2,3,4,5,6,7];
  const MINER_MINE_FRAMES = [2,3];
  const STARTING_GOLD     = 50;
  const MINER_COST        = 10;

  // Fighters (player + enemy share most of these)
  const FIGHTER_H_FACTOR       = 0.13;
  const FIGHTER_SPEED          = 60;
  const FIGHTER_MAX_HP         = 100;
  const FIGHTER_AMMO           = 3;
  const FIGHTER_SHOOT_RANGE    = 220;
  const FIGHTER_MELEE_RANGE    = 55;
  const FIGHTER_SHOOT_CD       = 1500;
  const FIGHTER_MELEE_CD       = 900;
  const FIGHTER_SHOOT_DMG      = 30;
  const FIGHTER_MELEE_DMG      = 15;
  const FIGHTER_PROJ_SPEED     = 380;
  const FIGHTER_FRAME_MS       = 90;
  const FIGHTER_MELEE_FRAME_MS = 65;
  const FIGHTER_RUN_FRAMES     = [0,1,2,3,4,5,6,7];
  const FIGHTER_SHOOT_FRAME    = 2;
  const FIGHTER_MELEE_FRAMES   = [4,5,6,7];
  const FIGHTER_COST           = 25;

  // Oil Derrick
  const DERRICK_COLS      = 5;
  const DERRICK_ROWS      = 3;
  const DERRICK_H_FACTOR  = 0.40;   // height as fraction of canvas height
  const DERRICK_FRAME_MS  = 130;    // ms per frame — idle pump cycle
  const DERRICK_GUSH_MS   = 75;     // ms per frame — active gushing

  // Enemy AI
  const ENEMY_STARTING_GOLD      = 50;
  const ENEMY_FIGHTER_COST       = 25;
  const ENEMY_MINER_COST         = 10;
  const ENEMY_FIGHTER_SPAWN_BASE = 12000;  // ms — shrinks as game progresses
  const ENEMY_FIGHTER_SPAWN_MIN  = 3000;
  const ENEMY_MINER_SPAWN_MS     = 16000;  // ms between enemy miner spawns
  const ENEMY_MINER_MAX          = 5;

  // ── State ───────────────────────────────────────────────────────────────────

  let canvas, ctx, running, rafId, lastTime;
  let onWin, onLose;

  const spriteImg  = new Image();  // military sheet  (statues + fighters)
  const minerImg   = new Image();  // civilian sheet  (miners)
  const derrickImg = new Image();  // oil derrick sprite sheet

  let tintCanvas, tintCtx;        // offscreen canvas for red-tinting enemy sprites

  let groundY;
  let frameW,      frameH,      statueW,  statueH;
  let minerFrameW, minerFrameH, minerW,   minerH;
  let fighterW,    fighterH;

  let playerStatue, enemyStatue;

  // Player economy + units
  let gold, miners, fighters, fighterProjectiles;

  // Enemy economy + units
  let enemyGold, enemyMiners, enemyFighters;
  let enemyFighterTimer, enemyMinerTimer, gameElapsedMs;

  let score;
  let cameraFocusX;
  let derrick;

  // ── Asset Loading ────────────────────────────────────────────────────────────

  function loadAssets(cb) {
    let n = 0;
    const done = () => { if (++n === 3) cb(); };
    [
      [spriteImg,  'game-assets/SeanSpriteMilitary.png'],
      [minerImg,   'game-assets/SeanSpriteCivilian.png'],
      [derrickImg, 'game-assets/oil_sprites.png'],
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

    enemyGold         = ENEMY_STARTING_GOLD;
    enemyMiners       = [];
    enemyFighters     = [];
    enemyFighterTimer = 0;
    enemyMinerTimer   = ENEMY_MINER_SPAWN_MS; // trigger first miner spawn immediately
    gameElapsedMs     = 0;
    score             = 0;
    cameraFocusX      = canvas.width * 0.5;
    derrick           = { frameIdx: 0, frameTick: 0, gushing: false };

    tintCanvas        = document.createElement('canvas');
    tintCtx           = tintCanvas.getContext('2d');
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
    gameElapsedMs += dt;
    updateMiners(dt);
    updateFighters(dt);
    updateFighterProjectiles(dt);
    updateEnemyAI(dt);
    updateDerrick(dt);
    updateCamera(dt);
  }

  // ── Player Miners ────────────────────────────────────────────────────────────

  function deployMiner() {
    if (gold < MINER_COST) return;
    gold -= MINER_COST;
    miners.push({
      x:         playerStatue.x + statueW + 6,
      startX:    playerStatue.x + statueW + 6,
      mineX:     canvas.width * PLAYER_MINE_X,
      state:     'walking_out',
      mineTimer: 0, frameIdx: 0, frameTick: 0,
    });
  }

  function updateMiners(dt) {
    for (const m of miners) tickPlayerMiner(m, dt);
  }

  function tickPlayerMiner(m, dt) {
    m.frameTick += dt;
    if (m.frameTick >= MINER_FRAME_MS) {
      m.frameTick -= MINER_FRAME_MS;
      const fr = m.state === 'mining' ? MINER_MINE_FRAMES : MINER_WALK_FRAMES;
      m.frameIdx = (m.frameIdx + 1) % fr.length;
    }
    if (m.state === 'walking_out') {
      m.x += MINER_SPEED * dt / 1000;
      if (m.x >= m.mineX) { m.x = m.mineX; m.state = 'mining'; m.mineTimer = 0; m.frameIdx = 0; }
    } else if (m.state === 'mining') {
      m.mineTimer += dt;
      if (m.mineTimer >= MINE_DURATION) { m.state = 'walking_back'; m.frameIdx = 0; }
    } else {
      m.x -= MINER_SPEED * dt / 1000;
      if (m.x <= m.startX) { m.x = m.startX; gold += MINE_REWARD; m.state = 'walking_out'; m.frameIdx = 0; }
    }
  }

  // ── Player Fighters ──────────────────────────────────────────────────────────

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
      shootTimer:  FIGHTER_SHOOT_CD,
      meleeTimer:  FIGHTER_MELEE_CD,
      shootHoldMs: 0,
      flashTimer:  0,
    });
  }

  function updateFighters(dt) {
    for (let i = fighters.length - 1; i >= 0; i--) {
      const f = fighters[i];
      if (f.hp <= 0) { fighters.splice(i, 1); continue; }

      f.shootTimer  = Math.min(f.shootTimer  + dt, FIGHTER_SHOOT_CD);
      f.meleeTimer  = Math.min(f.meleeTimer  + dt, FIGHTER_MELEE_CD);
      f.shootHoldMs = Math.max(f.shootHoldMs - dt, 0);

      // nearest enemy fighter to the right of this unit
      const ef          = nearestUnitAhead(f.x + fighterW, enemyFighters, true);
      const statueGap   = enemyStatue.x - (f.x + fighterW);

      if (ef && ef.gap <= FIGHTER_MELEE_RANGE) {
        f.state = 'melee';
        if (f.meleeTimer >= FIGHTER_MELEE_CD) {
          f.meleeTimer = 0; f.frameIdx = 0;
          ef.unit.hp = Math.max(0, ef.unit.hp - FIGHTER_MELEE_DMG);
          ef.unit.flashTimer = 150;
        }
      } else if (ef && ef.gap <= FIGHTER_SHOOT_RANGE && f.ammo > 0) {
        f.state = 'shooting';
        if (f.shootTimer >= FIGHTER_SHOOT_CD) {
          f.shootTimer = 0; f.shootHoldMs = 220; f.ammo--;
          fighterProjectiles.push({ x: f.x + fighterW * 0.85, y: groundY - fighterH * 0.62, w: 16, h: 5 });
        }
      } else if (statueGap <= FIGHTER_MELEE_RANGE) {
        f.state = 'melee';
        if (f.meleeTimer >= FIGHTER_MELEE_CD) {
          f.meleeTimer = 0; f.frameIdx = 0;
          enemyStatue.hp = Math.max(0, enemyStatue.hp - FIGHTER_MELEE_DMG);
        }
      } else if (statueGap <= FIGHTER_SHOOT_RANGE && f.ammo > 0) {
        f.state = 'shooting';
        if (f.shootTimer >= FIGHTER_SHOOT_CD) {
          f.shootTimer = 0; f.shootHoldMs = 220; f.ammo--;
          fighterProjectiles.push({ x: f.x + fighterW * 0.85, y: groundY - fighterH * 0.62, w: 16, h: 5 });
        }
      } else {
        f.state = 'marching';
        f.x    += FIGHTER_SPEED * dt / 1000;
      }

      tickFighterAnim(f, dt);
    }
  }

  function updateFighterProjectiles(dt) {
    for (let i = fighterProjectiles.length - 1; i >= 0; i--) {
      const p = fighterProjectiles[i];
      p.x += FIGHTER_PROJ_SPEED * dt / 1000;

      let hit = false;

      // check enemy fighters first (blocks projectiles)
      for (const ef of enemyFighters) {
        if (p.x + p.w >= ef.x && p.x <= ef.x + fighterW) {
          ef.hp         = Math.max(0, ef.hp - FIGHTER_SHOOT_DMG);
          ef.flashTimer = 150;
          hit           = true;
          break;
        }
      }

      if (!hit && p.x + p.w >= enemyStatue.x) {
        enemyStatue.hp = Math.max(0, enemyStatue.hp - FIGHTER_SHOOT_DMG);
        hit = true;
      }

      if (hit || p.x > canvas.width) fighterProjectiles.splice(i, 1);
    }
  }

  // ── Enemy AI ─────────────────────────────────────────────────────────────────

  function updateEnemyAI(dt) {
    // Spawn interval decreases with time (pressure increases)
    const spawnMs = Math.max(
      ENEMY_FIGHTER_SPAWN_MIN,
      ENEMY_FIGHTER_SPAWN_BASE - gameElapsedMs * 0.3
    );

    // Miners
    enemyMinerTimer += dt;
    if (enemyMinerTimer >= ENEMY_MINER_SPAWN_MS
        && enemyGold >= ENEMY_MINER_COST
        && enemyMiners.length < ENEMY_MINER_MAX) {
      enemyMinerTimer = 0;
      enemyGold -= ENEMY_MINER_COST;
      spawnEnemyMiner();
    }

    // Fighters
    enemyFighterTimer += dt;
    if (enemyFighterTimer >= spawnMs && enemyGold >= ENEMY_FIGHTER_COST) {
      enemyFighterTimer = 0;
      enemyGold        -= ENEMY_FIGHTER_COST;
      spawnEnemyFighter();
    }

    updateEnemyMiners(dt);
    updateEnemyFighters(dt);
  }

  function spawnEnemyMiner() {
    enemyMiners.push({
      x:         enemyStatue.x - minerW - 6,
      startX:    enemyStatue.x - minerW - 6,
      mineX:     canvas.width * ENEMY_MINE_X,
      state:     'walking_out',
      mineTimer: 0, frameIdx: 0, frameTick: 0,
    });
  }

  function spawnEnemyFighter() {
    enemyFighters.push({
      x:          enemyStatue.x - fighterW - 6,
      hp:         FIGHTER_MAX_HP,
      maxHp:      FIGHTER_MAX_HP,
      state:      'marching',
      frameIdx:   0,
      frameTick:  0,
      meleeTimer: FIGHTER_MELEE_CD,
      flashTimer: 0,
    });
  }

  function updateEnemyMiners(dt) {
    for (const m of enemyMiners) tickEnemyMiner(m, dt);
  }

  function tickEnemyMiner(m, dt) {
    m.frameTick += dt;
    if (m.frameTick >= MINER_FRAME_MS) {
      m.frameTick -= MINER_FRAME_MS;
      const fr = m.state === 'mining' ? MINER_MINE_FRAMES : MINER_WALK_FRAMES;
      m.frameIdx = (m.frameIdx + 1) % fr.length;
    }
    if (m.state === 'walking_out') {
      m.x -= MINER_SPEED * dt / 1000;              // walk LEFT toward mine
      if (m.x <= m.mineX) { m.x = m.mineX; m.state = 'mining'; m.mineTimer = 0; m.frameIdx = 0; }
    } else if (m.state === 'mining') {
      m.mineTimer += dt;
      if (m.mineTimer >= MINE_DURATION) { m.state = 'walking_back'; m.frameIdx = 0; }
    } else {
      m.x += MINER_SPEED * dt / 1000;              // walk RIGHT back to base
      if (m.x >= m.startX) { m.x = m.startX; enemyGold += MINE_REWARD; m.state = 'walking_out'; m.frameIdx = 0; }
    }
  }

  function updateEnemyFighters(dt) {
    for (let i = enemyFighters.length - 1; i >= 0; i--) {
      const f = enemyFighters[i];
      if (f.hp <= 0) { score += 10; enemyFighters.splice(i, 1); continue; }

      f.meleeTimer = Math.min(f.meleeTimer + dt, FIGHTER_MELEE_CD);

      // nearest player fighter to the LEFT of this unit
      const pf        = nearestUnitAhead(f.x, fighters, false);
      const statueGap = f.x - (playerStatue.x + statueW);

      if (pf && pf.gap <= FIGHTER_MELEE_RANGE) {
        f.state = 'melee';
        if (f.meleeTimer >= FIGHTER_MELEE_CD) {
          f.meleeTimer = 0; f.frameIdx = 0;
          pf.unit.hp = Math.max(0, pf.unit.hp - FIGHTER_MELEE_DMG);
          pf.unit.flashTimer = 150;
        }
      } else if (statueGap <= FIGHTER_MELEE_RANGE) {
        f.state = 'melee';
        if (f.meleeTimer >= FIGHTER_MELEE_CD) {
          f.meleeTimer = 0; f.frameIdx = 0;
          playerStatue.hp = Math.max(0, playerStatue.hp - FIGHTER_MELEE_DMG);
        }
      } else {
        f.state = 'marching';
        f.x    -= FIGHTER_SPEED * dt / 1000;        // march LEFT
      }

      tickFighterAnim(f, dt);
    }
  }

  // ── Camera ───────────────────────────────────────────────────────────────────

  function updateCamera(dt) {
    const W = canvas.width;
    let targetFocus = W * 0.5;

    // Track the midpoint between the furthest-right player fighter and furthest-left enemy fighter.
    // Fall back to tracking just whichever side has units.
    if (fighters.length > 0 && enemyFighters.length > 0) {
      const rightPlayer = Math.max(...fighters.map(f => f.x + fighterW));
      const leftEnemy   = Math.min(...enemyFighters.map(f => f.x));
      targetFocus = (rightPlayer + leftEnemy) / 2;
    } else if (fighters.length > 0) {
      targetFocus = Math.max(...fighters.map(f => f.x + fighterW));
    } else if (enemyFighters.length > 0) {
      targetFocus = Math.min(...enemyFighters.map(f => f.x));
    }

    // Clamp so neither statue goes more than ~15% off-screen
    targetFocus = Math.max(W * 0.27, Math.min(W * 0.73, targetFocus));

    // Smooth follow
    cameraFocusX += (targetFocus - cameraFocusX) * Math.min(1, dt * 0.003);
  }

  // ── Shared helpers ───────────────────────────────────────────────────────────

  // Returns { unit, gap } for the nearest unit "ahead" of edgeX.
  // facingRight=true : looks for units whose left edge is >= edgeX  (target is to the right)
  // facingRight=false: looks for units whose right edge is <= edgeX (target is to the left)
  function nearestUnitAhead(edgeX, units, facingRight) {
    let nearest = null, minGap = Infinity;
    for (const u of units) {
      const gap = facingRight
        ? u.x - edgeX                  // gap to enemy's left edge
        : edgeX - (u.x + fighterW);    // gap to player's right edge
      if (gap > -fighterW && gap < minGap) { minGap = gap; nearest = u; }
    }
    return nearest ? { unit: nearest, gap: minGap } : null;
  }

  function tickFighterAnim(f, dt) {
    if (f.flashTimer > 0) f.flashTimer = Math.max(0, f.flashTimer - dt);
    f.frameTick += dt;
    const ms = f.state === 'melee' ? FIGHTER_MELEE_FRAME_MS : FIGHTER_FRAME_MS;
    if (f.frameTick >= ms) {
      f.frameTick -= ms;
      if (f.state === 'marching') {
        f.frameIdx = (f.frameIdx + 1) % FIGHTER_RUN_FRAMES.length;
      } else if (f.state === 'melee') {
        f.frameIdx = (f.frameIdx + 1) % FIGHTER_MELEE_FRAMES.length;
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
    const W = canvas.width;
    ctx.clearRect(0, 0, W, canvas.height);

    drawBackground();   // sky + ground fill — screen space, no transform

    ctx.save();
    ctx.translate(W / 2 - cameraFocusX, 0);

    drawWorldTerrain(); // base zones + centre line — world space
    drawDerrick();      // behind all units
    drawEnemyMiners();
    drawMiners();
    drawEnemyFighters();
    drawFighters();
    drawFighterProjectiles();
    drawPedestal(playerStatue);
    drawPedestal(enemyStatue);
    drawStatue(playerStatue, false);
    drawStatue(enemyStatue,  true);
    drawHealthBar(playerStatue, true);
    drawHealthBar(enemyStatue,  false);

    ctx.restore();

    drawGoldHUD();      // screen space
    drawUnitCards();    // screen space
  }

  // ── Oil Derrick ───────────────────────────────────────────────────────────────

  function updateDerrick(dt) {
    // Gush when any miner is actively mining at the site
    derrick.gushing = miners.some(m => m.state === 'mining') ||
                      enemyMiners.some(m => m.state === 'mining');

    derrick.frameTick += dt;
    const ms = derrick.gushing ? DERRICK_GUSH_MS : DERRICK_FRAME_MS;
    if (derrick.frameTick >= ms) {
      derrick.frameTick -= ms;
      if (derrick.gushing) {
        derrick.frameIdx = (derrick.frameIdx + 1) % 4;   // 4 gush frames
      } else {
        derrick.frameIdx = (derrick.frameIdx + 1) % 10;  // 10 idle pump frames
      }
    }
  }

  function drawDerrick() {
    if (!derrickImg.complete || derrickImg.naturalWidth === 0) return;
    const W = canvas.width, H = canvas.height;

    const fW = derrickImg.naturalWidth  / DERRICK_COLS;
    const fH = derrickImg.naturalHeight / DERRICK_ROWS;

    let col, row;
    if (derrick.gushing) {
      // Row 0, cols 1-4 — oil gushing animation (col 0 of row 0 is blank)
      col = 1 + derrick.frameIdx;
      row = 0;
    } else {
      // Rows 1-2, cols 0-4 — 10-frame idle pump cycle
      col = derrick.frameIdx % DERRICK_COLS;
      row = 1 + Math.floor(derrick.frameIdx / DERRICK_COLS);
    }

    const dH = H * DERRICK_H_FACTOR;
    const dW = (fW / fH) * dH;
    const dX = W * 0.5 - dW / 2;
    const dY = groundY - dH;

    ctx.drawImage(derrickImg, col * fW, row * fH, fW, fH, dX, dY, dW, dH);
  }

  function drawBackground() {
    const W = canvas.width, H = canvas.height;
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0, '#080818'); sky.addColorStop(0.5, '#111830'); sky.addColorStop(1, '#1e2a48');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, groundY);

    const gnd = ctx.createLinearGradient(0, groundY, 0, H);
    gnd.addColorStop(0, '#2a1a0a'); gnd.addColorStop(1, '#0a0804');
    ctx.fillStyle = gnd; ctx.fillRect(0, groundY, W, H - groundY);

    ctx.strokeStyle = '#4a3010'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, groundY); ctx.lineTo(W, groundY); ctx.stroke();
  }

  // World-space terrain details — called inside the camera transform.
  function drawWorldTerrain() {
    const W = canvas.width, H = canvas.height;
    ctx.fillStyle = 'rgba(60,120,255,0.05)'; ctx.fillRect(0, 0, W * 0.22, H);
    ctx.fillStyle = 'rgba(255,50,50,0.05)';  ctx.fillRect(W * 0.78, 0, W * 0.22, H);
    ctx.save();
    ctx.setLineDash([8, 14]); ctx.strokeStyle = 'rgba(255,255,255,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, groundY); ctx.stroke();
    ctx.setLineDash([]); ctx.restore();
  }

  function drawMiners() {
    if (!minerImg.complete || minerImg.naturalWidth === 0) return;
    for (let i = 0; i < miners.length; i++) {
      const m  = miners[i];
      const fi = (m.state === 'mining' ? MINER_MINE_FRAMES : MINER_WALK_FRAMES)[m.frameIdx % (m.state === 'mining' ? MINER_MINE_FRAMES.length : MINER_WALK_FRAMES.length)];
      const col = fi % MINER_COLS, row = Math.floor(fi / MINER_COLS);
      const drawY = groundY - minerH + (i % 3) * 3;
      const flip  = m.state === 'walking_back';
      ctx.save();
      if (flip) {
        ctx.scale(-1, 1);
        ctx.drawImage(minerImg, col * minerFrameW, row * minerFrameH, minerFrameW, minerFrameH, -(m.x + minerW), drawY, minerW, minerH);
      } else {
        ctx.drawImage(minerImg, col * minerFrameW, row * minerFrameH, minerFrameW, minerFrameH, m.x, drawY, minerW, minerH);
      }
      ctx.restore();
    }
  }

  function drawEnemyMiners() {
    if (!minerImg.complete || minerImg.naturalWidth === 0) return;
    for (let i = 0; i < enemyMiners.length; i++) {
      const m    = enemyMiners[i];
      const frArr = m.state === 'mining' ? MINER_MINE_FRAMES : MINER_WALK_FRAMES;
      const fi   = frArr[m.frameIdx % frArr.length];
      const col  = fi % MINER_COLS, row = Math.floor(fi / MINER_COLS);
      const drawY = groundY - minerH + (i % 3) * 3;
      // walking_out → going left → face left (flip); walking_back → face right (no flip)
      const flip = (m.state !== 'walking_back');
      drawSpriteTinted(
        minerImg,
        col * minerFrameW, row * minerFrameH, minerFrameW, minerFrameH,
        m.x, drawY, minerW, minerH,
        flip, 'rgba(255,80,40,0.5)'
      );
    }
  }

  function drawFighters() {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;
    for (const f of fighters) {
      let fi;
      if      (f.state === 'shooting' && f.shootHoldMs > 0) fi = FIGHTER_SHOOT_FRAME;
      else if (f.state === 'melee')  fi = FIGHTER_MELEE_FRAMES[f.frameIdx % FIGHTER_MELEE_FRAMES.length];
      else                           fi = FIGHTER_RUN_FRAMES[f.frameIdx   % FIGHTER_RUN_FRAMES.length];
      const col = fi % SPRITE_COLS, row = Math.floor(fi / SPRITE_COLS);
      ctx.drawImage(spriteImg, col * frameW, row * frameH, frameW, frameH, f.x, groundY - fighterH, fighterW, fighterH);
      if (f.flashTimer > 0) {
        ctx.save();
        ctx.globalAlpha = (f.flashTimer / 150) * 0.55;
        ctx.fillStyle = '#ff2222';
        ctx.fillRect(f.x, groundY - fighterH, fighterW, fighterH);
        ctx.restore();
      }
      drawFighterBars(f, false);
    }
  }

  function drawEnemyFighters() {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;
    for (const f of enemyFighters) {
      let fi;
      if (f.state === 'melee') fi = FIGHTER_MELEE_FRAMES[f.frameIdx % FIGHTER_MELEE_FRAMES.length];
      else                     fi = FIGHTER_RUN_FRAMES[f.frameIdx   % FIGHTER_RUN_FRAMES.length];
      const col = fi % SPRITE_COLS, row = Math.floor(fi / SPRITE_COLS);
      drawSpriteTinted(
        spriteImg,
        col * frameW, row * frameH, frameW, frameH,
        f.x, groundY - fighterH, fighterW, fighterH,
        true,                   // flipped — faces left
        'rgba(220,0,0,0.45)'    // red tint
      );
      if (f.flashTimer > 0) {
        ctx.save();
        ctx.globalAlpha = (f.flashTimer / 150) * 0.65;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(f.x, groundY - fighterH, fighterW, fighterH);
        ctx.restore();
      }
      drawFighterBars(f, true);
    }
  }

  // Draws a sprite frame tinted onto the main canvas via an offscreen buffer.
  // The tint is applied only to non-transparent pixels (source-atop composite).
  function drawSpriteTinted(img, sx, sy, sw, sh, dx, dy, dw, dh, flip, tintColor) {
    if (tintCanvas.width < sw)  tintCanvas.width  = sw;
    if (tintCanvas.height < sh) tintCanvas.height = sh;
    tintCtx.clearRect(0, 0, sw, sh);
    tintCtx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh);
    tintCtx.globalCompositeOperation = 'source-atop';
    tintCtx.fillStyle = tintColor;
    tintCtx.fillRect(0, 0, sw, sh);
    tintCtx.globalCompositeOperation = 'source-over';

    ctx.save();
    if (flip) {
      ctx.scale(-1, 1);
      ctx.drawImage(tintCanvas, 0, 0, sw, sh, -(dx + dw), dy, dw, dh);
    } else {
      ctx.drawImage(tintCanvas, 0, 0, sw, sh, dx, dy, dw, dh);
    }
    ctx.restore();
  }

  function drawFighterBars(f, isEnemy) {
    const barW = fighterW, barH = 4;
    const barX = f.x, barY = groundY - fighterH - barH - 5;
    const hpR  = f.hp / f.maxHp;

    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);
    ctx.fillStyle = isEnemy
      ? (hpR > 0.5 ? '#cc3322' : '#881111')
      : (hpR > 0.5 ? '#33dd55' : hpR > 0.25 ? '#ddaa11' : '#dd2222');
    ctx.fillRect(barX, barY, barW * hpR, barH);

    if (!isEnemy) {
      const dotR = 2.5, dotGap = 2;
      const dotsW = FIGHTER_AMMO * (dotR * 2 + dotGap) - dotGap;
      let dotX    = barX + barW / 2 - dotsW / 2 + dotR;
      const dotY  = barY - dotR - 4;
      for (let i = 0; i < FIGHTER_AMMO; i++) {
        ctx.beginPath();
        ctx.arc(dotX, dotY, dotR, 0, Math.PI * 2);
        ctx.fillStyle = i < f.ammo ? '#ffee44' : '#333333';
        ctx.fill();
        dotX += dotR * 2 + dotGap;
      }
    }
  }

  function drawFighterProjectiles() {
    for (const p of fighterProjectiles) {
      ctx.fillStyle = 'rgba(255,220,50,0.22)';
      ctx.fillRect(p.x - 5, p.y - 4, p.w + 10, p.h + 8);
      ctx.fillStyle = '#ffee44';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x + p.w - 4, p.y + 1, 4, p.h - 2);
    }
  }

  function drawPedestal(statue) {
    const pedW = statueW * 1.15, pedH = statueH * 0.09;
    const pedX = statue.x + statueW / 2 - pedW / 2, pedY = groundY - pedH;
    ctx.fillStyle = '#3a2a18'; ctx.fillRect(pedX, pedY, pedW, pedH);
    ctx.fillStyle = '#5a4428'; ctx.fillRect(pedX, pedY, pedW, 3);
  }

  function drawStatue(statue, flip) {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;
    const col = STATUE_FRAME % SPRITE_COLS, row = Math.floor(STATUE_FRAME / SPRITE_COLS);
    const drawY = groundY - statueH - statueH * 0.09;
    ctx.save();
    if (flip) {
      ctx.scale(-1, 1);
      ctx.drawImage(spriteImg, col * frameW, row * frameH, frameW, frameH, -(statue.x + statueW), drawY, statueW, statueH);
    } else {
      ctx.drawImage(spriteImg, col * frameW, row * frameH, frameW, frameH, statue.x, drawY, statueW, statueH);
    }
    ctx.restore();
  }

  function drawHealthBar(statue, isPlayer) {
    const barW = Math.max(statueW * 1.9, 130), barH = 13;
    const barX = statue.x + statueW / 2 - barW / 2;
    const barY = groundY - statueH - statueH * 0.09 - barH - 20;
    const ratio = Math.max(0, statue.hp / statue.maxHp);

    ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);
    ctx.fillStyle = '#1a1a1a';         ctx.fillRect(barX, barY, barW, barH);
    if (ratio > 0) {
      ctx.fillStyle = ratio > 0.6 ? '#33dd55' : ratio > 0.3 ? '#ddaa11' : '#dd2222';
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.save();
    ctx.shadowColor = '#000'; ctx.shadowBlur = 5;
    ctx.font = 'bold 11px Arial'; ctx.textBaseline = 'bottom';
    ctx.fillStyle = isPlayer ? '#88aaff' : '#ff8888';
    ctx.textAlign = isPlayer ? 'left' : 'right';
    ctx.fillText(isPlayer ? 'PLAYER BASE' : 'ENEMY BASE', isPlayer ? barX : barX + barW, barY - 4);
    ctx.font = 'bold 9px Arial'; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillText(statue.hp + ' / ' + statue.maxHp, barX + barW / 2, barY + barH / 2);
    ctx.restore();
  }

  function drawGoldHUD() {
    const pad = 18;
    const unitCount = fighters.length + miners.length;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.95)'; ctx.shadowBlur = 6;
    ctx.textBaseline = 'top'; ctx.textAlign = 'left';

    ctx.font = 'bold 24px "Arial Black", Arial';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('\u25c6 ' + Math.floor(gold), pad, pad);

    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = '#88aaff';
    ctx.fillText('Units: ' + unitCount, pad, pad + 32);

    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = '#ffaa44';
    ctx.fillText('Score: ' + score, pad, pad + 52);

    ctx.restore();
  }

  function drawUnitCards() {
    const H = canvas.height;
    const cardW = 122, cardH = 60, gap = 10, padL = 18;
    const cardY = H - cardH - 14;
    const cards = [
      { key: 'M', label: 'Miner',   cost: MINER_COST,   canAfford: gold >= MINER_COST },
      { key: 'F', label: 'Fighter', cost: FIGHTER_COST,  canAfford: gold >= FIGHTER_COST },
    ];

    cards.forEach((c, i) => {
      const cardX = padL + i * (cardW + gap);
      ctx.save();
      ctx.globalAlpha = c.canAfford ? 1 : 0.35;
      ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 8;

      // Card background
      ctx.fillStyle = 'rgba(0,0,0,0.82)';
      ctx.strokeStyle = c.canAfford ? 'rgba(255,215,0,0.75)' : 'rgba(255,255,255,0.15)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(cardX, cardY, cardW, cardH, 5);
      ctx.fill();
      ctx.stroke();

      ctx.shadowBlur = 0;
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';

      // Keyboard shortcut badge
      ctx.font = 'bold 16px "Arial Black", Arial';
      ctx.fillStyle = c.canAfford ? '#ffd700' : '#888';
      ctx.fillText('[' + c.key + ']', cardX + 9, cardY + 7);

      // Unit name
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(c.label, cardX + 9, cardY + 28);

      // Cost
      ctx.font = 'bold 12px Arial';
      ctx.fillStyle = '#ffd700';
      ctx.fillText('\u25c6 ' + c.cost, cardX + 9, cardY + 43);

      ctx.restore();
    });
  }

  // ── End Conditions ───────────────────────────────────────────────────────────

  function triggerWin() {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    if (onWin) onWin(score);
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
