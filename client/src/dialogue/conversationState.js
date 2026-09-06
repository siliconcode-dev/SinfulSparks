import { INTEREST_MAX, INTEREST_MIN, REJECTION_THRESHOLD, KISS_THRESHOLD } from '../config.js';

const STORAGE_KEY = 'dating-sim-progress-v1';

// MVP persistence: localStorage keyed by character id. Phase 1 step 3 wires
// this to Supabase (character_progress table) for signed-in users and the
// 12h-nudge / 48h-delete anonymous retention policy from the plan; this
// module's shape (get/set interest, history) stays the same either way.
function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch {
    return {};
  }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getProgress(characterId) {
  const all = loadAll();
  return all[characterId] || { interest: 40, history: [], rejected: false, kissed: false };
}

export function saveProgress(characterId, progress) {
  const all = loadAll();
  all[characterId] = progress;
  saveAll(all);
}

export function applyInterestDelta(progress, delta) {
  const next = { ...progress };
  next.interest = Math.max(INTEREST_MIN, Math.min(INTEREST_MAX, progress.interest + delta));
  if (next.interest <= REJECTION_THRESHOLD) next.rejected = true;
  if (next.interest >= KISS_THRESHOLD) next.kissed = true;
  return next;
}

export function getAllProgressForStats() {
  return loadAll();
}
