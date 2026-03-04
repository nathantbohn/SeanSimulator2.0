'use strict';

// ── Screen Manager ───────────────────────────────────────────────────────────

const screens = {
  menu:     document.getElementById('screen-menu'),
  rules:    document.getElementById('screen-rules'),
  about:    document.getElementById('screen-about'),
  prologue: document.getElementById('screen-prologue'),
  level1:   document.getElementById('screen-level1'),
};

function showScreen(name) {
  for (const screen of Object.values(screens)) {
    screen.classList.remove('active');
  }
  screens[name].classList.add('active');
}

// ── Audio ────────────────────────────────────────────────────────────────────

const menuMusic    = document.getElementById('menu-music');
const prologueMusic = document.getElementById('prologue-music');

function startMenuMusic() {
  prologueMusic.pause();
  prologueMusic.currentTime = 0;
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
}

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
});
