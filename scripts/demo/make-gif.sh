#!/usr/bin/env bash
# Builds demo.gif: the VHS terminal recording followed by the extracted SVG rendered in Chrome.
# Run from a directory containing design.xd (see demo.tape for setup). Needs vhs, ffmpeg, gifsicle and Chrome.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

vhs "$HERE/demo.tape"

cat > view.html <<'HTML'
<!doctype html><meta charset="utf-8"><body style="margin:0;background:#1e1e2e;width:1200px;height:300px;display:flex;align-items:center;justify-content:center;font-family:system-ui;color:#cdd6f4">
<div style="text-align:center"><img src="out/sign-up.svg" style="height:222px;border-radius:12px;box-shadow:0 10px 40px #0008"><div style="margin-top:10px;font-size:20px;opacity:.8">out/sign-up.svg</div></div>
HTML
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,300 \
  --allow-file-access-from-files --screenshot=result.png "file://$PWD/view.html"

# Re-encode the VHS gif first: it keeps ffmpeg's concat filter from re-initialising on odd frame geometry.
ffmpeg -v error -y -i terminal.gif -vf "fps=12,scale=800:-2:flags=lanczos,format=yuv420p" -an term.mp4
ffmpeg -v error -y -i term.mp4 -loop 1 -framerate 12 -t 3 -i result.png -filter_complex \
  "[0:v]setsar=1,fps=12,format=rgb24[a];[1:v]scale=800:-2:flags=lanczos,setsar=1,fps=12,format=rgb24[b];[a][b]concat=n=2:v=1:a=0,split[s0][s1];[s0]palettegen=max_colors=200:stats_mode=full[p];[s1][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  demo-raw.gif
gifsicle -O3 --lossy=20 demo-raw.gif -o demo.gif
echo "wrote $PWD/demo.gif"
