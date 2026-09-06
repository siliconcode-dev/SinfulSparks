import * as THREE from 'three';
import { createScene } from './world/scene.js';
import { createPlayerController } from './world/controller.js';
import { spawnNPCs, updateNPCs, findNearbyNPC, setNPCAction } from './world/npcs.js';
import * as ui from './dialogue/conversationUI.js';
import { getProgress, saveProgress, applyInterestDelta } from './dialogue/conversationState.js';
import { sendMessage } from './dialogue/dialogueEngine.js';
import { startAutoStopRecording, forceStopRecording, isRecording, transcribe } from './audio/stt.js';
import { speak } from './audio/tts.js';
import { playKissSound, playSlapSound } from './audio/sfx.js';
import { BACKEND_URL } from './config.js';

const loadingScreen = document.getElementById('loading-screen');
const loadingStatus = document.getElementById('loading-status');
const fadeOverlay = document.getElementById('fade-overlay');

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

  const { scene, camera, renderer, updateDayNightCycle } = createScene();
  const controller = createPlayerController(camera, renderer.domElement);
  const npcs = await spawnNPCs(scene);
  ui.initStatsPanel();

  loadingScreen.classList.add('hidden');

  let activeNPC = null;
  let inFlight = false;
  let cutscene = null; // see startCutscene() — camera move + fade, blocks player input while active

  async function processRecording(blob) {
    if (!blob || !activeNPC) return;
    inFlight = true;
    try {
      const authToken = null; // wired once Supabase auth is in place (Phase 2)
      const transcript = await transcribe(blob, authToken);
      ui.setTranscript(`You: ${transcript}`);

      const npc = activeNPC;
      const character = npc.character;
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

      setNPCAction(npc, 'Idle_Talking_Loop');
      const { usedFallback } = await speak(result.reply, character.voiceId, authToken);
      setNPCAction(npc, 'Idle_Loop');
      if (usedFallback) {
        ui.setMicStatus('(voice service busy — using a backup voice for this line)');
      }

      if (nextProgress.rejected || result.endConversation) {
        ui.setHerLine(`${character.name} walks off.`);
        startCutscene(npc, 'rejection');
      } else if (nextProgress.kissed) {
        ui.setHerLine(`${character.name} leans in for a kiss.`);
        startCutscene(npc, 'kiss');
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
    if (!activeNPC || inFlight || cutscene) return;
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

  // Simple scripted scene: camera dollies toward the character, plays a
  // sound + (for rejection) a walk-off animation, then fades to black and
  // ends the conversation — not a literal custom kiss/slap animation (none
  // exists in the free asset library), camera + audio work instead (see
  // plan: Phase 1, Cutscenes).
  function startCutscene(npc, kind) {
    const duration = kind === 'kiss' ? 1.6 : 1.3;
    const startPos = camera.position.clone();
    const startQuat = camera.quaternion.clone();

    const toChar = new THREE.Vector3().subVectors(npc.mesh.position, startPos);
    toChar.y = 0;
    toChar.normalize();
    const targetPos = npc.mesh.position.clone().add(toChar.clone().multiplyScalar(-1.1));
    targetPos.y = 1.6;
    const lookTarget = npc.mesh.position.clone();
    lookTarget.y = 1.5;
    const lookMatrix = new THREE.Matrix4().lookAt(targetPos, lookTarget, camera.up);
    const targetQuat = new THREE.Quaternion().setFromRotationMatrix(lookMatrix);

    const walkAway = kind === 'rejection'
      ? npc.mesh.position.clone().add(toChar.clone().multiplyScalar(3))
      : null;
    const walkStart = npc.mesh.position.clone();

    if (kind === 'kiss') {
      playKissSound();
    } else {
      playSlapSound();
      setNPCAction(npc, 'Hit_Head', { loop: THREE.LoopOnce });
      setTimeout(() => setNPCAction(npc, 'Walk_Loop'), 400);
    }

    cutscene = { npc, kind, elapsed: 0, duration, startPos, startQuat, targetPos, targetQuat, walkAway, walkStart, fadeStarted: false };
  }

  function updateCutscene(dt) {
    if (!cutscene) return;
    cutscene.elapsed += dt;
    const t = Math.min(cutscene.elapsed / cutscene.duration, 1);
    const eased = t * t * (3 - 2 * t); // smoothstep

    camera.position.lerpVectors(cutscene.startPos, cutscene.targetPos, eased);
    camera.quaternion.slerpQuaternions(cutscene.startQuat, cutscene.targetQuat, eased);

    if (cutscene.walkAway) {
      cutscene.npc.mesh.position.lerpVectors(cutscene.walkStart, cutscene.walkAway, eased);
    }

    if (t >= 1 && !cutscene.fadeStarted) {
      cutscene.fadeStarted = true;
      fadeOverlay.classList.add('active');
      setTimeout(() => {
        fadeOverlay.classList.remove('active');
        setNPCAction(cutscene.npc, 'Idle_Loop');
        cutscene = null;
        closeConversation();
      }, 900);
    }
  }

  const clock = new THREE.Clock();
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.1);
    updateNPCs(npcs, dt);
    updateDayNightCycle(dt);

    if (cutscene) {
      updateCutscene(dt);
    } else {
      controller.update(dt);
      if (!activeNPC) {
        const nearby = findNearbyNPC(npcs, camera.position);
        if (nearby) openConversationWith(nearby);
      }
    }

    renderer.render(scene, camera);
    requestAnimationFrame(tick);
  }
  tick();
}

main();
