#!/bin/sh
set -e

PUID="${PUID:-0}"
PGID="${PGID:-0}"

# 以指定 UID/GID 运行，保证在 NAS 上能读写挂载进来的文件
if [ "$PUID" != "0" ]; then
  if ! getent group "$PGID" >/dev/null 2>&1; then
    addgroup -g "$PGID" -S renamer 2>/dev/null || true
  fi
  GNAME="$(getent group "$PGID" | cut -d: -f1)"
  if ! getent passwd "$PUID" >/dev/null 2>&1; then
    adduser -u "$PUID" -G "${GNAME:-renamer}" -S -H -s /sbin/nologin renamer 2>/dev/null || true
  fi
  chown -R "$PUID:$PGID" /config 2>/dev/null || true
  echo "[entrypoint] 以 UID=$PUID GID=$PGID 运行"
  exec su-exec "$PUID:$PGID" node --no-warnings /app/server/dist/index.js
else
  echo "[entrypoint] 以默认用户运行（可在环境变量里设置 PUID/PGID）"
  exec node --no-warnings /app/server/dist/index.js
fi
