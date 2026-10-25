from fastapi import FastAPI, UploadFile, File
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import whisper
import tempfile
import os

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        origin.strip()
        for origin in os.getenv("CORS_ORIGINS", "*").split(",")
        if origin.strip()
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

model_name = os.getenv("WHISPER_MODEL", "small")
print(f"Loading Whisper {model_name} model...")
model = whisper.load_model(model_name)
print(f"Whisper {model_name} model loaded!")


@app.get("/")
def home():
    return {"status": "Whisper service is running"}


@app.get("/test")
def test_page():
    return FileResponse("test.html")


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = os.path.splitext(file.filename)[1] or ".webm"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp:
        temp.write(await file.read())
        audio_path = temp.name

    try:
        result = model.transcribe(
            audio_path,
            # Whisper detects the spoken language and translates into English
            # so the existing Rasa intent model can understand the command.
            task="translate",
            temperature=0.0,
            # Short rolling microphone chunks often contain silence. Avoid a
            # music-command prompt, which Whisper may echo as a hallucination.
            condition_on_previous_text=False,
            no_speech_threshold=0.6,
            logprob_threshold=-1.0,
            compression_ratio_threshold=2.4,
        )

        segments = result.get("segments", [])
        if segments and all(segment.get("no_speech_prob", 0) >= 0.6 for segment in segments):
            return {"text": "", "language": result.get("language"), "translated": True}

        return {
            "text": result["text"].strip(),
            "language": result.get("language"),
            "translated": True,
        }

    finally:
        os.remove(audio_path)
