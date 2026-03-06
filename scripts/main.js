'use strict';

// ── Leaderboard ───────────────────────────────────────────────────────────────

const LB_KEY      = 'seanSim2_scores';
const LB_MAX      = 5;

function loadScores() {
  try { return JSON.parse(localStorage.getItem(LB_KEY)) || []; }
  catch { return []; }
}

function saveScore(name, score) {
  const scores = loadScores();
  scores.push({ name: name.trim() || 'PLAYER', score });
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
  menu:     document.getElementById('screen-menu'),
  rules:    document.getElementById('screen-rules'),
  about:    document.getElementById('screen-about'),
  prologue: document.getElementById('screen-prologue'),
  level1:   document.getElementById('screen-level1'),
  gameover: document.getElementById('screen-gameover'),
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

function startMenuMusic() {
  prologueMusic.pause();
  prologueMusic.currentTime = 0;
  level1Music.pause();
  level1Music.currentTime = 0;
  menuMusic.currentTime = 0;
  menuMusic.play().catch(() => {
    document.addEventListener('click', () => menuMusic.play(), { once: true });
  });
}

function startPrologueMusic() {
  menuMusic.pause();
  prologueMusic.currentTime = 0;
  prologueMusic.play().catch(() => {});
}

function startLevel1Music() {
  prologueMusic.pause();
  prologueMusic.currentTime = 0;
  level1Music.currentTime = 0;
  level1Music.play().catch(() => {});
}

function stopLevel1Music() {
  level1Music.pause();
  level1Music.currentTime = 0;
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
  Level1.start(onLevel1GameOver);
  startLevel1Music();
}

let pendingScore = 0;
let scoreSubmitted = false;

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
