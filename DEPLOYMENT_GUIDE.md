# Deploy Music Streamer on another Windows PC

This guide sets up the project on Windows with Ubuntu in WSL 2. It runs the
FastAPI backend and Whisper in Ubuntu, and MySQL and Rasa in Docker Desktop.
The browser app is built from `frontend-react` and served by the backend.

There are two ways to use it:

- **Same Wi-Fi:** open the host PC's local IP from another device on the same
  network.
- **Over the internet:** install and sign in to Tailscale on the host PC, then
  enable Tailscale Funnel for the backend, Whisper, and Rasa. The host PC must
  stay on and connected.

## 1. Install the tools on the new PC

Install:

1. **Git for Windows**
2. **WSL 2 with Ubuntu 24.04 LTS**
3. **Docker Desktop** with **Use the WSL 2 based engine** enabled and Ubuntu
   enabled under **Settings → Resources → WSL Integration**
4. **Node.js LTS** (only needed to build the frontend)
5. **Tailscale** (only needed for internet access)

Open Ubuntu and install its packages:

```bash
sudo apt update
sudo apt install -y git python3 python3-venv python3-pip ffmpeg
```

Confirm Docker Desktop is running, then in Ubuntu check:

```bash
docker --version
docker run --rm hello-world
```

If Docker is unavailable, return to Docker Desktop, enable Ubuntu WSL
integration, run `wsl --shutdown` in PowerShell, and reopen Ubuntu.

## 2. Get the project

Run these commands in Ubuntu. Replace the branch if the latest project work is
on a different branch. Push any uncommitted changes from the old PC first if
you need those changes on the new PC.

```bash
cd ~
git clone --branch nlp-integration https://github.com/Ridss12/Music-Streamer.git music-streamer
cd ~/music-streamer
```

Keep the checkout under Ubuntu's home directory (`~/music-streamer`), rather
than under `/mnt/c`, for better Linux and Docker file performance.

## 3. Start persistent MySQL

Use a strong password and replace `CHANGE_THIS_PASSWORD` in the command. The
Docker volume keeps the database when the container is stopped or recreated.

```bash
docker volume create music_mysql_data
docker run -d --name music-mysql \
  --restart unless-stopped \
  -e MYSQL_ROOT_PASSWORD='CHANGE_THIS_PASSWORD' \
  -e MYSQL_DATABASE=music_streamer \
  -p 127.0.0.1:3306:3306 \
  -v music_mysql_data:/var/lib/mysql \
  mysql:8.4
```

Wait until MySQL is ready:

```bash
docker logs -f music-mysql
```

When the log says it is ready for connections, press **Ctrl+C**. That stops
following the log; it does not stop MySQL.

Create `backend/.env` in a text editor with:

```env
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=CHANGE_THIS_PASSWORD
DB_NAME=music_streamer
JWT_SECRET_KEY=REPLACE_WITH_A_LONG_RANDOM_SECRET
AUDIO_STORAGE_PATH=./songs
CORS_ORIGINS=*
```

Use the same MySQL password as above and a different long random value for
`JWT_SECRET_KEY`. Keep this file private; do not commit it or put it in the
frontend. The backend creates its tables on first startup.

## 4. Install and start the backend

In one Ubuntu terminal:

```bash
cd ~/music-streamer/backend
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt
mkdir -p songs
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Check it in a browser at `http://localhost:8000/health`. It should show:

```json
{"status":"healthy"}
```

Leave this terminal open while using the app.

## 5. Install and start Whisper

In a second Ubuntu terminal:

```bash
cd ~/music-streamer/whisper-service
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
pip install openai-whisper fastapi uvicorn python-multipart
WHISPER_MODEL=base CORS_ORIGINS='*' uvicorn app:app --host 0.0.0.0 --port 8001
```

The first start downloads the Whisper model and can take a while. `base` is a
reasonable CPU starting point for a laptop; changing it to `small` may improve
recognition at the cost of speed and memory. Leave the terminal open.

## 6. Train Rasa and build its action server

In a third Ubuntu terminal:

```bash
cd ~/music-streamer/rasa-assistant
docker run --rm -it -v "$PWD:/app" -w /app rasa/rasa:3.6.21-full train
docker network create music-rasa
docker build -t music-rasa-actions ./actions
```

Training creates a model under `rasa-assistant/models/`. It does not need to be
committed; train it on each new PC.

## 7. Start the Rasa action server and Rasa

In a fourth Ubuntu terminal, start the action server. Do **not** mount
`rasa-assistant/actions` over `/app`; that hides the image's startup files.

```bash
cd ~/music-streamer/rasa-assistant
docker run --rm -it --name music-actions --network music-rasa \
  music-rasa-actions start --actions actions
```

In a fifth Ubuntu terminal, start Rasa:

```bash
cd ~/music-streamer/rasa-assistant
docker run --rm -it --name music-rasa --network music-rasa \
  -p 5005:5005 -v "$PWD:/app" -w /app \
  rasa/rasa:3.6.21-full run --enable-api --cors "*" \
  --endpoints endpoints.docker.yml --interface 0.0.0.0 --port 5005
```

Leave both terminals open. The Rasa API uses port `5005`; its action server is
reachable from Rasa over the private Docker network.

## 8. Build the frontend for this PC

The checked-in `frontend-react/.env.production` contains the original PC's
Tailscale address. Override it for the new PC before building. Create
`frontend-react/.env.production.local` (this file is ignored by Git).

For use **only on the host PC**, set:

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_WHISPER_BASE_URL=http://127.0.0.1:8001
VITE_RASA_BASE_URL=http://127.0.0.1:5005
```

Then build:

```bash
cd ~/music-streamer/frontend-react
npm install
npm run build
```

The backend serves the built app at `http://localhost:8000`. The user-facing
site and API share port `8000`.

### For phones or other devices on the same Wi-Fi

Find the host PC's Wi-Fi IPv4 address in Windows Settings or by running
`ipconfig` in PowerShell. Replace `192.168.1.50` below with that address in
`frontend-react/.env.production.local`, then rebuild:

```env
VITE_API_BASE_URL=http://192.168.1.50:8000
VITE_WHISPER_BASE_URL=http://192.168.1.50:8001
VITE_RASA_BASE_URL=http://192.168.1.50:5005
```

Allow Ubuntu/Python through Windows Firewall when prompted. On the other
device, open `http://192.168.1.50:8000`. Both devices must be on the same
non-guest Wi-Fi. Voice recognition needs the browser to reach ports `8001` and
`5005` too.

## 9. Optional: make it reachable from the internet with Tailscale Funnel

Install and sign in to Tailscale on the host Windows PC. Enable Funnel for the
tailnet if prompted. Keep the PC, Docker Desktop, and all five service
terminals running. In PowerShell, replace the sample address with this PC's
Tailscale HTTPS name and configure the three forwards:

```powershell
tailscale funnel --https=443 --bg http://127.0.0.1:8000
tailscale funnel --https=8443 --bg http://127.0.0.1:8001
tailscale funnel --https=10000 --bg http://127.0.0.1:5005
tailscale funnel status
```

Build the frontend with `frontend-react/.env.production.local` containing:

```env
VITE_API_BASE_URL=https://NEW-PC-TAILSCALE-NAME.ts.net
VITE_WHISPER_BASE_URL=https://NEW-PC-TAILSCALE-NAME.ts.net:8443
VITE_RASA_BASE_URL=https://NEW-PC-TAILSCALE-NAME.ts.net:10000
```

Replace `NEW-PC-TAILSCALE-NAME.ts.net` with the exact name shown by
`tailscale funnel status`, rebuild the frontend, and restart the backend if it
is already running. Set `CORS_ORIGINS` in the Whisper terminal command to the
frontend origin, for example `https://NEW-PC-TAILSCALE-NAME.ts.net`. Start
Whisper with that same value. The Rasa start command's `--cors` value must also
allow that frontend origin.
Do not forward or publish port `3306` or `5055`.

If the frontend remains hosted on Cloudflare Pages, configure its three
`VITE_*_BASE_URL` build variables there instead, rebuild/redeploy Pages, and
allow the exact `https://...pages.dev` origin in backend, Whisper, and Rasa CORS
settings.

## 10. Add music and import it

Copy supported audio files (`.mp3`, `.wav`, `.flac`, `.m4a`, `.ogg`) into
`backend/songs/`. In the app, use its import songs function. The backend stores
the song files locally and creates their database records and analysis jobs.

## Moving the existing account and songs from the old PC

Do this if you need the existing user account, playlists, song records, or
uploaded tracks. Stop the backend on the old PC first. On the new PC, import
the SQL dump **after Step 3 (MySQL is running) and before Step 4 (the backend
has created empty tables)**.

1. Copy every track in the old `backend/songs/` folder to the new
   `backend/songs/` folder.
2. Export the old `music_streamer` MySQL database. In PowerShell, while the old
   MySQL container is running, use:

   ```powershell
   docker exec music-mysql sh -c 'exec mysqldump -uroot -p"$MYSQL_ROOT_PASSWORD" --databases music_streamer' > music_streamer.sql
   ```

3. Transfer `music_streamer.sql` privately to the new PC. Do not put it in a
   public repository; it contains account data.
4. On the new PC, after starting its MySQL container, copy and import the dump
   from PowerShell:

   ```powershell
   docker cp .\music_streamer.sql music-mysql:/tmp/music_streamer.sql
   docker exec music-mysql sh -c 'exec mysql -uroot -p"$MYSQL_ROOT_PASSWORD" < /tmp/music_streamer.sql'
   ```

5. Keep the song filenames unchanged. The backend can resolve stored file
   records by filename if the old PC's original file paths differ.

Keep the SQL export private and delete temporary copies once you have verified
the new installation. Keep a separate backup of the old PC until the new app
has been checked.

## Normal startup the next time

Start Docker Desktop, open Ubuntu, and run:

```bash
docker start music-mysql
```

Then reopen the backend, Whisper, Rasa action server, and Rasa commands from
their sections above. If using Funnel, confirm Tailscale is signed in and
running in Windows and check `tailscale funnel status`. The training step is
not needed again unless the Rasa training data or configuration changes.

## Quick checks

- Backend: `http://localhost:8000/health` returns `{"status":"healthy"}`.
- Whisper: `http://localhost:8001/` says the service is running.
- Rasa: `http://localhost:5005/status` responds with model status.
- Database: `docker ps` shows `music-mysql` as running.
- Funnel: `tailscale funnel status` shows ports `443`, `8443`, and `10000`.

For a private single-PC setup, SQLite can be used instead of MySQL by setting
`DB_TYPE=sqlite` in `backend/.env`; back up `backend/music_streamer.db` along
with `backend/songs/` to preserve user and song data.
