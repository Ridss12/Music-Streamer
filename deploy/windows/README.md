# Deploy Music Streamer on Windows

This setup runs the application on a Windows PC using Ubuntu in WSL 2. The
FastAPI backend serves the built React frontend, MySQL runs in Docker Desktop,
and Whisper runs privately inside WSL. Tailscale Funnel publishes the app over
HTTPS on port 443. The browser uses the same public origin for the backend and
Whisper, so only the backend port is published. Rasa is not used by this
version; voice commands are matched directly after Whisper transcription.

The deployment script creates the Python virtual environments, generates
private database and JWT secrets, starts the database and services, builds the
frontend, and starts Funnel. Windows needs a few one-time setup steps that
cannot be automated safely: WSL's first-run Linux user, Docker Desktop's WSL
integration, and signing in to Tailscale.

## One-time Windows setup

1. Install WSL and Ubuntu 24.04 from an Administrator PowerShell window:

   ```powershell
   wsl --install -d Ubuntu-24.04
   ```

   Restart Windows if requested. Open Ubuntu 24.04 from the Start menu and
   create its Linux username and password. WSL supports accessing Linux web
   services from Windows through `localhost` by default. See [Microsoft's WSL
   install guide](https://learn.microsoft.com/windows/wsl/install) and
   [networking guide](https://learn.microsoft.com/windows/wsl/networking).

2. Install and launch [Docker Desktop](https://www.docker.com/products/docker-desktop/).
   In **Settings → General**, enable **Use the WSL 2 based engine**. Under
   **Settings → Resources → WSL Integration**, enable **Ubuntu-24.04**. Keep
   Docker Desktop running when using Music Streamer.

3. Install [Git for Windows](https://git-scm.com/download/win).

4. Install [Tailscale for Windows](https://tailscale.com/download/windows),
   sign in, and make sure Funnel is enabled for the tailnet. Funnel publishes
   the service to the internet; Tailscale may ask you to enable it in the
   browser or approve it in the tailnet policy. See the [Funnel
   docs](https://tailscale.com/docs/features/tailscale-funnel).

## First deployment

Open Command Prompt or PowerShell and run:

```powershell
git clone --branch deployed https://github.com/Ridss12/Music-Streamer.git C:\Music-Streamer
cd C:\Music-Streamer
deploy\windows\deploy.bat
```

The script then runs the Linux setup inside Ubuntu and:

- installs Git, Python, FFmpeg, Node.js, and npm in WSL;
- clones the current `deployed` branch into `~/music-streamer` in Ubuntu;
- creates `backend/.env` with random database and JWT secrets if it does not
  already exist;
- creates a persistent MySQL Docker volume and a `music-mysql` container bound
  only to localhost;
- creates Python virtual environments and installs backend and Whisper
  dependencies;
- builds the React app into `frontend-react/dist`;
- starts MySQL, the backend, Whisper, and Tailscale Funnel.

Enter your Ubuntu password if `sudo` asks. Whisper downloads its `base` model
on first start; that can take several minutes. The deployment command opens a
separate **Music Streamer Funnel** window. Leave it open while the site is
online. The window prints the public `https://...ts.net` address.

The first deployment creates a fresh account database and an empty server song
folder. Create an account in the app, then upload/import songs. The deployment
script does not overwrite an existing `.env`, database container, or database
volume. Keep `~/music-streamer/backend/.env` private; it contains credentials
and is ignored by Git.

## Start, stop, update, and status

Run these commands from `C:\Music-Streamer` in Command Prompt or PowerShell:

```powershell
deploy\windows\deploy.bat start
deploy\windows\deploy.bat stop
deploy\windows\deploy.bat status
deploy\windows\deploy.bat deploy
```

- `start` starts MySQL, backend, Whisper, and a new Funnel window.
- `stop` turns off Funnel and stops the app and MySQL. The Docker volume keeps
  database records for the next start.
- `status` shows service health and Funnel status.
- `deploy` updates the WSL checkout from `origin/deployed`, installs any new
  dependencies, rebuilds the frontend, and starts the app.

The app does not start automatically when Windows boots. Start Docker Desktop
and Tailscale, then run `deploy.bat start` when you want to use it. If the
Funnel window is closed without running `stop`, run `deploy.bat stop` to clear
the Funnel configuration before the next start.

Logs are in `~/music-streamer/logs/Backend.log` and
`~/music-streamer/logs/Whisper.log` inside Ubuntu. Local health endpoints are
`http://localhost:8000/health` for the backend and `http://localhost:8001/` for
Whisper. The public app, API, and Whisper proxy use the single Funnel origin;
ports 3306 and 8001 are not published through Funnel.

## Moving existing users and songs

The script starts with an empty database and does not copy data from another
PC. To keep existing accounts, playlists, song records, and server-stored audio,
export the old MySQL database and copy the old `backend/songs/` files before
the first backend start on this PC. Keep the SQL dump private; it contains
account data. If the new backend has already started and made empty tables,
stop the stack and replace that empty database before importing the old dump.
