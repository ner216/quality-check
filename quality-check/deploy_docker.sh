#!/bin/sh
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
IMAGE_NAME=${IMAGE_NAME:-quality-check}
CONTAINER_NAME=${CONTAINER_NAME:-quality-check}
HOST_PORT=${QUALITY_CHECK_PORT:-43827}

docker build -t "$IMAGE_NAME" "$SCRIPT_DIR"
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1; then
  docker rm -f "$CONTAINER_NAME" >/dev/null
fi
docker run -d \
  --name "$CONTAINER_NAME" \
  --restart unless-stopped \
  -p "$HOST_PORT:43827" \
  -e GITHUB_TOKEN \
  "$IMAGE_NAME"

printf 'Quality Check is running at http://localhost:%s\n' "$HOST_PORT"
