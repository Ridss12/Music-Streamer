# 📡 Play Music on Your Phone Over WiFi

This app works as a **client-server music player**:

- **Your laptop** = the server (holds all the songs, does the AI analysis)
- **Your phone / tablet / other devices** = thin clients (stream & play, store nothing)

Songs are **not** copied to your phone. They stream live from your laptop over WiFi.

---

## 🎧 Setup On Your Server Computer (one time)

1. Put your `.mp3` files in `backend/songs/`
2. Install the app:

| Platform | One-time setup | Start the server |
|----------|----------------|------------------|
| **Windows** | Double-click `setup.bat` | Double-click `start-server.bat` |
| **Linux / macOS** | `bash setup.sh` | `bash start-server.sh` |

The console will print your computer's network address, e.g.:

```
🎵 Music Server running at: http://192.168.1.100:8000
```

---

## 📱 On Your Phone

1. Connect your phone to the **same WiFi network** as your laptop
2. Open the browser (Chrome / Safari / any)
3. Type `http://192.168.1.100:8000` (use the IP your laptop printed)
4. Tap a song — it streams straight from your laptop 🎵

No app install needed. Works on iPhone and Android.

---

## 🔍 Can't find the IP?

- The IP is printed when you run `start-server.bat` / `start-server.sh` (look for `192.168.x.x`)
- Or on the computer: open *Settings → Network* to see your IP
- Or use the **Scan Network** button inside the app's *Server Connection* page
- Android phone tip: use `192.168.1.100:8000` (omit `http://` works in most browsers)

---

## ❓ Troubleshooting

| Problem | Fix |
|---------|-----|
| Phone can't load the site | Both devices must be on the SAME WiFi |
| Page loads but no songs | Songs must be imported first — see README "Import songs" |
| "Cannot play audio" | Check the song streams on your laptop first |
| WiFi uses a Guest/Isolated network | Guest networks often block device-to-device — use your normal WiFi |
| Firewall blocks the server | Windows: allow Python through the firewall when prompted · Linux: `sudo ufw allow 8000/tcp` (or whatever firewall you use) |

---

## 🔧 Development Mode (optional)

You can still run the frontend separately during development:

```
start-backend.bat   →  API on    :8000     (Linux: cd backend && python -m uvicorn app.main:app --reload --port 8000)
start-frontend.bat  →  Dev UI on :5173     (Linux: cd frontend-react && npm run dev)
```

Then open `http://localhost:5173`. The web app **auto-detects** the server address,
so it also works from your phone at `http://<laptop-ip>:5173`.