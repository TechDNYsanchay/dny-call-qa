#!/usr/bin/env bash
# Saves secrets into .env.local without showing them on screen or keeping them in shell history.
#
#   bash scripts/save-key.sh DEEPGRAM_API_KEY SARVAM_API_KEY ELEVENLABS_API_KEY
#
# Paste each value when asked (nothing appears while you paste), then press Enter.
# Press Enter on an empty prompt to skip that one. An existing value is replaced.
set -euo pipefail
cd "$(dirname "$0")/.."
touch .env.local
chmod 600 .env.local

for name in "$@"; do
  if [[ ! "$name" =~ ^[A-Z][A-Z0-9_]*$ ]]; then
    echo "Skipping \"$name\": names look like DEEPGRAM_API_KEY"
    continue
  fi
  read -rsp "Paste $name, then Enter (empty = skip): " value
  echo
  value="${value//[$'\r\n\t ']/}"
  if [ -z "$value" ]; then
    echo "  $name skipped"
    continue
  fi
  tmp=$(mktemp .env.local.XXXXXX)
  grep -v "^$name=" .env.local > "$tmp" || true
  printf '%s=%s\n' "$name" "$value" >> "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" .env.local
  echo "  $name saved (${#value} characters)"
done
