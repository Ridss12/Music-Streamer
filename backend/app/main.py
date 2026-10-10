from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, HTMLResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.routing import Mount
from contextlib import asynccontextmanager
import logging
import socket
import os

from app.database import Base, engine
from app.models.user import User
from app.models.song import Song
from app.models.refresh_token import RefreshToken
from app.models.password_reset_token import PasswordResetToken
from app.models.email_verification_token import EmailVerificationToken
from app.models.song_emotion import SongEmotion
from app.models.analysis_job import AnalysisJob
from app.models.userpreference import UserPreference

from app.routes import setting as setting_router
from app.routes import auth
from app.routes import songs
from app.routes import recommendations
from app.routes import admin
from app.routes import import_songs

from app.services.emotion_task_queue import task_queue


# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_local_ip():
    """Get the local network IP address"""
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "127.0.0.1"


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown"""

    # Startup
    local_ip = get_local_ip()

    logger.info("Starting Music Streamer Backend...")
    logger.info(f"🎵 Music Server running at: http://{local_ip}:8000")
    logger.info(
        f"📱 Other devices on your network can connect to: "
        f"http://{local_ip}:8000"
    )

    # Create all tables
    Base.metadata.create_all(bind=engine)
    logger.info("Database tables created/verified")

    # Start background workers for emotion analysis
    await task_queue.start(worker_count=2)
    logger.info("Emotion analysis workers started")

    yield

    # Shutdown
    logger.info("Shutting down Music Streamer Backend...")
    await task_queue.stop()
    logger.info("Workers stopped")


app = FastAPI(
    title="Music Streamer API",
    version="1.0.0",
    lifespan=lifespan
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Include routers
app.include_router(setting_router.router)
app.include_router(auth.router)
app.include_router(songs.router)
app.include_router(recommendations.router)
app.include_router(admin.router)
app.include_router(import_songs.router)


@app.get("/")
def home():
    # If the React build exists, serve the app so phones hitting the root
    # URL get the music player instead of a JSON message.
    index_path = os.path.join(FRONTEND_BUILD_DIR, "index.html")

    if os.path.isfile(index_path):
        return FileResponse(index_path)

    return {
        "message": "Welcome to Music Streamer Backend!",
        "version": "1.0.0",
        "docs": "/docs"
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}


@app.get("/api/server-info")
def server_info():
    """Return server information for clients"""

    local_ip = get_local_ip()

    return {
        "ip": local_ip,
        "port": 8000,
        "api_url": f"http://{local_ip}:8000",
        "version": "1.0.0"
    }


# --- Serve the built React frontend ---

FRONTEND_BUILD_DIR = os.path.join(
    os.path.dirname(__file__),
    "..",
    "..",
    "frontend-react",
    "dist"
)

FRONTEND_BUILD_DIR = os.path.abspath(FRONTEND_BUILD_DIR)


if os.path.isdir(FRONTEND_BUILD_DIR):

    # Serve static assets
    app.mount(
        "/assets",
        StaticFiles(
            directory=os.path.join(
                FRONTEND_BUILD_DIR,
                "assets"
            )
        ),
        name="static-assets"
    )

    app.mount(
        "/thumbnails",
        StaticFiles(
            directory=os.path.join(
                os.path.dirname(__file__),
                "..",
                "thumbnails"
            )
        ),
        name="thumbnails"
    )

    # SPA catch-all
    async def serve_spa(request: Request):
        """Serve React SPA — any non-API route returns index.html"""

        path = request.url.path.lstrip("/")

        file_path = os.path.join(
            FRONTEND_BUILD_DIR,
            path
        )

        if path and os.path.isfile(file_path):
            return FileResponse(file_path)

        return FileResponse(
            os.path.join(
                FRONTEND_BUILD_DIR,
                "index.html"
            )
        )

    from starlette.routing import Route

    app.routes.append(
        Route(
            "/{full_path:path}",
            endpoint=serve_spa,
            methods=["GET"]
        )
    )

    logger.info(
        f"Frontend build served from: {FRONTEND_BUILD_DIR}"
    )

    logger.info(
        "📱 Full app available at: http://<your-ip>:8000/"
    )

else:
    logger.info(
        "No frontend build found — run 'npm run build' "
        "in frontend-react/ to enable"
    )