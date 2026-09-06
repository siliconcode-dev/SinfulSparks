import { INTEREST_MAX } from '../config.js';
import { getAllProgressForStats } from './conversationState.js';
import rosterFree from '../characters/roster.free.json';

const panel = document.getElementById('conversation-ui');
const nameEl = document.getElementById('char-name');
const meterFill = document.getElementById('interest-meter-fill');
const transcriptEl = document.getElementById('transcript-line');
const herLineEl = document.getElementById('her-line');
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');
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
  micBtn.textContent = isListening ? 'Tap to stop' : 'Tap to talk';
}

export function setMicStatus(text) {
  micStatus.textContent = text;
}

// Tap-to-start, auto-stop-on-silence (see audio/stt.js) — one tap begins
// recording, a second tap while recording force-stops early as a fallback.
// No press-and-hold on desktop or mobile.
export function onMicTap(handler) {
  micBtn.addEventListener('click', handler);
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
