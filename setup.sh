#!/usr/bin/env bash
# Music Streaming App - Setup (Linux / macOS)
# Creates a Python venv, installs backend dependencies, builds the web app,
# and prepares the songs folder.

cd "$(dirname "$0")"

echo "========================================"
echo "Music Streaming App - Setup"
echo "========================================"
echo ""

# --- 1. Check Python ---
echo "[1/3] Checking Python..."
if ! command -v python3 >/dev/null 2>&1; then
    echo "ERROR: Python 3 not found. Please install Python 3.10+ first:"
    echo "       Ubuntu/Debian:  sudo apt install python3 python3-venv python3-pip"
    echo "       Fedora:         sudo dnf install python3 python3-virtualenv"
    echo "       Arch:           sudo pacman -S python python-virtualenv"
    exit 1
fi
echo "OK: Python found: $(python3 --version)"

# --- 2. Create venv + install backend dependencies ---
echo ""
echo "[2/3] Creating virtual environment and installing backend dependencies..."
cd backend

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
# shellcheck disable=SC1091
source venv/bin/activate
python -m pip install --upgrade pip -q
pip install -r requirements.txt -q
if [ $? -ne 0 ]; then
    echo "ERROR: Failed to install backend dependencies."
    exit 1
fi
echo "OK: Backend dependencies installed"

# --- 3. Build the web app if Node is available ---
echo ""
echo "[3/3] Checking web app..."
cd ..
if [ -f "frontend-react/dist/index.html" ]; then
    echo "OK: Web app already built - no Node needed"
else
    if command -v npm >/dev/null 2>&1; then
        echo "Building web app..."
        cd frontend-react
        npm install --include=dev
        npm run build
        cd ..
        echo "OK: Web app built"
    else
        echo "WARNING: npm not found, but the web app is already included in this project."
        echo "         You can skip frontend steps. Setup is complete for backend-only."
    fi
fi

# --- Prepare songs folder ---
cd backend
if [ ! -d "songs" ]; then
    mkdir songs
    echo "Put your .mp3 files in the songs folder." > songs/README.txt
fi

echo ""
echo "========================================"
echo "Setup Complete!"
echo "========================================"
echo ""
echo "NEXT STEPS:"
echo "1. Add your .mp3 files to:  backend/songs/"
echo "2. Start everything with:   bash start-server.sh"
echo "3. Open http://localhost:8000 in your browser"
echo ""
echo "FOR YOUR PHONE:"
echo "After starting the server, look for the IP it prints,"
echo "then open http://IP:8000 on any device on the same WiFi."
echo ""