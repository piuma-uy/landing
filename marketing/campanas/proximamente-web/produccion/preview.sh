#!/usr/bin/env bash
# Arma preview-campana.jpg: los dos posts, la portada y seis fotogramas del reel en una sola imagen.
# Requiere que ya existan los PNG y el MP4 (ver README). Los fotogramas se extraen a un directorio temporal.
set -euo pipefail
cd "$(dirname "$0")/.."
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
TIEMPOS=(0.5 3.9 5.0 6.5 7.9 9.6 12.6 14.4 18.5)
i=0
for t in "${TIEMPOS[@]}"; do
  ffmpeg -v error -y -ss "$t" -i reel-proximamente-web.mp4 -frames:v 1 -vf scale=270:480 "$TMP/f$i.png"; i=$((i+1))
done
BG=0x2f2c29
ffmpeg -v error -y -i post-01-marca.png -i post-02-proximamente-web.png -i reel-portada.png \
  $(for k in $(seq 0 8); do printf -- '-i %s ' "$TMP/f$k.png"; done) -filter_complex "\
[0]scale=800:1000[p1];[1]scale=800:1000[p2];[2]scale=562:1000[po];\
[p1][p2][po]xstack=inputs=3:layout=0_0|840_0|1680_0:fill=$BG[fila1];\
[3][4][5][6][7][8][9][10][11]xstack=inputs=9:layout=0_0|280_0|560_0|840_0|1120_0|1400_0|1680_0|1960_0|2240_0:fill=$BG[fila2];\
[fila1]pad=2510:1040:134:0:$BG[f1];[fila2]pad=2510:480:0:0:$BG[f2];\
[f1][f2]vstack=inputs=2,pad=2590:1600:40:40:$BG" \
  -q:v 3 preview-campana.jpg
echo ok preview-campana.jpg
