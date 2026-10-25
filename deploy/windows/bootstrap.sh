#!/usr/bin/env bash
set -Eeuo pipefail

REPO_URL="https://github.com/Ridss12/Music-Streamer.git"
BRANCH="deployed"
APP_DIR="$HOME/music-streamer"

echo "Installing Linux packages needed by Music Streamer..."
sudo apt-get update
sudo apt-get install -y git python3 python3-venv python3-pip python3-dev ffmpeg curl nodejs npm

if [[ -d "$APP_DIR/.git" ]]; then
  if [[ "$(git -C "$APP_DIR" branch --show-current)" != "$BRANCH" ]]; then
    echo "Refusing to switch the existing checkout at $APP_DIR. Expected branch '$BRANCH'." >&2
    exit 1
  fi
  if [[ -n "$(git -C "$APP_DIR" status --porcelain --untracked-files=no)" ]]; then
    echo "Tracked changes exist in $APP_DIR. Commit or save them before rerunning deployment." >&2
    exit 1
  fi
  git -C "$APP_DIR" pull --ff-only origin "$BRANCH"
else
  git clone --branch "$BRANCH" --single-branch "$REPO_URL" "$APP_DIR"
fi

command -v docker >/dev/null 2>&1 || {
  echo "Docker is unavailable in Ubuntu. Start Docker Desktop and enable Ubuntu under Settings > Resources > WSL Integration." >&2
  exit 1
}
docker info >/dev/null 2>&1 || {
  echo "Docker Desktop is not running or Ubuntu WSL integration is disabled." >&2
  echo "Start Docker Desktop, enable Ubuntu under Settings > Resources > WSL Integration, then rerun this script." >&2
  exit 1
}

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])' 2>/dev/null || echo 0)"
if (( NODE_MAJOR < 18 )); then
  echo "Node.js 18 or newer is required to build the frontend; found $(node --version 2>/dev/null || echo missing)." >&2
  exit 1
fi

cd "$APP_DIR"
mkdir -p backend/songs logs .run
BACKEND_ENV="$APP_DIR/backend/.env"

if [[ ! -f "$BACKEND_ENV" ]]; then
  if docker container inspect music-mysql >/dev/null 2>&1 || docker volume inspect music_mysql_data >/dev/null 2>&1; then
    echo "A music-mysql container or music_mysql_data volume already exists but backend/.env is missing." >&2
    echo "Refusing to generate new credentials for existing database data." >&2
    exit 1
  fi

  DB_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
  MYSQL_ROOT_PASSWORD="$(python3 -c 'import secrets; print(secrets.token_hex(24))')"
  JWT_SECRET_KEY="$(python3 -c 'import secrets; print(secrets.token_hex(48))')"
  umask 077
  cat > "$BACKEND_ENV" <<EOF
DB_TYPE=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=music_app
DB_PASSWORD=$DB_PASSWORD
DB_NAME=music_streamer
MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD
JWT_SECRET_KEY=$JWT_SECRET_KEY
AUDIO_STORAGE_PATH=./songs
CORS_ORIGINS=
EOF
  chmod 600 "$BACKEND_ENV"
  echo "Created private backend/.env with generated database and JWT secrets."
fi

read_env() {
  sed -n "s/^$1=//p" "$BACKEND_ENV" | head -n 1
}

DB_TYPE="$(read_env DB_TYPE)"
DB_NAME="$(read_env DB_NAME)"
DB_USER="$(read_env DB_USER)"
DB_PASSWORD="$(read_env DB_PASSWORD)"
MYSQL_ROOT_PASSWORD="$(read_env MYSQL_ROOT_PASSWORD)"
if [[ -z "$MYSQL_ROOT_PASSWORD" && "$DB_USER" == "root" ]]; then
  MYSQL_ROOT_PASSWORD="$DB_PASSWORD"
fi
if [[ "$DB_TYPE" != "mysql" || -z "$DB_NAME" || -z "$DB_USER" || -z "$DB_PASSWORD" ]]; then
  echo "backend/.env must define DB_TYPE=mysql, DB_NAME, DB_USER, and DB_PASSWORD." >&2
  exit 1
fi

if ! docker container inspect music-mysql >/dev/null 2>&1; then
  if docker volume inspect music_mysql_data >/dev/null 2>&1; then
    echo "The music_mysql_data volume exists without its music-mysql container." >&2
    echo "Refusing to attach or initialize existing database data automatically." >&2
    exit 1
  fi
  if [[ -z "$MYSQL_ROOT_PASSWORD" ]]; then
    echo "MYSQL_ROOT_PASSWORD is missing in backend/.env; refusing to create a database container." >&2
    exit 1
  fi

  docker volume create music_mysql_data >/dev/null
  MYSQL_ARGS=(-e "MYSQL_ROOT_PASSWORD=$MYSQL_ROOT_PASSWORD" -e "MYSQL_DATABASE=$DB_NAME")
  if [[ "$DB_USER" != "root" ]]; then
    MYSQL_ARGS+=(-e "MYSQL_USER=$DB_USER" -e "MYSQL_PASSWORD=$DB_PASSWORD")
  fi
  docker run -d --name music-mysql --restart=no \
    -p 127.0.0.1:3306:3306 \
    -v music_mysql_data:/var/lib/mysql \
    "${MYSQL_ARGS[@]}" \
    mysql:8.4 >/dev/null
fi

docker start music-mysql >/dev/null 2>&1 || true

echo "Waiting for MySQL to become ready..."
mysql_ready=0
for _ in $(seq 1 120); do
  if docker exec music-mysql mysqladmin ping -h 127.0.0.1 -u"$DB_USER" -p"$DB_PASSWORD" --silent >/dev/null 2>&1; then
    mysql_ready=1
    break
  fi
  sleep 5
done
if [[ "$mysql_ready" != 1 ]]; then
  echo "MySQL did not become ready. Recent container logs:" >&2
  docker logs --tail 60 music-mysql >&2 || true
  exit 1
fi

echo "Installing backend Python dependencies..."
python3 -m venv backend/.venv
backend/.venv/bin/python -m pip install --upgrade pip
backend/.venv/bin/python -m pip install -r backend/requirements.txt

echo "Installing Whisper Python dependencies (first setup can take a while)..."
python3 -m venv whisper-service/.venv
whisper-service/.venv/bin/python -m pip install --upgrade pip
whisper-service/.venv/bin/python -m pip install -r whisper-service/requirements.txt

echo "Installing frontend dependencies and building the app..."
cd frontend-react
npm ci
npm run build
cd "$APP_DIR"

bash deploy/windows/app.sh start
echo "Deployment setup finished. Secrets are in $BACKEND_ENV; keep that file private."
