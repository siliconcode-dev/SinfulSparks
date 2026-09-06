import { BACKEND_URL } from '../config.js';

// Primary path: self-hosted TTS on the Cloud Run GPU backend, returning a
// distinct voice per character (voiceId). Falls back to the browser's
// SpeechSynthesis if the backend call fails — see plan: TTS.
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

function speakViaBrowser(text, onMouthAmplitude) {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
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

export async function speak(text, voiceId, authToken, onMouthAmplitude) {
  try {
    await speakViaBackend(text, voiceId, authToken, onMouthAmplitude);
  } catch (err) {
    console.warn('Backend TTS failed, falling back to browser SpeechSynthesis', err);
    await speakViaBrowser(text, onMouthAmplitude);
  }
}
