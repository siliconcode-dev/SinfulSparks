import { BACKEND_URL } from '../config.js';

// Primary path: the backend's Groq-hosted TTS, returning a distinct voice
// per character (voiceId). Falls back to the browser's SpeechSynthesis if
// the backend call fails — see plan: TTS.
async function speakViaBackend(text, voiceId, authToken, onMouthAmplitude) {
  const res = await fetch(`${BACKEND_URL}/api/tts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify({ text, voiceId }),
  });
  if (!res.ok) throw new Error(`tts_failed:${res.status}`);

  const audioBuffer = await res.arrayBuffer();
  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const decoded = await audioCtx.decodeAudioData(audioBuffer);

  const source = audioCtx.createBufferSource();
  source.buffer = decoded;

  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 256;
  const dataArray = new Uint8Array(analyser.frequencyBinCount);

  source.connect(analyser);
  analyser.connect(audioCtx.destination);
  source.start();

  return new Promise((resolve) => {
    function tick() {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      onMouthAmplitude?.(avg / 255);
      if (audioCtx.currentTime < decoded.duration) {
        requestAnimationFrame(tick);
      } else {
        onMouthAmplitude?.(0);
        resolve();
      }
    }
    tick();
  });
}

// Voices load asynchronously in some browsers — getVoices() can return an
// empty list on the very first call until 'voiceschanged' fires.
function getVoicesAsync() {
  return new Promise((resolve) => {
    const voices = speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    speechSynthesis.onvoiceschanged = () => resolve(speechSynthesis.getVoices());
  });
}

// All characters are female — the OS/browser default voice is frequently
// male (e.g. Windows' default is often "David"), and this fallback firing
// silently swaps a character's voice with no indication to the player. Web
// Speech API has no formal gender field, so this is a best-effort name
// match against common female voice names across platforms.
const FEMALE_VOICE_HINT = /female|zira|samantha|susan|karen|victoria|moira|tessa|fiona|salli|joanna|kimberly|ivy|aria|jenny/i;

async function speakViaBrowser(text, onMouthAmplitude) {
  const voices = await getVoicesAsync();
  const femaleVoice = voices.find((v) => FEMALE_VOICE_HINT.test(v.name));

  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    if (femaleVoice) utterance.voice = femaleVoice;
    // Crude amplitude approximation for lip-sync fallback: pulse while speaking.
    const pulse = setInterval(() => onMouthAmplitude?.(Math.random() * 0.6 + 0.2), 90);
    utterance.onend = () => {
      clearInterval(pulse);
      onMouthAmplitude?.(0);
      resolve();
    };
    speechSynthesis.speak(utterance);
  });
}

// Returns { usedFallback } so callers can surface it — this failing over is
// silent by default, and a character's voice suddenly changing with no
// explanation is confusing (see plan: Fixes Found in Live Testing).
export async function speak(text, voiceId, authToken, onMouthAmplitude) {
  try {
    await speakViaBackend(text, voiceId, authToken, onMouthAmplitude);
    return { usedFallback: false };
  } catch (err) {
    console.warn('Backend TTS failed, falling back to browser SpeechSynthesis', err);
    await speakViaBrowser(text, onMouthAmplitude);
    return { usedFallback: true };
  }
}
