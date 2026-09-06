import os

from dotenv import load_dotenv

load_dotenv()  # must run before the app./stt/tts/auth modules read env vars at import time

from fastapi import FastAPI, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from pydantic import BaseModel

from . import llm, moderation, stt, tts
from .auth import get_user_id
from .characters import CHARACTERS
from .rate_limit import check_rate_limit

app = FastAPI(title="dating-sim-backend")

# Locked to the production Vercel domain (see plan: CORS policy). Set
# ALLOWED_ORIGIN in the Cloud Run service's env vars; falls back to permissive
# for local dev only.
ALLOWED_ORIGIN = os.environ.get("ALLOWED_ORIGIN", "*")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health():
    return {"status": "ok"}


class ConversationTurn(BaseModel):
    role: str
    text: str


class DialogueRequest(BaseModel):
    characterId: str
    message: str
    history: list[ConversationTurn] = []


@app.post("/api/dialogue")
def dialogue(req: DialogueRequest, request: Request):
    user_id = get_user_id(request)
    identity = user_id or request.client.host
    check_rate_limit(identity)

    if req.characterId not in CHARACTERS:
        raise HTTPException(status_code=404, detail="unknown_character")

    input_check = moderation.check_player_input(req.message)
    if input_check["flagged"]:
        return {
            "reply": moderation.rebuff_line(hash(req.message) % 3),
            "interestDelta": -8,
            "endConversation": False,
            "rebuffed": True,
        }

    history = [turn.model_dump() for turn in req.history]
    result = llm.generate_reply(req.characterId, history, req.message)

    output_check = moderation.check_model_output(result["reply"])
    if output_check["flagged"]:
        # Block-and-regenerate once; if still flagged, fall back to an
        # in-character deflection rather than ever surfacing raw flagged
        # text (see plan: Content Safety — violation handling).
        result = llm.generate_reply(req.characterId, history, req.message)
        if moderation.check_model_output(result["reply"])["flagged"]:
            result["reply"] = "Let's talk about something else."

    return result


@app.post("/api/stt")
async def speech_to_text(request: Request, audio: UploadFile):
    user_id = get_user_id(request)
    identity = user_id or request.client.host
    check_rate_limit(identity)

    audio_bytes = await audio.read()
    transcript = stt.transcribe(audio_bytes)
    return {"transcript": transcript}


class TTSRequest(BaseModel):
    text: str
    voiceId: str


@app.post("/api/tts")
def text_to_speech(req: TTSRequest, request: Request):
    user_id = get_user_id(request)
    identity = user_id or request.client.host
    check_rate_limit(identity)

    audio_bytes = tts.synthesize(req.text, req.voiceId)
    return Response(content=audio_bytes, media_type="audio/wav")
