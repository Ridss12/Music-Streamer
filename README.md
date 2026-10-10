# 🎵 Music Streaming App

An AI-powered music streaming application with emotion-based recommendations that runs as a **local client-server** — your laptop hosts the music library and your phone/tablet/other devices stream from it over WiFi. No songs are copied to devices.

## 🌟 Features

- **📡 LAN Streaming**: Your laptop is the server; any device on the same WiFi plays songs by streaming them — zero storage needed on the phone
- **Audio Playback**: Full music player with play/pause, next/prev, progress, and volume controls
- **Emotion Analysis**: AI-powered analysis of your songs using librosa for audio feature extraction
- **Mood-Based Recommendations**: Get song suggestions based on your mood (happy, sad, energetic, calm, angry, romantic)
- **Auto-Detection**: The app detects your server automatically; a settings page lets you connect to any IP or scan the network
- **Real-time Import**: Import songs from a folder with automatic analysis
- **Modern UI**: Beautiful purple gradient interface with smooth animations

## 📋 Prerequisites

- **Python 3.10+** — required. ([Windows](https://python.org) · Linux: `sudo apt install python3 python3-venv python3-pip`)
- **Node.js 18+** — *optional*. Only needed to rebuild the web app; the included `frontend-react/dist/` means you usually won't need it. ([nodejs.org](https://nodejs.org))
- **Git** (optional, for cloning)

## 🚀 Quick Start

### Linux / macOS 🐧

```bash
# 1. Setup (installs backend deps into a venv + builds web app if needed)
bash setup.sh

# 2. Add your .mp3 files to backend/songs/

# 3. Start the server — serves web app AND API on one address
bash start-server.sh
```

### Windows 🪟

### 1. Setup

Double-click `setup.bat`. It installs backend + frontend dependencies, builds the web app, and creates the `songs/` folder.

### 2. Add Your Music

Put your `.mp3` files in `backend/songs/`.

Supported formats: `.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`

### 3. Start the Server (everything runs on ONE command)

Double-click **`start-server.bat`**. It serves both the web app **and** the API from a single address:

```
http://localhost:8000       ← on this computer
http://192.168.x.x:8000     ← on your phone / other devices
```

### 4. Play on Your Phone 📱

1. Connect your phone to the **same WiFi** as the server computer
2. Note the IP the server printed (looks like `192.168.1.100:8000`)
3. On your phone's browser, open `http://192.168.1.100:8000`
4. Tap a song — it streams straight from the server

See **[NETWORK_SETUP.md](NETWORK_SETUP.md)** for full phone instructions.

---

## 📖 Manual Setup (Alternative)

```bash
# 1. Install backend dependencies
cd backend
pip install -r requirements.txt

# 2. Install & build frontend
cd ../frontend-react
npm install --include=dev
npm run build

# 3. Start server
cd ../backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

---

## 🔧 Configuration

All configuration is in `backend/app/.env`. Key settings:

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_TYPE` | `sqlite` | Database type (`sqlite` or `mysql`) |
| `DB_PATH` | `./music_streamer.db` | SQLite database file path |
| `AUDIO_STORAGE_PATH` | `./songs` | Folder containing your music |
| `JWT_SECRET_KEY` | `dev-secret-change-in-production` | Secret for authentication |

### For MySQL (Optional)

If you have MySQL installed:

```env
DB_TYPE=mysql
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=music_streamer
```

---

## 📁 Project Structure

```
Music-Streaming-App/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI application
│   │   ├── config.py         # Configuration loader
│   │   ├── database.py       # Database connection
│   │   ├── models/           # SQLAlchemy models
│   │   ├── routes/           # API endpoints
│   │   ├── services/         # Business logic
│   │   │   ├── emotion_analyzer.py    # Librosa audio analysis
│   │   │   ├── recommendation_engine.py # Cosine similarity recommendations
│   │   │   └── emotion_task_queue.py   # Background job queue
│   │   └── schemas/          # Pydantic schemas
│   ├── songs/                # Put your music here!
│   ├── requirements.txt      # Python dependencies
│   └── .env                  # Configuration
├── frontend-react/
│   ├── src/
│   │   ├── pages/Home.jsx            # Main player UI
│   │   ├── pages/ServerConnection.jsx # Connect/scan server page
│   │   ├── ServerContext.jsx         # Shared server URL context
│   │   ├── App.jsx                   # Routes
│   │   └── styles/                   # CSS styles
│   ├── package.json                  # Node dependencies
│   └── vite.config.js                # Vite configuration
├── setup.bat                 # One-click setup (Windows)
├── start-server.bat          # START HERE (Windows) — serves app + API on the network
├── start-backend.bat         # Dev mode: backend only (Windows)
├── start-frontend.bat        # Dev mode: frontend only (Windows)
├── setup.sh                  # Setup (Linux / macOS)
├── start-server.sh           # START HERE (Linux / macOS)
├── NETWORK_SETUP.md          # 📱 How to play on your phone
└── README.md                 # This file
```

---

## 🔌 API Endpoints

### Core Endpoints
- `GET /songs/` - List all songs
- `GET /songs/{id}` - Get song details
- `GET /songs/{id}/stream` - Stream audio file
- `GET /songs/{id}/emotion` - Get emotion analysis

### Import & Analysis
- `POST /import/songs` - Import songs from folder
- `POST /songs/{id}/analyze` - Trigger/redo analysis
- `GET /songs/stats/analysis` - View analysis progress

### Recommendations
- `GET /recommendations/?mood=happy` - Get mood-based recommendations
- `GET /recommendations/moods` - List available moods
- `GET /recommendations/similar/{song_id}` - Get similar songs

---

## 🧠 How It Works

### Emotion Analysis
When you import songs, the app uses **librosa** to extract audio features:
- Tempo, beat density
- Spectral features (centroid, bandwidth, rolloff, contrast)
- MFCCs (Mel-frequency cepstral coefficients)
- Chroma features
- Tonnetz (tonal centroid features)

These features are mapped to 6 emotions using music psychology heuristics.

### Recommendations
The recommendation engine uses **cosine similarity** to find songs matching your desired mood. It compares stored emotion vectors against target mood vectors.

---

## 🐛 Troubleshooting

### "Python not found"
- Install Python 3.10+ from https://python.org
- Make sure to check "Add Python to PATH" during installation (Windows)
- On Linux: `sudo apt install python3 python3-venv python3-pip`

### "Node/npm not found"
- Install Node.js 18+ from https://nodejs.org
- On Linux: `sudo apt install nodejs npm`
- **Not needed if** `frontend-react/dist/index.html` exists (it's included in the zip)

### "No songs found"
1. Make sure you put `.mp3` files in `backend/songs/`
2. Visit http://localhost:8000/import/songs to import them
3. Wait for analysis to complete (check status in the UI)

### "Cannot play audio"
1. Check that the backend is running (http://localhost:8000)
2. Check browser console for errors
3. Try a different audio file format

### Import is slow
- First import analyzes each song (~10-30 seconds per song)
- Subsequent imports skip already-analyzed songs
- Analysis runs in the background while you use the app

---

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, SQLAlchemy, librosa, scikit-learn
- **Frontend**: React 18, Vite, React Router
- **Database**: SQLite (default) or MySQL
- **ML**: librosa for audio features, scikit-learn for similarity

---

## 📄 License

This project is for educational purposes.

---

## 🙏 Acknowledgments

- Built with FastAPI and React
- Emotion analysis powered by librosa
- Recommendations using cosine similarity
