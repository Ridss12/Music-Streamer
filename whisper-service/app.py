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

print("Loading Whisper model...")
model = whisper.load_model("base")
print("Whisper model loaded!")


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
            initial_prompt=(
                "Music player commands: play, pause, resume, stop, next, "
                "previous, volume, mute, shuffle, repeat, and playlists. "
                "Preserve song titles and artist names."
            ),
        )

        return {
            "text": result["text"].strip(),
            "language": result.get("language"),
            "translated": True,
        }

    finally:
        os.remove(audio_path)
