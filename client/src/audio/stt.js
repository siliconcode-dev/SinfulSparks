import { BACKEND_URL } from '../config.js';

// Tap once to start talking; recording auto-stops once the player has been
// silent for SILENCE_DURATION_MS (same pattern as voice assistants) — no
// holding a button required, on desktop or mobile. A second tap while
// recording force-stops early as a fallback if auto-detection misfires.
const SILENCE_RMS_THRESHOLD = 0.02;
const SILENCE_DURATION_MS = 1300;
const MAX_RECORDING_MS = 20000; // safety cap so a stuck mic doesn't record forever

let stream = null;
let mediaRecorder = null;
let chunks = [];
let pendingForceStop = null;

async function ensureMicAccess() {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  return stream;
}

function stopRecorder() {
  return new Promise((resolve) => {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') return resolve(new Blob(chunks, { type: 'audio/webm' }));
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    mediaRecorder.stop();
  });
}

// Resolves with the recorded Blob once silence is detected (or force-stopped).
// onSpeechDetected fires once real speech is first heard, useful for UI
// feedback distinguishing "listening for you to start" from "heard you."
export async function startAutoStopRecording({ onSpeechDetected } = {}) {
  await ensureMicAccess();
  chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.start();

  const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const source = audioCtx.createMediaStreamSource(stream);
  const analyser = audioCtx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  const dataArray = new Float32Array(analyser.fftSize);

  return new Promise((resolve) => {
    let hasDetectedSpeech = false;
    let silenceStartedAt = null;
    let finished = false;
    const startedAt = performance.now();

    function finish() {
      if (finished) return;
      finished = true;
      pendingForceStop = null;
      audioCtx.close();
      stopRecorder().then(resolve);
    }

    pendingForceStop = finish;

    function tick() {
      if (finished) return;
      analyser.getFloatTimeDomainData(dataArray);
      let sumSquares = 0;
      for (let i = 0; i < dataArray.length; i++) sumSquares += dataArray[i] * dataArray[i];
      const rms = Math.sqrt(sumSquares / dataArray.length);
      const now = performance.now();

      if (rms > SILENCE_RMS_THRESHOLD) {
        if (!hasDetectedSpeech) {
          hasDetectedSpeech = true;
          onSpeechDetected?.();
        }
        silenceStartedAt = null;
      } else if (hasDetectedSpeech) {
        if (silenceStartedAt === null) silenceStartedAt = now;
        if (now - silenceStartedAt > SILENCE_DURATION_MS) {
          finish();
          return;
        }
      }

      if (now - startedAt > MAX_RECORDING_MS) {
        finish();
        return;
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
}

// Fallback: tapping the mic button again while recording calls this to stop
// early, in case silence detection doesn't fire (e.g. persistent background noise).
export function forceStopRecording() {
  pendingForceStop?.();
}

export function isRecording() {
  return pendingForceStop !== null;
}

// Primary path: self-hosted Whisper via the backend's Groq-backed /api/stt.
// Falls back to the browser's native SpeechRecognition if the backend call
// fails (e.g. during local dev without the backend running) — see plan: STT.
async function transcribeViaBackend(blob, authToken) {
  const form = new FormData();
  form.append('audio', blob, 'speech.webm');
  const res = await fetch(`${BACKEND_URL}/api/stt`, {
    method: 'POST',
    headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    body: form,
  });
  if (!res.ok) throw new Error(`stt_failed:${res.status}`);
  const { transcript } = await res.json();
  return transcript;
}

function transcribeViaBrowser() {
  return new Promise((resolve, reject) => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) return reject(new Error('speech_recognition_unsupported'));
    const recognizer = new SpeechRecognition();
    recognizer.lang = 'en-US';
    recognizer.interimResults = false;
    recognizer.maxAlternatives = 1;
    recognizer.onresult = (e) => resolve(e.results[0][0].transcript);
    recognizer.onerror = (e) => reject(e.error);
    recognizer.start();
  });
}

export async function transcribe(blob, authToken) {
  try {
    return await transcribeViaBackend(blob, authToken);
  } catch (err) {
    console.warn('Whisper backend STT failed, falling back to browser STT', err);
    return transcribeViaBrowser();
  }
}
