import * as THREE from 'three';
import { createScene } from './world/scene.js';
import { createPlayerController } from './world/controller.js';
import { spawnNPCs, findNearbyNPC } from './world/npcs.js';
import * as ui from './dialogue/conversationUI.js';
import { getProgress, saveProgress, applyInterestDelta } from './dialogue/conversationState.js';
import { sendMessage } from './dialogue/dialogueEngine.js';
import { startAutoStopRecording, forceStopRecording, isRecording, transcribe } from './audio/stt.js';
import { speak } from './audio/tts.js';
import { BACKEND_URL, KISS_THRESHOLD, REJECTION_THRESHOLD } from './config.js';

const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');

async function waitForBackend() {
  // Cold-start UX: Cloud Run can take a little while to warm up from zero
  // instances. Poll a lightweight health endpoint until it responds, rather
  // than failing the first real request.
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BACKEND_URL}/api/health`, { signal: AbortSignal.timeout(4000) });
      if (res.ok) return true;
    } catch {
      // ignore, retry
    }
    loadingStatus.textContent = attempt < 3
      ? 'Connecting to backend'
      : 'Waking up the backend (this can take a little while on a cold start)…';
    await new Promise((r) => setTimeout(r, 2000));
  }
  loadingStatus.textContent = 'Backend unreachable — starting in offline/fallback mode.';
  return false;
}

async function main() {
  await waitForBackend();
  loadingScreen.classList.add('hidden');

  const { scene, camera, renderer, updateDayNightCycle } = createScene();
  const controller = createPlayerController(camera, renderer.domElement);
  const npcs = spawnNPCs(scene);
  ui.initStatsPanel();

  let activeNPC = null;
  let inFlight = false;

  async function processRecording(blob) {
    if (!blob || !activeNPC) return;
    inFlight = true;
    try {
      const authToken = null; // wired once Supabase auth is in place (Phase 1 step 3)
      const transcript = await transcribe(blob, authToken);
      ui.setTranscript(`You: ${transcript}`);

      const character = activeNPC.character;
      const progress = getProgress(character.id);
      const history = progress.history.slice(-10);

      const result = await sendMessage({
        characterId: character.id,
        message: transcript,
        history,
        authToken,
      });

      const nextProgress = applyInterestDelta(progress, result.interestDelta ?? 0);
      nextProgress.history = [...history, { role: 'player', text: transcript }, { role: character.id, text: result.reply }];
      saveProgress(character.id, nextProgress);
      ui.setInterestMeter(nextProgress.interest);
      ui.setHerLine(result.reply);

      await speak(result.reply, character.voiceId, authToken, (amp) => {
        activeNPC.mesh.children[1].scale.setScalar(1 + amp * 0.15); // crude jaw-movement stand-in
      });

      if (nextProgress.rejected || result.endConversation) {
        ui.setHerLine(`${character.name} walks off.`);
        setTimeout(() => closeConversation(), 1800);
      } else if (nextProgress.kissed) {
        ui.setHerLine(`${character.name} leans in for a kiss.`);
        // Phase 1 step 8: replace with the real scripted kiss cutscene
        // (camera cut + animation + fade + kiss sound), not generated content.
        setTimeout(() => closeConversation(), 2500);
      }
    } catch (err) {
      if (err.message === 'rate_limited') {
        ui.setHerLine('(connection is busy — try again in a moment)');
      } else {
        console.error(err);
        ui.setHerLine('(something went wrong hearing that)');
      }
    } finally {
      inFlight = false;
    }
  }

  ui.onMicTap(async () => {
    if (!activeNPC || inFlight) return;
    if (isRecording()) {
      // Fallback: a second tap force-stops early if silence detection
      // doesn't fire (e.g. persistent background noise).
      forceStopRecording();
      return;
    }
    ui.setMicListening(true);
    ui.setMicStatus('Listening for you to start talking…');
    const blob = await startAutoStopRecording({
      onSpeechDetected: () => ui.setMicStatus('Listening…'),
    });
    ui.setMicListening(false);
    ui.setMicStatus('');
    await processRecording(blob);
  });

  function openConversationWith(npc) {
    activeNPC = npc;
    const progress = getProgress(npc.character.id);
    ui.openConversation(npc.character);
    ui.setInterestMeter(progress.interest);
  }

  function closeConversation() {
    activeNPC = null;
    ui.closeConversation();
  }

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.1);
    controller.update(dt);
    updateDayNightCycle(dt);

    if (!activeNPC) {
      const nearby = findNearbyNPC(npcs, camera.position);
      if (nearby) openConversationWith(nearby);
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

main();
