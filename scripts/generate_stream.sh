#!/bin/bash

# 1. Require an input file argument
if [ -z "$1" ]; then
  echo "Usage: $0 <path_to_audio_file>"
  echo "Example: $0 my_music/explore.mp3"
  exit 1
fi

INPUT_FILE="$1"

# 2. Check if the file actually exists
if [ ! -f "$INPUT_FILE" ]; then
  echo "Error: File '$INPUT_FILE' not found."
  exit 1
fi

# 3. Extract the base filename without extension to use as our PREFIX
BASENAME=$(basename "$INPUT_FILE")
PREFIX="${BASENAME%.*}"

# Configuration
OUTPUT_DIR="examples/assets/streams"
CHUNK_SECONDS=5
BASE_URL="/assets/streams"

mkdir -p "$OUTPUT_DIR"

echo "1. Generating pre-warmed Ogg Vorbis chunks (Encoder Warmup Trimming)..."
DURATION_SEC=$(ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "$INPUT_FILE")

# Generate 5-second logical chunks. We over-encode by 250ms on each side.
CHUNK_SECONDS=5
TRIM_SECONDS=0.25
TOTAL_CHUNKS=$(awk "BEGIN {print int($DURATION_SEC / $CHUNK_SECONDS) + 1}")

echo "2. Generating ${PREFIX}.json manifest..."
MANIFEST_FILE="$OUTPUT_DIR/${PREFIX}.json"

echo '{
  "isLooping": true,
  "chunks": [' > "$MANIFEST_FILE"

for (( i=0; i<$TOTAL_CHUNKS; i++ )); do
    if [ "$i" -gt 0 ]; then
        echo "," >> "$MANIFEST_FILE"
    fi

    IDX=$(printf "%03d" $i)
    CHUNK_FILENAME="${PREFIX}_${IDX}.ogg"
    CHUNK_PATH="$OUTPUT_DIR/$CHUNK_FILENAME"
    
    LOGICAL_START=$(awk "BEGIN {printf \"%.3f\", $i * $CHUNK_SECONDS}")
    REMAINING=$(awk "BEGIN {print $DURATION_SEC - $LOGICAL_START}")
    LOGICAL_DUR=$(awk -v r="$REMAINING" -v c="$CHUNK_SECONDS" 'BEGIN { if (r > c) printf "%.3f", c; else printf "%.3f", r }')

    if [ "$i" -eq 0 ]; then
        PHYSICAL_START=0
        TRIM_SAMPLES=0
        DUR=$(awk "BEGIN {printf \"%.3f\", $LOGICAL_DUR + $TRIM_SECONDS}")
    else
        PHYSICAL_START=$(awk "BEGIN {printf \"%.3f\", $LOGICAL_START - $TRIM_SECONDS}")
        TRIM_SAMPLES=$(awk "BEGIN {printf \"%d\", $TRIM_SECONDS * 44100}")
        DUR=$(awk "BEGIN {printf \"%.3f\", $LOGICAL_DUR + 2 * $TRIM_SECONDS}")
    fi

    ffmpeg -v error -y -ss "$PHYSICAL_START" -t "$DUR" -i "$INPUT_FILE" -c:a libvorbis -q:a 4 -ar 44100 "$CHUNK_PATH" < /dev/null

    # The engine uses the EXACT logical duration! 
    # Because of Web Audio gapless stitching, it will stop exactly at LOGICAL_DUR.
    SAMPLES=$(awk "BEGIN {printf \"%d\", $LOGICAL_DUR * 44100}")

    # Write the JSON object for this chunk
    echo -n "    { \"url\": \"$BASE_URL/$CHUNK_FILENAME\", \"durationSamples\": $SAMPLES, \"trimStartSamples\": $TRIM_SAMPLES }" >> "$MANIFEST_FILE"
done

echo '
  ]
}' >> "$MANIFEST_FILE"

echo "✅ Done! Manifest created at $MANIFEST_FILE"
