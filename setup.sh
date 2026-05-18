#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ARCHIVE="${ARCHIVE:-deploy.tar.gz}"

assert_safe_app_dir() {
  case "$APP_DIR" in
    /app/ghostradar|/app/ghostradar/*)
      ;;
    *)
      echo "Refusing to clean unexpected APP_DIR: $APP_DIR"
      exit 1
      ;;
  esac
}

cleanup_app_dir() {
  find "$APP_DIR" -mindepth 1 -maxdepth 1 \
    ! -name '.env' \
    ! -name "$(basename "$ARCHIVE")" \
    ! -name 'setup.sh' \
    -exec rm -rf {} +
}

cd "$APP_DIR"

if [ ! -f "$ARCHIVE" ]; then
  echo "Missing archive: $ARCHIVE"
  exit 1
fi

assert_safe_app_dir
cleanup_app_dir
tar -xzf "$ARCHIVE"
rm -f "$ARCHIVE"

if [ ! -f ".env" ]; then
  echo "Warning: .env is missing in $APP_DIR"
fi

docker compose up -d --build db api admin
docker compose ps
