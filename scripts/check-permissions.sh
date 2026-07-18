#!/bin/sh
set -e

# ── Memory limit override ──────────────────────────────────────────────
# If OMNIROUTE_MEMORY_MB is set, build NODE_OPTIONS dynamically so the
# user can tune heap size via environment without editing the Dockerfile.
if [ -n "$OMNIROUTE_MEMORY_MB" ]; then
  export NODE_OPTIONS="${NODE_OPTIONS:-} --max-old-space-size=${OMNIROUTE_MEMORY_MB}"
fi

DATA_PATH="${DATA_DIR:-/app/data}"

# Railway (and most bind mounts) ship volumes as root-owned. The app runs as
# UID 1000 (`node`). If we stay non-writable, resolveWritableDataDir falls
# back off the volume and ops ends up on /tmp — ephemeral + SIGTERM wipe.
# Entrypoint starts as root solely to chown the mount, then drops privileges.
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_PATH"
  if [ -d "$DATA_PATH" ]; then
    chown -R 1000:1000 "$DATA_PATH" 2>/dev/null || true
    chmod u+rwX "$DATA_PATH" 2>/dev/null || true
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
