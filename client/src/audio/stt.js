import { BACKEND_URL } from '../config.js';

let mediaRecorder = null;
let chunks = [];
let stream = null;

async function ensureMicAccess() {
  if (!stream) {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  }
  return stream;
}

export async function startRecording() {
  await ensureMicAccess();
  chunks = [];
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
  mediaRecorder.start();
}

export function stopRecording() {
  return new Promise((resolve) => {
    if (!mediaRecorder) return resolve(null);
    mediaRecorder.onstop = () => resolve(new Blob(chunks, { type: 'audio/webm' }));
    mediaRecorder.stop();
  });
}

// Primary path: self-hosted Whisper on the Cloud Run GPU backend. Falls back
// to the browser's native SpeechRecognition if the backend call fails (e.g.
// during local dev without the backend running) — see plan: STT.
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
