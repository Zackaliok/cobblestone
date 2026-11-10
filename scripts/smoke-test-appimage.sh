#!/usr/bin/env bash
# Vérifie qu'une AppImage démarre et tient sur le système courant, sans
# désaccord entre les bibliothèques qu'elle embarque et celles du bureau (#44).
#
# Usage : scripts/smoke-test-appimage.sh <fichier.AppImage> [durée en secondes]
#
# Prérequis : xvfb-run, dbus-run-session, et les composants du bureau avec
# lesquels l'AppImage doit cohabiter : gvfs et dconf (modules GIO chargés dans
# le processus), at-spi2-core (bus d'accessibilité).
#
# Échoue si :
#   - l'application s'arrête avant la fin du délai ;
#   - un module GIO du système refuse de se charger (`undefined symbol`) : la
#     GLib embarquée est plus ancienne que celle du système ;
#   - le pont d'accessibilité ne comprend plus le registre AT-SPI (`unknown
#     signature`), ce qui n'apparaît qu'après 25 s, délai d'expiration D-Bus.
set -euo pipefail

if [ $# -lt 1 ]; then
  echo "Usage : $0 <fichier.AppImage> [durée en secondes]" >&2
  exit 2
fi

appimage=$(realpath "$1")
duration=${2:-35}
work=$(mktemp -d)
logs="$work/data/local.entreprise.cobblestone/logs"

# Profil vierge : ne touche ni aux workspaces ni au journal de l'utilisateur.
export XDG_DATA_HOME="$work/data" XDG_CONFIG_HOME="$work/config" XDG_CACHE_HOME="$work/cache"
# Pas de FUSE dans un conteneur : le runtime extrait l'AppImage avant de la lancer.
export APPIMAGE_EXTRACT_AND_RUN=1

# Les variables sont passées en arguments ($1…$3) au shell lancé sous Xvfb.
# shellcheck disable=SC2016
xvfb-run -a dbus-run-session -- bash -c '
  "$1" > "$2/output.log" 2>&1 &
  pid=$!
  sleep "$3"
  if kill -0 "$pid" 2>/dev/null; then
    echo "en vie" > "$2/status"
    kill "$pid"
  else
    wait "$pid" && code=0 || code=$?
    echo "arrêtée (code $code)" > "$2/status"
  fi
' smoke "$appimage" "$work" "$duration" || true

# Depuis #44, Cobblestone écrit sa sortie d'erreur dans le dossier de logs ;
# une version plus ancienne la laisse dans output.log.
outputs=("$work/output.log")
[ -f "$logs/stderr.log" ] && outputs+=("$logs/stderr.log")

for file in "${outputs[@]}" "$logs/cobblestone.log"; do
  [ -f "$file" ] || continue
  echo "::group::$(basename "$file")"
  cat "$file"
  echo "::endgroup::"
done

status=$(cat "$work/status" 2>/dev/null || echo "inconnu")
failed=0

if [ "$status" != "en vie" ]; then
  echo "::error::L'AppImage n'a pas tenu ${duration} s : $status"
  failed=1
fi

if mismatches=$(grep -h -E "undefined symbol|unknown signature" "${outputs[@]}"); then
  echo "::error::Bibliothèques embarquées en désaccord avec celles du système :"
  echo "$mismatches"
  failed=1
fi

if [ "$failed" -eq 0 ]; then
  echo "AppImage en vie après ${duration} s, sans désaccord de bibliothèques."
fi
exit "$failed"
