#!/bin/sh
set -eu

backend_url="${PVZ_BACKEND_URL:-http://localhost:3000}"
backend_internal_url="${PVZ_BACKEND_INTERNAL_URL:-http://127.0.0.1:3000}"

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

case "$backend_internal_url" in
	http://*|https://*) ;;
	*)
		echo "PVZ_BACKEND_INTERNAL_URL must start with http:// or https://" >&2
		exit 1
		;;
esac

if printf '%s' "$backend_internal_url" | grep -q '[[:space:]"\\]'; then
	echo "PVZ_BACKEND_INTERNAL_URL contains unsupported characters" >&2
	exit 1
fi

printf 'window.PVZ_CONFIG = Object.freeze({ backendUrl: "%s" });\n' "$backend_url" > /tmp/pvz-runtime-config.js
printf 'proxy_pass %s;\n' "$backend_internal_url" > /tmp/pvz-backend-upstream.conf
