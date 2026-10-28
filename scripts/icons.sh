#!/usr/bin/env bash
# Rasterise public/icons/icon.svg into the PNG sizes the PWA manifest and iOS need.
set -euo pipefail
cd "$(dirname "$0")/../public/icons"
rsvg-convert -w 192 -h 192 icon.svg -o icon-192.png
rsvg-convert -w 512 -h 512 icon.svg -o icon-512.png
rsvg-convert -w 180 -h 180 icon.svg -o apple-touch-icon.png
# Maskable: shrink artwork into the safe zone over a full-bleed background.
rsvg-convert -w 400 -h 400 icon.svg -o /tmp/ps-icon-400.png
magick -size 512x512 gradient:'#ffb35c-#ff5f8f' /tmp/ps-icon-400.png -gravity center -composite icon-maskable-512.png
