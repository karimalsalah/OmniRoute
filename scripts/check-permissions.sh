#!/bin/sh
set -e

# ── Memory limit override ──────────────────────────────────────────────
# If OMNIROUTE_MEMORY_MB is set, build NODE_OPTIONS dynamically so the
# user can tune heap size via environment without editing the Dockerfile.
if [ -n "$OMNIROUTE_MEMORY_MB" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${OMNIROUTE_MEMORY_MB}"
fi

DATA_PATH="${DATA_DIR:-/app/data}"

# Railway volumes mount as root. Official fix: RAILWAY_RUN_UID=0
# (https://docs.railway.com/volumes). When that is set — or we detect
# Railway and the mount is not writable as UID 1000 — stay root so SQLite
# can persist under DATA_DIR=/app/data instead of falling back to /tmp.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_PATH"
  if [ -d "$DATA_PATH" ]; then
    chown -R 1000:1000 "$DATA_PATH" 2>/dev/null || true
    chmod u+rwX "$DATA_PATH" 2>/dev/null || true
  fi

  stay_root=0
  if [ "${RAILWAY_RUN_UID:-}" = "0" ]; then
    stay_root=1
  elif [ -n "${RAILWAY_ENVIRONMENT:-}${RAILWAY_SERVICE_ID:-}" ]; then
    # Probe writability as node; if chown was a no-op, keep root.
    if ! setpriv --reuid=1000 --regid=1000 --clear-groups -- sh -c "test -w \"$DATA_PATH\"" 2>/dev/null; then
      stay_root=1
    fi
  fi

  if [ "$stay_root" = "1" ]; then
    echo "[DATA_DIR] Running as root for writable volume path: $DATA_PATH"
    exec "$@"
  fi

  if command -v setpriv >/dev/null 2>&1; then
    exec setpriv --reuid=1000 --regid=1000 --clear-groups -- "$@"
  fi
  if command -v runuser >/dev/null 2>&1; then
    exec runuser -u node -- "$@"
  fi
  if command -v su-exec >/dev/null 2>&1; then
    exec su-exec node "$@"
  fi
  echo "WARNING: no setpriv/runuser/su-exec — continuing as root"
  exec "$@"
fi

if [ -d "$DATA_PATH" ] && [ ! -w "$DATA_PATH" ]; then
  echo "WARNING: $DATA_PATH is not writable by the current user (UID $(id -u))."
  if [ "${CONTAINER_HOST:-}" = "podman" ]; then
    echo "Rootless Podman maps container UIDs into a subordinate range."
    echo "Run this on the host to fix (using the host-side bind-mount path):"
    echo "  podman unshare chown -R $(id -u):$(id -g) <host-data-dir>"
  else
    echo "Run this on the Docker host to fix (using the host-side bind-mount path):"
    echo "  sudo chown -R $(id -u):$(id -g) <host-data-dir>"
    echo "  chmod -R u+rwX <host-data-dir>"
  fi
fi

exec "$@"
