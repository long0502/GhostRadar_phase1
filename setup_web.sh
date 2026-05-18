#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(pwd)}"
ARCHIVE="${ARCHIVE:-deploy_web.tar.gz}"

assert_safe_app_dir() {
  case "$APP_DIR" in
    /app/ghostradar_web|/app/ghostradar_web/*)
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
    ! -name 'setup_web.sh' \
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

if [ -f "$APP_DIR/docker-compose.yml" ]; then
  COMPOSE_FILE="$APP_DIR/docker-compose.yml"
elif [ -f "$APP_DIR/web/docker-compose.yml" ]; then
  COMPOSE_FILE="$APP_DIR/web/docker-compose.yml"
else
  echo "Missing docker-compose.yml in $APP_DIR or $APP_DIR/web"
  exit 1
fi

docker compose -f "$COMPOSE_FILE" --env-file "$APP_DIR/.env" up -d --build web
docker compose -f "$COMPOSE_FILE" --env-file "$APP_DIR/.env" ps
