import * as THREE from 'three';
import { createScene } from './world/scene.js';
import { createPlayerController } from './world/controller.js';
import { spawnNPCs, findNearbyNPC } from './world/npcs.js';
import * as ui from './dialogue/conversationUI.js';
import { getProgress, saveProgress, applyInterestDelta } from './dialogue/conversationState.js';
import { sendMessage } from './dialogue/dialogueEngine.js';
import { startRecording, stopRecording, transcribe } from './audio/stt.js';
import { speak } from './audio/tts.js';
import { BACKEND_URL, KISS_THRESHOLD, REJECTION_THRESHOLD } from './config.js';

const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');

async function waitForBackend() {
  // Cold-start UX: Cloud Run + GPU can take 30-90s to warm up from zero
  // instances (see plan: Cold start UX). Poll a lightweight health endpoint
  // until it responds, rather than failing the first real request.
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
      : 'Waking up the GPU backend (this can take up to a minute)…';
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
  let micToggleMode = false;
  let isRecording = false;
  let inFlight = false;

  ui.onMicModeToggle((toggleMode) => { micToggleMode = toggleMode; });

  async function handleMicUp() {
    if (!activeNPC || inFlight) return;
    isRecording = false;
    ui.setMicListening(false);
    const blob = await stopRecording();
    if (!blob) return;

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

  ui.onMicButton(async (action) => {
    if (!activeNPC || inFlight) return;
    if (micToggleMode) {
      if (action !== 'down') return;
      if (!isRecording) {
        isRecording = true;
        ui.setMicListening(true);
        await startRecording();
      } else {
        await handleMicUp();
      }
      return;
    }
    if (action === 'down' && !isRecording) {
      isRecording = true;
      ui.setMicListening(true);
      await startRecording();
    } else if (action === 'up' && isRecording) {
      await handleMicUp();
    }
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
