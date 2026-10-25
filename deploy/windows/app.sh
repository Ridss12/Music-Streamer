#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="$HOME/music-streamer"
RUN_DIR="$APP_DIR/.run"
LOG_DIR="$APP_DIR/logs"
mkdir -p "$RUN_DIR" "$LOG_DIR"

read_env() {
  sed -n "s/^$1=//p" "$APP_DIR/backend/.env" | head -n 1
}

stop_pidfile() {
  local name="$1"
  local match="$2"
  local pid_file="$RUN_DIR/$name.pid"
  [[ -f "$pid_file" ]] || return 0
  local pid
  pid="$(cat "$pid_file")"
  if [[ "$pid" =~ ^[0-9]+$ ]] && kill -0 "$pid" 2>/dev/null; then
    if ps -p "$pid" -o args= | grep -Fq "$match"; then
      kill "$pid" 2>/dev/null || true
      for _ in $(seq 1 20); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 1
      done
      kill -0 "$pid" 2>/dev/null && kill -9 "$pid" 2>/dev/null || true
    fi
  fi
  rm -f "$pid_file"
}

wait_for_url() {
  local url="$1"
  local attempts="$2"
  local label="$3"
  for _ in $(seq 1 "$attempts"); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      echo "$label is ready."
      return 0
    fi
    sleep 2
  done
  echo "$label did not become ready. Recent log output:" >&2
  tail -n 60 "$LOG_DIR/$label.log" >&2 || true
  return 1
}

case "${1:-status}" in
  start)
    [[ -x "$APP_DIR/backend/.venv/bin/python" ]] || { echo "Run deploy.bat first to install the app." >&2; exit 1; }
    [[ -x "$APP_DIR/whisper-service/.venv/bin/python" ]] || { echo "Run deploy.bat first to install the app." >&2; exit 1; }
    [[ -f "$APP_DIR/frontend-react/dist/index.html" ]] || { echo "Frontend build missing; run deploy.bat first." >&2; exit 1; }
    docker start music-mysql >/dev/null 2>&1 || { echo "Start Docker Desktop, then run deploy.bat start again." >&2; exit 1; }

    DB_USER="$(read_env DB_USER)"
    DB_PASSWORD="$(read_env DB_PASSWORD)"
    echo "Waiting for MySQL..."
    mysql_ready=0
    for _ in $(seq 1 120); do
      if docker exec music-mysql mysqladmin ping -h 127.0.0.1 -u"$DB_USER" -p"$DB_PASSWORD" --silent >/dev/null 2>&1; then
        mysql_ready=1
        break
      fi
      sleep 2
    done
    if [[ "$mysql_ready" != 1 ]]; then
      echo "MySQL did not become ready. Check Docker Desktop and the music-mysql container." >&2
      exit 1
    fi

    if ! curl -fsS http://127.0.0.1:8001/ >/dev/null 2>&1; then
      stop_pidfile whisper 'uvicorn app:app'
      cd "$APP_DIR/whisper-service"
      nohup .venv/bin/python -m uvicorn app:app --host 127.0.0.1 --port 8001 > "$LOG_DIR/Whisper.log" 2>&1 < /dev/null &
      echo "$!" > "$RUN_DIR/whisper.pid"
    fi
    if ! curl -fsS http://127.0.0.1:8000/health >/dev/null 2>&1; then
      stop_pidfile backend 'uvicorn app.main:app'
      cd "$APP_DIR/backend"
      nohup .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > "$LOG_DIR/Backend.log" 2>&1 < /dev/null &
      echo "$!" > "$RUN_DIR/backend.pid"
    fi

    wait_for_url http://127.0.0.1:8000/health 60 Backend
    echo "Waiting for Whisper to load its base model on first start..."
    wait_for_url http://127.0.0.1:8001/ 300 Whisper
    echo "Music Streamer is running locally at http://localhost:8000"
    ;;
  stop)
    stop_pidfile backend 'uvicorn app.main:app'
    stop_pidfile whisper 'uvicorn app:app'
    docker stop music-mysql >/dev/null 2>&1 || true
    echo "Music Streamer stopped. MySQL data remains in the music_mysql_data Docker volume."
    ;;
  status)
    echo "MySQL container:"
    docker ps -a --filter name=music-mysql --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || true
    echo "Backend health:"
    curl -sS --max-time 3 http://127.0.0.1:8000/health || echo "not running"
    echo
    echo "Whisper health:"
    curl -sS --max-time 3 http://127.0.0.1:8001/ || echo "not running"
    echo
    echo "Logs: $LOG_DIR/Backend.log and $LOG_DIR/Whisper.log"
    ;;
  *)
    echo "Usage: app.sh {start|stop|status}" >&2
    exit 2
    ;;
esac
