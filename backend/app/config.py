from dotenv import load_dotenv
import os

load_dotenv()

# Database Configuration
DB_TYPE = os.getenv("DB_TYPE", "sqlite").lower()  # "sqlite" or "mysql"
DB_PATH = os.getenv("DB_PATH", "./music_streamer.db")  # For SQLite

# MySQL Configuration (only used if DB_TYPE=mysql)
DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = os.getenv("DB_PORT", "3306")
DB_USER = os.getenv("DB_USER", "root")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "music_streamer")

# Audio Storage Configuration
AUDIO_STORAGE_PATH = os.getenv("AUDIO_STORAGE_PATH", "./songs")

# JWT Secret for authentication
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-change-in-production")

# Email Configuration
EMAIL_HOST = os.getenv("EMAIL_HOST", "smtp.gmail.com")
EMAIL_PORT = int(os.getenv("EMAIL_PORT", "587"))
EMAIL_USERNAME = os.getenv("EMAIL_USERNAME", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")