#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
INPUT_DIR="${1:-"$ROOT_DIR/tts"}"
OUTPUT_DIR="${2:-"$ROOT_DIR/public/tts"}"

mkdir -p "$OUTPUT_DIR"

shopt -s nullglob

for input_path in "$INPUT_DIR"/*.wav; do
  filename="$(basename "$input_path" .wav)"
  output_path="$OUTPUT_DIR/$filename.m4a"

  ffmpeg -y \
    -i "$input_path" \
    -vn \
    -c:a aac \
    -b:a 64k \
    -ac 1 \
    -movflags +faststart \
    "$output_path"
done
