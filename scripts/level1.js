'use strict';

const Level1 = (() => {

  // ── Constants ───────────────────────────────────────────────────────────────

  const GRAVITY        = 0.296; // 0.37 ÷ 1.25 → further 25% longer air time
  const JUMP_FORCE     = -16;   // -13 × √1.5 ≈ -15.9 → +50% peak height
  const PLAYER_X       = 130;       // fixed screen x of player
  const SPRITE_COLS    = 4;           // 4 frames per row
  const SPRITE_ROWS    = 2;           // 2 rows
  const RUN_FRAMES     = [0,1,2,3,4,5,6,7];
  const JUMP_FRAMES    = [5,6,7,6,5]; // row 1 frames for jump arc
  const SHOOT_FRAME    = 2;           // row 0, col 2 as shoot pose
  const FRAME_MS       = 90;
  const AMMO_MAX       = 3;
  const LIVES_MAX      = 3;
  const RELOAD_MS      = 3000;        // per round
  const PROJ_SPEED     = 9;           // px/frame (left-to-right toward enemies)
  const SHOOT_HOLD_MS  = 200;
  const HIT_SHRINK     = 0.22;        // shrink hitbox fraction per side
  const AIR_ENEMY_DELAY = 20000;      // ms before air enemies start appearing
  const AIR_Y_MIN       = 0.28;       // highest air enemy can appear (fraction of H)
  const AIR_Y_MAX       = 0.52;       // lowest air enemy can appear (fraction of H)
  const LEVEL_LENGTH_M  = 500;        // meters to complete the level
  const MS_PER_METER    = 30;         // milliseconds per meter (5000m ≈ 150 s)

  // ── State ───────────────────────────────────────────────────────────────────

  let canvas, ctx, running, rafId, lastTime, onGameOver, onLevelComplete;

  const bgImg       = new Image();
  const enemyImg    = new Image();
  const airEnemyImg = new Image();
  const spriteImg   = new Image();

  // layout (computed on init)
  let groundY, frameW, frameH, displayW, displayH;
  let bgW, enemyDW, enemyDH, airEnemyDW, airEnemyDH;

  // objects
  let obstacles, airObstacles, projectiles, effects;
  let spawnTimer, airSpawnTimer, airSpawnTarget, elapsedMs;

  // scrolling
  let bgX, bgSpeed;

  // player
  let playerY, velY, onGround;
  let frameIdx, frameTick, animState, shootHoldMs;

  // HUD
  let score, lives, ammo;
  let reloading, reloadTimer, ammoReloaded;

  // input
  let keys, justPressed;

  // ── Asset Loading ───────────────────────────────────────────────────────────

  function loadAssets(cb) {
    let n = 0;
    const done = () => { if (++n === 4) cb(); };
    [
      [bgImg,       'image-assets/level_1_background.png'],
      [enemyImg,    'image-assets/level_1_enemy.png'],
      [airEnemyImg, 'image-assets/air_enemy_1.png'],
      [spriteImg,   'game-assets/SeanSpriteMilitary.png'],
    ].forEach(([img, src]) => {
      // If already loaded (cached from a previous run), count immediately
      // instead of reassigning onload and risk firing done() twice.
      if (img.complete && img.naturalWidth > 0) {
        done();
      } else {
        img.onload = img.onerror = done;
        img.src = src;
      }
    });
  }

  // ── Init ────────────────────────────────────────────────────────────────────

  function init() {
    // size canvas to fill its container
    const parent = canvas.parentElement;
    canvas.width  = parent.clientWidth  || window.innerWidth;
    canvas.height = parent.clientHeight || window.innerHeight;

    const W = canvas.width;
    const H = canvas.height;

    groundY = H * 0.72;

    // sprite sheet layout — 4 cols × 2 rows
    frameW   = (spriteImg.naturalWidth  || 256) / SPRITE_COLS;
    frameH   = (spriteImg.naturalHeight || 128) / SPRITE_ROWS;
    displayH = H * 0.22;
    displayW = (frameW / frameH) * displayH;

    // background
    const bgNatH = bgImg.naturalHeight || H;
    const bgNatW = bgImg.naturalWidth  || W;
    bgW   = bgNatW * (H / bgNatH);
    bgX   = 0;
    bgSpeed = 2;

    // enemy size (scale to ~16% of screen height)
    const eNatH = enemyImg.naturalHeight || 64;
    const eNatW = enemyImg.naturalWidth  || 64;
    const eScale = (H * 0.16) / eNatH;
    enemyDW = eNatW * eScale;
    enemyDH = eNatH * eScale;

    // air enemy size (scale to ~14% of screen height)
    const aeNatH = airEnemyImg.naturalHeight || 64;
    const aeNatW = airEnemyImg.naturalWidth  || 64;
    const aeScale = (H * 0.14) / aeNatH;
    airEnemyDW = aeNatW * aeScale;
    airEnemyDH = aeNatH * aeScale;

    // player
    playerY      = groundY - displayH;
    velY         = 0;
    onGround     = true;
    frameIdx     = 0;
    frameTick    = 0;
    animState    = 'run';
    shootHoldMs  = 0;

    // game objects
    obstacles    = [];
    airObstacles = [];
    projectiles  = [];
    effects      = [];
    spawnTimer      = 0;
    airSpawnTimer   = 0;
    airSpawnTarget  = 3200 * (0.6 + Math.random() * 0.8); // first interval randomised
    elapsedMs       = 0;

    // HUD state
    score        = 0;
    lives        = LIVES_MAX;
    ammo         = AMMO_MAX;
    reloading    = false;
    reloadTimer  = 0;
    ammoReloaded = 0;

    // input
    keys        = {};
    justPressed = {};
  }

  // ── Game Loop ────────────────────────────────────────────────────────────────

  function loop(ts) {
    if (!running) return;
    const dt = Math.min(ts - lastTime, 50);
    lastTime = ts;

    update(dt);
    draw();
    justPressed = {};
    rafId = requestAnimationFrame(loop);
  }

  // ── Update ───────────────────────────────────────────────────────────────────

  function update(dt) {
    elapsedMs += dt;
    if (Math.floor(elapsedMs / MS_PER_METER) >= LEVEL_LENGTH_M) {
      triggerLevelComplete();
      return;
    }
    updateBackground();
    handleInput();
    updatePlayer(dt);
    updateObstacles(dt);
    updateAirObstacles(dt);
    updateProjectiles();
    updateEffects(dt);
    updateReload(dt);
  }

  function updateBackground() {
    bgX -= bgSpeed;
    if (bgX <= -bgW) bgX += bgW;
  }

  function handleInput() {
    if ((justPressed['ArrowUp'] || justPressed['w'] || justPressed['W']) && onGround) {
      velY      = JUMP_FORCE;
      onGround  = false;
      animState = 'jump';
      frameIdx  = 0;
      frameTick = 0;
    }
    if (justPressed[' ']) fireProjectile();
  }

  function updatePlayer(dt) {
    if (!onGround) {
      velY    += GRAVITY;
      playerY += velY;
    }
    if (playerY >= groundY - displayH) {
      playerY  = groundY - displayH;
      velY     = 0;
      onGround = true;
      if (animState === 'jump') animState = 'run';
    }
    if (animState === 'shoot') {
      shootHoldMs -= dt;
      if (shootHoldMs <= 0) animState = onGround ? 'run' : 'jump';
    }
    frameTick += dt;
    if (frameTick >= FRAME_MS) {
      frameTick -= FRAME_MS;
      const fr = currentFrames();
      frameIdx = (frameIdx + 1) % fr.length;
    }
  }

  function currentFrames() {
    if (animState === 'shoot') return [SHOOT_FRAME];
    if (animState === 'jump')  return JUMP_FRAMES;
    return RUN_FRAMES;
  }

  function fireProjectile() {
    if (reloading || ammo <= 0) return;
    ammo--;
    animState   = 'shoot';
    shootHoldMs = SHOOT_HOLD_MS;
    frameIdx    = 0;
    projectiles.push({
      x: PLAYER_X + displayW * 0.8,
      y: playerY  + displayH * 0.38,
      w: 18,
      h: 5,
    });
    if (ammo === 0) {
      reloading    = true;
      reloadTimer  = 0;
      ammoReloaded = 0;
    }
  }

  function updateReload(dt) {
    if (!reloading) return;
    reloadTimer += dt;
    if (reloadTimer >= RELOAD_MS) {
      reloadTimer -= RELOAD_MS;
      ammoReloaded++;
    }
    if (ammoReloaded >= AMMO_MAX) {
      ammo         = AMMO_MAX;
      reloading    = false;
      ammoReloaded = 0;
    }
  }

  function updateObstacles(dt) {
    const W = canvas.width;

    // scale difficulty with score
    const obSpeed   = 3   + score * 0.02;
    const spawnMs   = Math.max(900, 2200 - score * 3);
    bgSpeed         = 2   + score * 0.01;

    spawnTimer += dt;
    if (spawnTimer >= spawnMs) {
      spawnTimer = 0;
      obstacles.push({
        x:      W + 20,
        y:      groundY - enemyDH,
        w:      enemyDW,
        h:      enemyDH,
        speed:  obSpeed,
        scored: false,
      });
    }

    for (let i = obstacles.length - 1; i >= 0; i--) {
      const ob = obstacles[i];
      ob.x -= ob.speed;

      // award jump-over point once obstacle fully passes player
      if (!ob.scored && ob.x + ob.w < PLAYER_X) {
        ob.scored = true;
        score += 1;
      }

      if (ob.x + ob.w < 0) { obstacles.splice(i, 1); continue; }

      // shrunk player hitbox for fair collision
      const hx = PLAYER_X + displayW * HIT_SHRINK;
      const hy = playerY  + displayH * HIT_SHRINK;
      const hw = displayW * (1 - HIT_SHRINK * 2);
      const hh = displayH * (1 - HIT_SHRINK * 2);

      if (collides(hx, hy, hw, hh, ob.x, ob.y, ob.w, ob.h)) {
        spawnBurst(ob.x + ob.w * 0.5, ob.y + ob.h * 0.3, '#ff3300');
        obstacles.splice(i, 1);
        lives--;
        if (lives <= 0) { triggerGameOver(); return; }
      }
    }
  }

  function updateAirObstacles(dt) {
    if (elapsedMs < AIR_ENEMY_DELAY) return;

    const W = canvas.width;
    const H = canvas.height;

    airSpawnTimer += dt;
    if (airSpawnTimer >= airSpawnTarget) {
      airSpawnTimer  = 0;
      // randomise next interval: base shrinks with score, ±40% jitter
      const base     = Math.max(1200, 3200 - score * 4);
      airSpawnTarget = base * (0.6 + Math.random() * 0.8);

      const airY     = H * (AIR_Y_MIN + Math.random() * (AIR_Y_MAX - AIR_Y_MIN));
      const airSpeed = 4 + score * 0.025;
      airObstacles.push({
        x:      W + 20,
        y:      airY,
        w:      airEnemyDW,
        h:      airEnemyDH,
        speed:  airSpeed,
        scored: false,
      });
    }

    for (let i = airObstacles.length - 1; i >= 0; i--) {
      const ob = airObstacles[i];
      ob.x -= ob.speed;

      if (ob.x + ob.w < 0) { airObstacles.splice(i, 1); continue; }

      // shrunk player hitbox
      const hx = PLAYER_X + displayW * HIT_SHRINK;
      const hy = playerY  + displayH * HIT_SHRINK;
      const hw = displayW * (1 - HIT_SHRINK * 2);
      const hh = displayH * (1 - HIT_SHRINK * 2);

      if (collides(hx, hy, hw, hh, ob.x, ob.y, ob.w, ob.h)) {
        spawnBurst(ob.x + ob.w * 0.5, ob.y + ob.h * 0.5, '#ff3300');
        airObstacles.splice(i, 1);
        lives--;
        if (lives <= 0) { triggerGameOver(); return; }
      }
    }
  }

  function updateProjectiles() {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.x += PROJ_SPEED;
      if (p.x > canvas.width) { projectiles.splice(i, 1); continue; }

      let hit = false;

      for (let j = obstacles.length - 1; j >= 0; j--) {
        const ob = obstacles[j];
        if (collides(p.x, p.y, p.w, p.h, ob.x, ob.y, ob.w, ob.h)) {
          spawnBurst(ob.x + ob.w * 0.5, ob.y + ob.h * 0.3, '#ffdd00');
          obstacles.splice(j, 1);
          score += 5;
          hit    = true;
          break;
        }
      }

      if (!hit) {
        for (let j = airObstacles.length - 1; j >= 0; j--) {
          const ob = airObstacles[j];
          if (collides(p.x, p.y, p.w, p.h, ob.x, ob.y, ob.w, ob.h)) {
            spawnBurst(ob.x + ob.w * 0.5, ob.y + ob.h * 0.5, '#ffdd00');
            airObstacles.splice(j, 1);
            score += 10;
            hit    = true;
            break;
          }
        }
      }

      if (hit) projectiles.splice(i, 1);
    }
  }

  function updateEffects(dt) {
    for (let i = effects.length - 1; i >= 0; i--) {
      const e = effects[i];
      e.x    += e.vx;
      e.y    += e.vy;
      e.vy   += 0.18;
      e.life -= e.decay * (dt / 16);
      if (e.life <= 0) effects.splice(i, 1);
    }
  }

  function spawnBurst(x, y, baseColor) {
    const palette = [baseColor, '#ffffff', '#ffff88'];
    for (let i = 0; i < 14; i++) {
      const angle = (i / 14) * Math.PI * 2 + (Math.random() - 0.5) * 0.9;
      const spd   = 1.2 + Math.random() * 5;
      effects.push({
        x, y,
        vx:    Math.cos(angle) * spd,
        vy:    Math.sin(angle) * spd - 1.5,
        life:  1.0,
        decay: 0.032 + Math.random() * 0.04,
        size:  2 + Math.random() * 4,
        color: palette[Math.floor(Math.random() * palette.length)],
      });
    }
  }

  function collides(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function triggerGameOver() {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    if (onGameOver) onGameOver(score);
  }

  function triggerLevelComplete() {
    running = false;
    cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
    if (onLevelComplete) onLevelComplete(score);
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawObstacles();
    drawAirObstacles();
    drawProjectiles();
    drawPlayer();
    drawEffects();
    drawHUD();
  }

  function drawBackground() {
    const H = canvas.height;
    if (bgImg.complete && bgImg.naturalWidth > 0) {
      ctx.drawImage(bgImg, bgX,       0, bgW, H);
      ctx.drawImage(bgImg, bgX + bgW, 0, bgW, H);
      if (bgX > 0) ctx.drawImage(bgImg, bgX - bgW, 0, bgW, H);
    } else {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, H);
    }
  }

  function drawPlayer() {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;
    const frames = currentFrames();
    const fi     = frames[frameIdx % frames.length];
    const col    = fi % SPRITE_COLS;
    const row    = Math.floor(fi / SPRITE_COLS);
    ctx.drawImage(
      spriteImg,
      col * frameW, row * frameH, frameW, frameH,
      PLAYER_X, playerY, displayW, displayH
    );
  }

  function drawObstacles() {
    if (!enemyImg.complete || enemyImg.naturalWidth === 0) return;
    for (const ob of obstacles) {
      ctx.drawImage(enemyImg, ob.x, ob.y, ob.w, ob.h);
    }
  }

  function drawAirObstacles() {
    if (!airEnemyImg.complete || airEnemyImg.naturalWidth === 0) return;
    for (const ob of airObstacles) {
      ctx.drawImage(airEnemyImg, ob.x, ob.y, ob.w, ob.h);
    }
  }

  function drawProjectiles() {
    for (const p of projectiles) {
      // outer glow
      ctx.fillStyle = 'rgba(255,220,50,0.22)';
      ctx.fillRect(p.x - 5, p.y - 4, p.w + 10, p.h + 8);
      // body
      ctx.fillStyle = '#ffee44';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      // bright tip
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(p.x + p.w - 5, p.y + 1, 5, p.h - 2);
    }
  }

  function drawEffects() {
    for (const e of effects) {
      ctx.globalAlpha = Math.max(0, e.life);
      ctx.fillStyle   = e.color;
      const s = Math.max(1, Math.round(e.size));
      ctx.fillRect(Math.round(e.x) - (s >> 1), Math.round(e.y) - (s >> 1), s, s);
    }
    ctx.globalAlpha = 1;
  }

  function drawHUD() {
    const W   = canvas.width;
    const pad = 18;

    ctx.save();
    ctx.shadowColor  = 'rgba(0,0,0,0.9)';
    ctx.shadowBlur   = 5;
    ctx.textBaseline = 'top';

    // ── LIVES (top left) ──
    ctx.font      = 'bold 24px Arial';
    ctx.textAlign = 'left';
    let lStr = '';
    for (let i = 0; i < LIVES_MAX; i++) lStr += i < lives ? '\u2665 ' : '\u2661 ';
    ctx.fillStyle = '#ff4444';
    ctx.fillText(lStr.trim(), pad, pad);

    // ── SCORE (top center) ──
    ctx.font      = 'bold 26px "Arial Black", Arial';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(String(score).padStart(5, '0'), W / 2, pad);

    // ── PROGRESS BAR (below score) ──
    const dist   = Math.min(LEVEL_LENGTH_M, Math.floor(elapsedMs / MS_PER_METER));
    const fill   = dist / LEVEL_LENGTH_M;
    const barW   = Math.min(280, W * 0.26);
    const barH   = 7;
    const barX   = W / 2 - barW / 2;
    const barY   = pad + 34;

    ctx.shadowBlur = 0;
    ctx.fillStyle  = 'rgba(0,0,0,0.55)';
    ctx.fillRect(barX - 1, barY - 1, barW + 2, barH + 2);
    ctx.fillStyle  = '#222';
    ctx.fillRect(barX, barY, barW, barH);

    if (fill > 0) {
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0,    '#22cc44');
      grad.addColorStop(0.65, '#ddcc00');
      grad.addColorStop(1,    '#ff8800');
      ctx.fillStyle = grad;
      ctx.fillRect(barX, barY, barW * fill, barH);
    }

    ctx.shadowBlur = 5;
    ctx.font       = 'bold 10px Arial';
    ctx.textAlign  = 'center';
    ctx.fillStyle  = '#aaaaaa';
    ctx.fillText(dist + ' / ' + LEVEL_LENGTH_M + ' m', W / 2, barY + barH + 5);

    // ── AMMO (top right) ──
    ctx.textAlign = 'right';
    ctx.font      = 'bold 24px Arial';
    if (reloading) {
      let rStr = '';
      for (let i = 0; i < AMMO_MAX; i++) rStr += i < ammoReloaded ? '\u25cf ' : '\u25cb ';
      ctx.fillStyle = '#aaaaaa';
      ctx.fillText(rStr.trim(), W - pad, pad);
      const pct = Math.min(99, Math.floor((reloadTimer / RELOAD_MS) * 100));
      ctx.font      = 'bold 13px Arial';
      ctx.fillStyle = '#888888';
      ctx.fillText('RELOADING  ' + pct + '%', W - pad, pad + 28);
    } else {
      let aStr = '';
      for (let i = 0; i < AMMO_MAX; i++) aStr += i < ammo ? '\u25cf ' : '\u25cb ';
      ctx.fillStyle = '#ffee44';
      ctx.fillText(aStr.trim(), W - pad, pad);
    }

    ctx.restore();
  }

  // ── Input ─────────────────────────────────────────────────────────────────────

  function onKeyDown(e) {
    if (!keys[e.key]) justPressed[e.key] = true;
    keys[e.key] = true;
    if ([' ', 'ArrowUp', 'w', 'W'].includes(e.key)) e.preventDefault();
  }

  function onKeyUp(e) { keys[e.key] = false; }

  // ── Public API ────────────────────────────────────────────────────────────────

  function start(gameOverCb, levelCompleteCb) {
    stop(); // cancel any existing loop before starting a new one
    canvas           = document.getElementById('game-canvas');
    ctx              = canvas.getContext('2d');
    onGameOver       = gameOverCb;
    onLevelComplete  = levelCompleteCb;

    loadAssets(() => {
      init();
      running  = true;
      lastTime = performance.now();
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup',   onKeyUp);
      rafId = requestAnimationFrame(loop);
    });
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup',   onKeyUp);
  }

  return { start, stop };

})();
