import { INTEREST_MAX } from '../config.js';
import { getAllProgressForStats } from './conversationState.js';
import rosterFree from '../characters/roster.free.json';

const panel = document.getElementById('conversation-ui');
const nameEl = document.getElementById('char-name');
const meterFill = document.getElementById('interest-meter-fill');
const transcriptEl = document.getElementById('transcript-line');
const herLineEl = document.getElementById('her-line');
const micBtn = document.getElementById('mic-btn');
const micModeToggle = document.getElementById('mic-mode-toggle');
const statsBtn = document.getElementById('stats-btn');
const statsPanel = document.getElementById('stats-panel');
const statsList = document.getElementById('stats-list');
const statsClose = document.getElementById('stats-close');

export function openConversation(character) {
  panel.classList.add('active');
  nameEl.textContent = character.name;
  transcriptEl.textContent = '';
  herLineEl.textContent = '';
}

export function closeConversation() {
  panel.classList.remove('active');
}

export function setInterestMeter(value) {
  meterFill.style.width = `${Math.max(0, Math.min(100, (value / INTEREST_MAX) * 100))}%`;
}

export function setTranscript(text) {
  transcriptEl.textContent = text;
}

export function setHerLine(text) {
  herLineEl.textContent = text;
}

export function setMicListening(isListening) {
  micBtn.classList.toggle('listening', isListening);
}

export function onMicButton(handler) {
  micBtn.addEventListener('mousedown', () => handler('down'));
  micBtn.addEventListener('mouseup', () => handler('up'));
  micBtn.addEventListener('touchstart', (e) => { e.preventDefault(); handler('down'); });
  micBtn.addEventListener('touchend', (e) => { e.preventDefault(); handler('up'); });
}

let toggleMode = false;
export function onMicModeToggle(handler) {
  micModeToggle.addEventListener('click', () => {
    toggleMode = !toggleMode;
    micModeToggle.textContent = toggleMode ? 'switch to push-to-talk' : 'switch to toggle mode';
    micBtn.textContent = toggleMode ? 'Tap to talk' : 'Hold to talk';
    handler(toggleMode);
  });
}

export function initStatsPanel() {
  statsBtn.addEventListener('click', () => {
    const progress = getAllProgressForStats();
    statsList.innerHTML = '';
    for (const character of rosterFree) {
      const p = progress[character.id] || { interest: 0, kissed: false, rejected: false };
      const row = document.createElement('div');
      row.className = 'stats-row';
      const status = p.kissed ? 'Smitten' : p.rejected ? 'Rejected this session' : `${p.interest}/100`;
      row.innerHTML = `<span>${character.name}</span><span>${status}</span>`;
      statsList.appendChild(row);
    }
    statsPanel.classList.add('active');
  });
  statsClose.addEventListener('click', () => statsPanel.classList.remove('active'));
}
