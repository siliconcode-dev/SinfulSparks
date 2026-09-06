// Short cutscene sound effects, synthesized via Web Audio API rather than
// sourced as external files — no licensing/attribution question for a
// couple of simple procedural blips, and no extra asset to fetch.

let sharedCtx = null;
function ctx() {
  if (!sharedCtx) sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  return sharedCtx;
}

// A soft, quick "smooch" pop: a short pitched blip with a fast pitch drop.
export function playKissSound() {
  const audioCtx = ctx();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  const now = audioCtx.currentTime;
  osc.frequency.setValueAtTime(700, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.18);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.5, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(now);
  osc.stop(now + 0.25);
}

// A sharp noise-burst "slap": filtered white noise with a fast decay.
export function playSlapSound() {
  const audioCtx = ctx();
  const now = audioCtx.currentTime;
  const bufferSize = Math.floor(audioCtx.sampleRate * 0.15);
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;

  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = 1800;
  filter.Q.value = 0.7;

  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.8, now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

  noise.connect(filter).connect(gain).connect(audioCtx.destination);
  noise.start(now);
}
