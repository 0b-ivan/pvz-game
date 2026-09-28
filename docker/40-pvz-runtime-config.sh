#!/bin/sh
set -eu

backend_url="${PVZ_BACKEND_URL:-http://localhost:3000}"

case "$backend_url" in
	http://*|https://*) ;;
	*)
		echo "PVZ_BACKEND_URL must start with http:// or https://" >&2
		exit 1
		;;
esac

if printf '%s' "$backend_url" | grep -q '[[:space:]"\\]'; then
	echo "PVZ_BACKEND_URL contains unsupported characters" >&2
	exit 1
fi

printf 'window.PVZ_CONFIG = Object.freeze({ backendUrl: "%s" });\n' "$backend_url" > /tmp/pvz-runtime-config.js
