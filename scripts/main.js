'use strict';

// ── Leaderboard ───────────────────────────────────────────────────────────────

const LB_KEY      = 'seanSim2_scores';
const LB_MAX      = 5;

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
  catch { return []; }
}

function saveScore(name, score) {
  const trimmed = name.trim() || 'PLAYER';
  const scores  = loadScores();
  const existing = scores.findIndex(e => e.name.toLowerCase() === trimmed.toLowerCase());
  if (existing !== -1) {
    if (score <= scores[existing].score) { renderLeaderboard(); return; }
    scores.splice(existing, 1);
  }
  scores.push({ name: trimmed, score });
  scores.sort((a, b) => b.score - a.score);
  scores.splice(LB_MAX);
  localStorage.setItem(LB_KEY, JSON.stringify(scores));
  renderLeaderboard();
}

function renderLeaderboard() {
  const list   = document.getElementById('lb-list');
  const scores = loadScores();
  list.innerHTML = '';
  if (scores.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'No scores yet';
    li.style.color = '#555';
    list.appendChild(li);
    return;
  }
  scores.forEach((entry, i) => {
    const li    = document.createElement('li');
    const rank  = document.createElement('span');
    const name  = document.createElement('span');
    const score = document.createElement('span');
    rank.className  = 'lb-rank';
    name.className  = 'lb-name';
    score.className = 'lb-score';
    rank.textContent  = (i + 1) + '.';
    name.textContent  = entry.name;
    score.textContent = String(entry.score).padStart(5, '0');
    li.append(rank, name, score);
    list.appendChild(li);
  });
}

// ── Screen Manager ───────────────────────────────────────────────────────────

const screens = {
  menu:           document.getElementById('screen-menu'),
  rules:          document.getElementById('screen-rules'),
  about:          document.getElementById('screen-about'),
  prologue:       document.getElementById('screen-prologue'),
  level1:         document.getElementById('screen-level1'),
  level1complete: document.getElementById('screen-level1complete'),
  level2:         document.getElementById('screen-level2'),
  level2victory:  document.getElementById('screen-level2victory'),
  level2over:     document.getElementById('screen-level2over'),
  gameover:       document.getElementById('screen-gameover'),
};

function showScreen(name) {
  for (const screen of Object.values(screens)) {
    screen.classList.remove('active');
  }
  screens[name].classList.add('active');
}

// ── Audio ────────────────────────────────────────────────────────────────────

const menuMusic     = document.getElementById('menu-music');
const prologueMusic = document.getElementById('prologue-music');
const level1Music   = document.getElementById('level1-music');
const level2Music   = document.getElementById('level2-music');

let deferredMenuPlay  = null;
let menuMusicActive   = false;

function startMenuMusic() {
  // Clear any previous deferred attempt before registering a new one
  if (deferredMenuPlay) {
    document.removeEventListener('click', deferredMenuPlay, true);
    deferredMenuPlay = null;
  }
  menuMusicActive = true;
  prologueMusic.pause();
  prologueMusic.currentTime = 0;
  level1Music.pause();
  level1Music.currentTime = 0;
  menuMusic.currentTime = 0;
  menuMusic.play().catch(() => {
    // Register in CAPTURE phase so this fires before any button handler.
    // If the user clicked "Play", startPrologueMusic() will call pause() immediately
    // after, causing the play() Promise to reject silently — no audio blip.
    deferredMenuPlay = function () {
      deferredMenuPlay = null;
      if (menuMusicActive) menuMusic.play().catch(() => {});
    };
    document.addEventListener('click', deferredMenuPlay, true);
  });
}

function startPrologueMusic() {
  menuMusicActive = false;   // tells any pending deferred not to play
  menuMusic.pause();
  prologueMusic.currentTime = 0;
  prologueMusic.play().catch(() => {});
}

function startLevel1Music() {
  menuMusicActive = false;
  prologueMusic.pause();
  prologueMusic.currentTime = 0;
  level1Music.currentTime = 0;
  level1Music.play().catch(() => {});
}

function stopLevel1Music() {
  level1Music.pause();
  level1Music.currentTime = 0;
}

function startLevel2Music() {
  menuMusicActive = false;
  level1Music.pause();
  level1Music.currentTime = 0;
  level2Music.currentTime = 0;
  level2Music.play().catch(() => {});
}

function stopLevel2Music() {
  level2Music.pause();
  level2Music.currentTime = 0;
}

// ── Prologue ─────────────────────────────────────────────────────────────────

const PROLOGUE_STAGES = [
  { image: null,                                  file: 'scripts/prologue1.txt.txt' },
  { image: 'image-assets/prologue_image_1.webp',  file: 'scripts/prologue2.txt.txt' },
  { image: 'image-assets/prologue_image_2.png',   file: 'scripts/prologue3.txt.txt' },
];
const STAGE_DURATION = 10000;

let prologueTexts   = [];
let prologueCurrent = 0;
let prologueTimer   = null;

async function loadPrologueTexts() {
  prologueTexts = await Promise.all(
    PROLOGUE_STAGES.map(s =>
      fetch(s.file)
        .then(r => r.text())
        .then(t => t.trim())
        .catch(() => '')
    )
  );
}

function showPrologueStage(index) {
  clearTimeout(prologueTimer);

  const stage = PROLOGUE_STAGES[index];
  const img   = document.getElementById('prologue-img');
  const text  = document.getElementById('prologue-text');

  if (stage.image) {
    img.src    = stage.image;
    img.hidden = false;
  } else {
    img.hidden = true;
    img.src    = '';
  }

  text.textContent = prologueTexts[index] ?? '';

  prologueTimer = setTimeout(advancePrologue, STAGE_DURATION);
}

function advancePrologue() {
  if (prologueCurrent < PROLOGUE_STAGES.length - 1) {
    prologueCurrent++;
    showPrologueStage(prologueCurrent);
  } else {
    endPrologue();
  }
}

function endPrologue() {
  clearTimeout(prologueTimer);
  document.removeEventListener('keydown', onPrologueKey);
  prologueMusic.pause();
  prologueMusic.currentTime = 0;
  showScreen('level1');
  Level1.start(onLevel1GameOver, onLevel1Complete);
  startLevel1Music();
}

let pendingScore = 0;
let scoreSubmitted = false;

function onLevel1Complete(finalScore) {
  stopLevel1Music();
  document.getElementById('l1c-score').textContent = 'SCORE: ' + String(finalScore).padStart(5, '0');
  showScreen('level1complete');
}

function onLevel1GameOver(finalScore) {
  stopLevel1Music();
  pendingScore   = finalScore;
  scoreSubmitted = false;
  document.getElementById('gameover-score').textContent = 'SCORE: ' + String(finalScore).padStart(5, '0');
  const nameInput = document.getElementById('gameover-name');
  nameInput.value = '';
  showScreen('gameover');
  // Focus the name field after the screen is visible
  requestAnimationFrame(() => nameInput.focus());
}

function submitScore() {
  if (scoreSubmitted) return;
  scoreSubmitted = true;
  const name = document.getElementById('gameover-name').value;
  saveScore(name, pendingScore);
  returnToMenu();
}

function returnToMenu() {
  showScreen('menu');
  startMenuMusic();
}

document.getElementById('gameover-submit').addEventListener('click', (e) => {
  e.stopPropagation();
  submitScore();
});

document.getElementById('gameover-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.stopPropagation(); submitScore(); }
});

screens.gameover.addEventListener('click', () => {
  if (!scoreSubmitted) { scoreSubmitted = true; }
  returnToMenu();
});

function onPrologueKey(e) {
  if (e.key === 'Enter') advancePrologue();
}

function startPrologue() {
  prologueCurrent = 0;
  showScreen('prologue');
  startPrologueMusic();
  document.addEventListener('keydown', onPrologueKey);
  showPrologueStage(0);
}

// ── Navigation ───────────────────────────────────────────────────────────────

document.getElementById('btn-play').addEventListener('click', startPrologue);

document.getElementById('btn-rules').addEventListener('click', () => {
  showScreen('rules');
});

document.getElementById('btn-about').addEventListener('click', () => {
  showScreen('about');
});

document.getElementById('btn-l1c-continue').addEventListener('click', () => {
  showScreen('level2');
  startLevel2Music();
  Level2.start(onLevel2Win, onLevel2Lose);
});

document.getElementById('btn-l1c-menu').addEventListener('click', () => {
  showScreen('menu');
  startMenuMusic();
});

function onLevel2Win(finalScore) {
  stopLevel2Music();
  Level2.stop();
  document.getElementById('l2v-score').textContent = 'SCORE: ' + String(finalScore).padStart(5, '0');
  showScreen('level2victory');
}

function onLevel2Lose() {
  stopLevel2Music();
  Level2.stop();
  showScreen('level2over');
}

document.getElementById('btn-l2v-menu').addEventListener('click', () => {
  showScreen('menu');
  startMenuMusic();
});

screens.level2over.addEventListener('click', () => {
  showScreen('menu');
  startMenuMusic();
});

document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => {
    showScreen('menu');
    startMenuMusic();
  });
});

// ── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  showScreen('menu');
  loadPrologueTexts();
  startMenuMusic();
  renderLeaderboard();
});
