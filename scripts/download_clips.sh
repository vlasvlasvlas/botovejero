#!/bin/bash
# Descarga los primeros 100 clips de la playlist y genera un playlist.yaml

mkdir -p public/media
PLAYLIST_URL="https://www.youtube.com/playlist?list=PLqY0WHGqeB2tdEn_quF2paebPOI70NQhj"

echo "Descargando videos..."
# Bajamos con baja resolución para asegurar performance y espacio
yt-dlp --playlist-items 1-100 \
       -f "best[height<=360]" \
       --merge-output-format mp4 \
       -o "public/media/%(playlist_index)s.%(ext)s" \
       "$PLAYLIST_URL"

echo "Generando playlist.yaml..."
# Generamos un archivo YAML con los títulos
yt-dlp --playlist-items 1-100 \
       --print "- index: %(playlist_index)s" \
       --print "  title: \"%(title)s\"" \
       --print "  file: \"%(playlist_index)s.mp4\"" \
       "$PLAYLIST_URL" > public/media/playlist.yaml

echo "¡Completado!"
