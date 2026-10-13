# Cloudflare Pages with services hosted on your PC

The frontend can be built and hosted by Cloudflare Pages while the FastAPI backend,
MySQL, song files, Whisper, and Rasa continue to run on your PC. Configure Cloudflare
Tunnel hostnames for the backend (port 8000), Whisper (port 8001), and Rasa (port
5005). Keep MySQL private; it does not need a public hostname.

## Cloudflare Pages build settings

- Root directory: `frontend-react`
- Build command: `npm run build`
- Build output directory: `dist`

Add these build environment variables in Pages settings. Replace the example URLs
with the HTTPS hostnames assigned in your Cloudflare Tunnel:

```text
VITE_API_BASE_URL=https://api.example.com
VITE_WHISPER_BASE_URL=https://whisper.example.com
VITE_RASA_BASE_URL=https://rasa.example.com
```

The frontend uses localhost service URLs automatically when opened on localhost.
For a hosted HTTPS frontend, configure all three variables; it does not fall back
to the visitor's own localhost.

## Browser CORS origins

Set `CORS_ORIGINS` for the backend and Whisper processes to a comma-separated list
of the exact Cloudflare Pages origins that should be allowed, for example:

```text
CORS_ORIGINS=https://your-site.pages.dev,https://music.example.com
```

For Rasa, pass the same allowed origin(s) to its `--cors` option when starting it.
The Rasa action server is only called by Rasa, so it can remain on the PC without a
public tunnel hostname.

## Local secrets and storage

Keep MySQL credentials, `JWT_SECRET_KEY`, music files, and database storage on the
PC. Do not add secrets to the `VITE_*` variables: values prefixed with `VITE_` are
embedded in the public frontend bundle.
