#!/usr/bin/env bash
# preview.jpg: fila 1 = portada + 7 fotogramas de «Ya está pronto»; fila 2 = portada + 7 de «Comprá en 3 pasos».
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d)
fila() { # $1 portada, $2 video, $3 tiempos
  local i=0 args=(-i "$1") fc="[0:v]scale=240:427[v0];"
  for t in $3; do i=$((i+1)); args+=(-ss "$t" -i "$2"); fc+="[$i:v]trim=end_frame=1,scale=240:427[v$i];"; done
  for k in $(seq 0 $i); do fc+="[v$k]"; done
  ffmpeg -v error -y "${args[@]}" -filter_complex "${fc}hstack=inputs=$((i+1))" -frames:v 1 "$4"
}
fila portada-ya-esta-pronto.png ya-esta-pronto.mp4 "0.2 1.4 2.7 4.0 5.6 7.0 8.9" "$T/a.png"
fila portada-compra-3-pasos.png compra-3-pasos.mp4 "0.3 2.3 4.4 5.8 7.6 9.0 13.6" "$T/b.png"
ffmpeg -v error -y -i "$T/a.png" -i "$T/b.png" -filter_complex "vstack=inputs=2,pad=iw+48:ih+72:24:24:color=#efe6da" -q:v 3 preview.jpg
rm -rf "$T"
echo ok preview.jpg
