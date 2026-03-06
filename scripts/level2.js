'use strict';

const Level2 = (() => {

  // ── Constants ───────────────────────────────────────────────────────────────

  const SPRITE_COLS     = 4;
  const SPRITE_ROWS     = 2;
  const STATUE_FRAME    = 0;      // sprite frame used for both statues
  const STATUE_MAX_HP   = 1000;
  const STATUE_H_FACTOR = 0.33;  // statue height as fraction of canvas H

  // ── State ───────────────────────────────────────────────────────────────────

  let canvas, ctx, running, rafId, lastTime;
  let onWin, onLose;

  const spriteImg = new Image();

  let groundY, frameW, frameH, statueW, statueH;
  let playerStatue, enemyStatue;

  // ── Asset Loading ────────────────────────────────────────────────────────────

  function loadAssets(cb) {
    if (spriteImg.complete && spriteImg.naturalWidth > 0) { cb(); return; }
    spriteImg.onload = spriteImg.onerror = cb;
    spriteImg.src = 'game-assets/SeanSpriteMilitary.png';
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

    playerStatue = {
      x:    W * 0.08,
      hp:   STATUE_MAX_HP,
      maxHp: STATUE_MAX_HP,
    };

    enemyStatue = {
      x:    W * 0.92 - statueW,
      hp:   STATUE_MAX_HP,
      maxHp: STATUE_MAX_HP,
    };
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
  }

  // ── Draw ─────────────────────────────────────────────────────────────────────

  function draw() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    drawBackground();
    drawPedestal(playerStatue);
    drawPedestal(enemyStatue);
    drawStatue(playerStatue, false);
    drawStatue(enemyStatue,  true);
    drawHealthBar(playerStatue, true);
    drawHealthBar(enemyStatue,  false);
  }

  function drawBackground() {
    const W = canvas.width;
    const H = canvas.height;

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, groundY);
    sky.addColorStop(0,   '#080818');
    sky.addColorStop(0.5, '#111830');
    sky.addColorStop(1,   '#1e2a48');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, groundY);

    // ground
    const gnd = ctx.createLinearGradient(0, groundY, 0, H);
    gnd.addColorStop(0, '#2a1a0a');
    gnd.addColorStop(1, '#0a0804');
    ctx.fillStyle = gnd;
    ctx.fillRect(0, groundY, W, H - groundY);

    // ground edge
    ctx.strokeStyle = '#4a3010';
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(W, groundY);
    ctx.stroke();

    // player-side tint (blue)
    ctx.fillStyle = 'rgba(60,120,255,0.05)';
    ctx.fillRect(0, 0, W * 0.22, H);

    // enemy-side tint (red)
    ctx.fillStyle = 'rgba(255,50,50,0.05)';
    ctx.fillRect(W * 0.78, 0, W * 0.22, H);

    // centre divider — faint dotted line
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

  function drawPedestal(statue) {
    const pedW = statueW * 1.15;
    const pedH = statueH * 0.09;
    const pedX = statue.x + statueW / 2 - pedW / 2;
    const pedY = groundY - pedH;

    // body
    ctx.fillStyle = '#3a2a18';
    ctx.fillRect(pedX, pedY, pedW, pedH);
    // highlight lip
    ctx.fillStyle = '#5a4428';
    ctx.fillRect(pedX, pedY, pedW, 3);
  }

  function drawStatue(statue, flip) {
    if (!spriteImg.complete || spriteImg.naturalWidth === 0) return;

    const col    = STATUE_FRAME % SPRITE_COLS;
    const row    = Math.floor(STATUE_FRAME / SPRITE_COLS);
    const pedH   = statueH * 0.09;
    const drawY  = groundY - statueH - pedH;

    ctx.save();
    if (flip) {
      ctx.scale(-1, 1);
      ctx.drawImage(
        spriteImg,
        col * frameW, row * frameH, frameW, frameH,
        -(statue.x + statueW), drawY, statueW, statueH
      );
    } else {
      ctx.drawImage(
        spriteImg,
        col * frameW, row * frameH, frameW, frameH,
        statue.x, drawY, statueW, statueH
      );
    }
    ctx.restore();
  }

  function drawHealthBar(statue, isPlayer) {
    const barW   = Math.max(statueW * 1.9, 130);
    const barH   = 13;
    const barX   = statue.x + statueW / 2 - barW / 2;
    const pedH   = statueH * 0.09;
    const barY   = groundY - statueH - pedH - barH - 20;
    const ratio  = Math.max(0, statue.hp / statue.maxHp);

    // shadow border
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(barX - 2, barY - 2, barW + 4, barH + 4);

    // empty track
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(barX, barY, barW, barH);

    // filled portion
    if (ratio > 0) {
      let fillColor;
      if      (ratio > 0.6) fillColor = '#33dd55';
      else if (ratio > 0.3) fillColor = '#ddaa11';
      else                  fillColor = '#dd2222';
      ctx.fillStyle = fillColor;
      ctx.fillRect(barX, barY, barW * ratio, barH);
    }

    // thin border
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth   = 1;
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.save();
    ctx.shadowColor  = '#000';
    ctx.shadowBlur   = 5;

    // base label above bar
    ctx.font         = 'bold 11px Arial';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle    = isPlayer ? '#88aaff' : '#ff8888';
    ctx.textAlign    = isPlayer ? 'left' : 'right';
    ctx.fillText(
      isPlayer ? 'PLAYER BASE' : 'ENEMY BASE',
      isPlayer ? barX : barX + barW,
      barY - 4
    );

    // HP numbers centred inside bar
    ctx.font         = 'bold 9px Arial';
    ctx.textBaseline = 'middle';
    ctx.textAlign    = 'center';
    ctx.fillStyle    = 'rgba(255,255,255,0.75)';
    ctx.fillText(statue.hp + ' / ' + statue.maxHp, barX + barW / 2, barY + barH / 2);

    ctx.restore();
  }

  // ── End Conditions ───────────────────────────────────────────────────────────

  function triggerWin() {
    running = false;
    cancelAnimationFrame(rafId);
    if (onWin)  onWin();
  }

  function triggerLose() {
    running = false;
    cancelAnimationFrame(rafId);
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
      rafId    = requestAnimationFrame(loop);
    });
  }

  function stop() {
    running = false;
    if (rafId) cancelAnimationFrame(rafId);
  }

  return { start, stop };

})();
