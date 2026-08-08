#!/usr/bin/env bash
# Convert source images in img_original/hero/ into 1-bit dithered PNGs in img/hero/.
# Requires ImageMagick 7 (`brew install imagemagick`).
#
#   ./dither.sh              # convert anything not already converted
#   ./dither.sh --all        # redo everything
#   ./dither.sh --dry-run    # just print what would happen
#   ./dither.sh --invert     # bake white-on-black in (then drop `.dither` from CSS)
#
# Two ways to get dithered art onto a dark page:
#   1. leave images black-on-white and add class="dither" in markup (CSS inverts them)
#   2. run with --invert so the files themselves are white-on-black
# Option 1 keeps the sources reusable for a light theme / RSS readers, so it's
# the default. Option 2 is better if you syndicate to somewhere with a light bg
# you don't control... actually no — in that case keep option 1. Use --invert
# only if you want the inversion permanent.

set -Eeuo pipefail

dry_run=false
convert_all=false
invert=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --dry-run) dry_run=true; shift ;;
        --all)     convert_all=true; shift ;;
        --invert)  invert=true; shift ;;
        *) echo "unknown option: $1" >&2; exit 1 ;;
    esac
done

command -v magick >/dev/null || { echo "ImageMagick 7 (magick) not found" >&2; exit 1; }

# main column width, and a small thumbnail for any featured grid
sizes=("660:" "300:_thumb")

invert_arg=()
$invert && invert_arg=(-negate)

shopt -s nullglob
for img in img_original/hero/*; do
    [ -f "$img" ] || continue
    base=$(basename "${img%.*}")

    for spec in "${sizes[@]}"; do
        width=${spec%%:*}
        suffix=${spec##*:}
        dest="img/hero/${base}${suffix}.png"

        if [ "$convert_all" = false ] && [ -f "$dest" ]; then
            continue
        fi

        if $dry_run; then
            echo "would convert: $img -> $dest (${width}px)"
            continue
        fi

        mkdir -p img/hero
        # smaller renditions need less noise or the dither turns to mud
        attenuate=1.2
        [ "$width" -le 300 ] && attenuate=0.6

        magick "$img" \
            -resize "${width}x" \
            -gamma 1.5 \
            -attenuate "$attenuate" +noise gaussian \
            -monochrome \
            +level-colors "black,white" \
            "${invert_arg[@]}" \
            "$dest"
        echo "converted: $img -> $dest (${width}px)"
    done
done

# pass through any non-hero images untouched
for img in img_original/*; do
    [ -f "$img" ] || continue
    dest="img/$(basename "$img")"
    [ -f "$dest" ] && continue
    if $dry_run; then
        echo "would copy: $img -> $dest"
    else
        cp "$img" "$dest"
        echo "copied: $img -> $dest"
    fi
done
