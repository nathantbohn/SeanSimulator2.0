'use strict';

// ── Screen Manager ───────────────────────────────────────────────────────────

const screens = {
  menu:     document.getElementById('screen-menu'),
  rules:    document.getElementById('screen-rules'),
  about:    document.getElementById('screen-about'),
  prologue: document.getElementById('screen-prologue'),
};

function showScreen(name) {
  for (const screen of Object.values(screens)) {
    screen.classList.remove('active');
  }
  screens[name].classList.add('active');
}

// ── Audio ────────────────────────────────────────────────────────────────────

const menuMusic = document.getElementById('menu-music');

function startMenuMusic() {
  menuMusic.play().catch(() => {
    // Autoplay blocked — start on first user interaction
    document.addEventListener('click', () => menuMusic.play(), { once: true });
  });
}

// ── Navigation ───────────────────────────────────────────────────────────────

document.getElementById('btn-play').addEventListener('click', () => {
  showScreen('prologue');
});

document.getElementById('btn-rules').addEventListener('click', () => {
  showScreen('rules');
});

document.getElementById('btn-about').addEventListener('click', () => {
  showScreen('about');
});

document.querySelectorAll('.btn-back').forEach(btn => {
  btn.addEventListener('click', () => showScreen('menu'));
});

// ── Init ─────────────────────────────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
  showScreen('menu');
  startMenuMusic();
});
