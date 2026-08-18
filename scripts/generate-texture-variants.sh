#!/usr/bin/env bash
#
# Build the reduced-resolution texture sets.
#
# The originals in public/textures are what the scene was built against and stay the
# source of truth; this writes half- and quarter-width copies beside them, into
# public/textures/half and public/textures/quarter. `src/textures.ts` picks a directory
# from the quality tier, so nothing else in the project knows these exist.
#
# ## Why they are needed at all
#
# The full set is 46 MB on disk, but the number that matters is what it becomes once it
# is decoded and uploaded. A JPEG's compression is gone at that point: every map goes to
# the GPU as RGBA8, and mipmaps add a third on top. The four 5400x2700 maps are 78 MB
# each in that state, the eleven 4096x2048 ones 45 MB each, and the whole set lands
# around 800 MB of texture memory. On a desktop card that is merely wasteful. On a phone,
# where the GPU is sharing 3-4 GB with everything else on the device, it is the
# difference between running and being killed — and the decode itself, several hundred
# megapixels of it during startup, is a genuine burst of heat before a frame is drawn.
#
# Halving the width quarters all of that, and it costs very little to look at: at the
# tier that uses it the whole scene is also being shaded at 1.25x pixel ratio or less, so
# the texels were never going to be resolved.
#
# ## Usage
#
#   ./scripts/generate-texture-variants.sh
#
# Idempotent, and safe to re-run after adding a texture — existing outputs are
# overwritten. Uses `sips`, which ships with macOS; on another platform substitute
# ImageMagick's `convert -resize 50%` and the output layout is the same.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/public/textures"

mkdir -p "$src/half" "$src/quarter"

shopt -s nullglob
for file in "$src"/*.jpg "$src"/*.png; do
    name="$(basename "$file")"
    width="$(sips -g pixelWidth "$file" | awk '/pixelWidth/ {print $2}')"

    half=$((width / 2))
    quarter=$((width / 4))

    # JPEG re-encode quality. 82 is above the point where these maps show ringing along
    # coastlines and terminators, and well below the originals' size.
    sips --resampleWidth "$half" --setProperty formatOptions 82 \
        "$file" --out "$src/half/$name" >/dev/null
    sips --resampleWidth "$quarter" --setProperty formatOptions 82 \
        "$file" --out "$src/quarter/$name" >/dev/null

    printf '%-28s %5s -> %5s / %5s\n' "$name" "$width" "$half" "$quarter"
done

echo
echo "originals: $(du -sh "$src" --exclude=half --exclude=quarter 2>/dev/null | cut -f1 || du -sh "$src" | cut -f1)"
echo "half:      $(du -sh "$src/half" | cut -f1)"
echo "quarter:   $(du -sh "$src/quarter" | cut -f1)"
