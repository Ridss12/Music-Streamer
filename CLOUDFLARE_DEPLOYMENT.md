# Cloudflare Pages with services on your PC (Tailscale)

This setup publishes the React frontend on Cloudflare Pages and keeps the API,
MySQL, songs, and Whisper on your PC. Tailscale Funnel provides a public
HTTPS hostname for the web services. MySQL remains local and is never exposed.

## Access model

Both the Pages website and the Funnel hostname are reachable from the public
internet. Anyone with the Funnel URL can reach the app's web services, so keep
authentication enabled, use a strong local `JWT_SECRET_KEY`, and do not expose
MySQL or administrative database ports. The PC must stay powered on, connected
to the internet, and connected to Tailscale. Funnel is subject to Tailscale's
bandwidth limits.

The app's **Add Local Audio** action analyzes selected files in the visitor's
browser and keeps them only for that page session. The frontend does not send
those audio files to the PC. Permanent uploads through `POST /songs/` are
disabled; the server library can still be populated directly on the PC.

## Run the PC services

Start MySQL, the backend on port `8000`, and Whisper on `8001`.
Keep each service bound to `127.0.0.1` where its startup configuration allows.
Do not publish port `3306`.

Install Caddy and use [`deploy/Caddyfile`](deploy/Caddyfile) to route the
browser's HTTPS requests to the local services. It listens only on
`127.0.0.1:8080`, so the individual service ports are not exposed to your LAN.

Install the project config and start Caddy:

```sh
sudo cp deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl enable --now caddy
```

The config routes `/whisper/*` to Whisper and all other paths to the backend.
It also answers CORS private-network preflights from the
Pages production origin, which browsers may send when routing through Funnel.
The equivalent Caddyfile is:

```caddyfile
:8080 {
    bind 127.0.0.1
    @pages_preflight {
        method OPTIONS
        header Origin https://music-streamer.pages.dev
    }
    handle @pages_preflight {
        header Access-Control-Allow-Origin https://music-streamer.pages.dev
        header Access-Control-Allow-Credentials true
        header Access-Control-Allow-Methods "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS"
        header Access-Control-Allow-Headers "Authorization, Content-Type"
        header Access-Control-Allow-Private-Network true
        header Access-Control-Max-Age 600
        respond "" 204
    }
    handle_path /whisper/* { reverse_proxy 127.0.0.1:8001 }
    handle { reverse_proxy 127.0.0.1:8000 }
}
```

After installing and signing into Tailscale on the PC, enable MagicDNS and
HTTPS certificates in the tailnet admin console. An Owner, Admin, or Network
admin must enable Funnel on the tailnet's DNS page. Then expose Caddy publicly
over HTTPS:

```sh
tailscale funnel --bg --https=443 8080
tailscale funnel status
```

Use the HTTPS hostname shown by `tailscale funnel status`, for example
`https://music-pc.example-tailnet.ts.net`. Keep the actual hostname in the
Cloudflare Pages build settings; it is not a secret. Funnel publishes the
service to the internet, even for visitors who do not use Tailscale.

## Start the project on demand

The backend, Whisper, Caddy, MariaDB, and Funnel can be controlled with
`bash music-streamer.sh start`, `bash music-streamer.sh stop`, and
`bash music-streamer.sh status`. The start command installs the systemd unit
files without enabling app services at boot. It also disables boot startup for
Docker, Caddy, and MariaDB; Tailscale itself remains enabled so the PC stays on
your tailnet. Stop the current terminal-launched backend and Whisper processes
before using the script for the first time.

The units use `/home/ved/Projects/Music-Streamer`; edit their paths and `User=`
if the repository lives elsewhere.

## Cloudflare Pages build settings

- Root directory: `frontend-react`
- Build command: `npm run build`
- Build output directory: `dist`

Leo uses explicit commands such as “Hey Leo, play [song title],” “pause song,” “volume up,”
“volume down,” “mute,” “skip song,” and “previous song.” It does not require
Rasa. Do not put database credentials, `JWT_SECRET_KEY`, or any other secret
in a `VITE_*` variable; these values are embedded in the public frontend build.

On Cloudflare Pages, frontend API requests use same-origin Pages Functions:
`/api/backend/*` proxies to the FastAPI backend, and `/api/whisper/transcribe`
proxies voice audio to Whisper. This avoids browsers connecting directly to
the PC's Tailscale IP. Update the upstream host constants in
`frontend-react/functions/api/backend/[[path]].js` and
`frontend-react/functions/api/whisper/transcribe.js` if the Funnel hostname
changes. For local frontend development, the app uses services on
`127.0.0.1` by default.

## Browser origins

Set `CORS_ORIGINS` in the backend and Whisper local environment files to the
exact Cloudflare Pages origin(s) users will visit, comma separated. For example:

```text
CORS_ORIGINS=https://your-site.pages.dev,https://music.example.com
```

## Local data and secrets

Keep MySQL, music files, database credentials, and `JWT_SECRET_KEY` on the PC.
Use `backend/.env.example` as a template for a local `backend/.env` and never
commit the filled-in file. Back up the MySQL data directory and song library.
