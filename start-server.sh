#!/usr/bin/env bash
# Music Streaming Server - Live on Network (Linux / macOS)
# Serves the web app AND the API on port 8000 for all devices on your WiFi.

cd "$(dirname "$0")"

echo "========================================"
echo "Music Streaming Server - Live on Network"
echo "========================================"
echo ""

# --- 1. Build the web app if it hasn't been built yet ---
if [ -f "frontend-react/dist/index.html" ]; then
    echo "[1/2] Web app already built."
else
    echo "[1/2] Building web app - first run only..."
    cd frontend-react
    if ! command -v npm >/dev/null 2>&1; then
        echo ""
        echo "ERROR: npm not found, but the web app is included in this project."
        echo "       You can skip this step - run setup.sh to install frontend tools."
        exit 1
    fi
    npm install --include=dev
    npm run build
    cd ..
    echo "Web app built successfully."
fi

# --- 2. Start the server ---
echo "[2/2] Starting server..."
echo ""
echo "IMPORTANT: The IP below is what you type on your PHONE."
echo "Make sure your phone is on the SAME WiFi network."
echo ""

cd backend

# Use the venv created by setup.sh if present, otherwise plain python
if [ -f "venv/bin/activate" ]; then
    source venv/bin/activate
fi

python -m uvicorn app.main:app --host 0.0.0.0 --port 8000

echo ""
echo "========================================"
echo "Server stopped."
echo "========================================"