#!/usr/bin/env bash
# Builds demo.gif from the VHS recording (session.mp4) and the SVG the agent produced (how-it-works.svg).
# The terminal is shown on the left; a preview panel on the right fills in when the agent looks at the render.
# Waiting time is sped up. Run in a directory holding session.mp4 and how-it-works.svg.
# Needs ffmpeg, gifsicle, ImageMagick and Node (for the resvg CLI).
set -euo pipefail

T_SHOW=24.5   # second of session.mp4 where the agent renders the SVG; the preview appears then
FONT="${FONT:-/System/Library/Fonts/Menlo.ttc}"

# Preview panel, 420x720: an empty placeholder first, then the SVG rendered by resvg with the validation result.
npx -y @resvg/resvg-js-cli --fit-width 744 how-it-works.svg render.png
magick -size 420x720 xc:'#181825' -font "$FONT" -fill '#a6adc8' -pointsize 15 -annotate +24+40 'Preview' \
  -fill none -stroke '#45475a' -strokewidth 1.5 -draw "roundrectangle 24,250 396,481 10,10" \
  -stroke none -fill '#585b70' -pointsize 14 -annotate +112+372 'out/how-it-works.svg' \
  -stroke '#313244' -strokewidth 1 -draw "line 0,0 0,720" -depth 8 panel-empty.png
magick render.png -resize 372x -bordercolor '#313244' -border 1 +repage card.png
magick -size 420x720 xc:'#181825' -font "$FONT" -fill '#a6adc8' -pointsize 15 -annotate +24+40 'Preview' \
  -stroke '#313244' -strokewidth 1 -draw "line 0,0 0,720" -stroke none \
  card.png -gravity northwest -geometry +24+250 -composite \
  -fill '#cdd6f4' -pointsize 14 -annotate +24+470 'out/how-it-works.svg' \
  -fill '#a6e3a1' -annotate +24+500 '✓' -fill '#a6adc8' -annotate +44+500 'validated: 0 errors' \
  -fill '#6c7086' -annotate +24+530 '1920 x 900 · vector · 44 shapes' -depth 8 panel-result.png

# Speed ramp: typing at 1x, the agent's work at 1.5x-3x, then hold the final answer.
ffmpeg -v error -y -i session.mp4 -loop 1 -framerate 30 -i panel-empty.png -loop 1 -framerate 30 -i panel-result.png \
  -filter_complex "
[1:v]format=rgb24[pe];[2:v]format=rgb24[pr];
[pe][pr]overlay=enable='gte(t,$T_SHOW)'[panel];
[0:v]format=rgb24[term];
[term][panel]hstack=inputs=2:shortest=1,fps=30[full];
[full]split=6[a][b][c][d][e][f];
[a]trim=1.0:7.6,setpts=PTS-STARTPTS[s1];
[b]trim=7.6:19.0,setpts=(PTS-STARTPTS)/3[s2];
[c]trim=19.0:24.0,setpts=(PTS-STARTPTS)/2[s3];
[d]trim=24.0:29.5,setpts=(PTS-STARTPTS)/1.5[s4];
[e]trim=29.5:32.2,setpts=PTS-STARTPTS[s5];
[f]trim=32.1:32.2,setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=3.5[s6];
[s1][s2][s3][s4][s5][s6]concat=n=6:v=1:a=0,fps=12,scale=960:-2:flags=lanczos,split[x][y];
[x]palettegen=max_colors=256:stats_mode=full[p];[y][p]paletteuse=dither=bayer:bayer_scale=3[out]" \
  -map "[out]" demo-raw.gif
gifsicle -O3 --lossy=25 demo-raw.gif -o demo.gif
echo "wrote $PWD/demo.gif"
