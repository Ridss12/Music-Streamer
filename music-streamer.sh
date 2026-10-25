#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

case "${1:-}" in
  start)
    sudo cp \
      "$project_root/deploy/music-streamer-backend.service" \
      "$project_root/deploy/music-streamer-whisper.service" \
      "$project_root/deploy/music-streamer-funnel.service" \
      /etc/systemd/system/
    sudo systemctl daemon-reload
    sudo systemctl disable caddy mariadb docker >/dev/null
    sudo systemctl start tailscaled docker mariadb
    sudo systemctl start music-streamer-backend music-streamer-whisper caddy
    if ! sudo systemctl is-active --quiet music-streamer-funnel; then
      sudo tailscale funnel --https=443 off >/dev/null 2>&1 || true
    fi
    sudo systemctl start music-streamer-funnel
    echo "Music Streamer is running at https://cachyos-x8664.tailff30fd.ts.net"
    ;;
  stop)
    sudo systemctl stop music-streamer-funnel || true
    sudo systemctl stop music-streamer-backend music-streamer-whisper || true
    sudo docker stop music-rasa music-actions >/dev/null 2>&1 || true
    sudo systemctl stop caddy mariadb || true
    echo "Music Streamer is stopped. Tailscale itself remains connected."
    ;;
  status)
    sudo systemctl --no-pager --full status \
      music-streamer-backend music-streamer-whisper \
      music-streamer-funnel caddy mariadb docker
    sudo tailscale funnel status
    ;;
  *)
    echo "Usage: bash music-streamer.sh {start|stop|status}" >&2
    exit 2
    ;;
esac
