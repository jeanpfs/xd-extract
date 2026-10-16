# Records assets/demo.gif with https://github.com/charmbracelet/vhs
#
# Setup (once):
#   mkdir -p /tmp/xdemo && cd /tmp/xdemo
#   curl -sL https://raw.githubusercontent.com/L2jLiga/xd2svg/937365e71fe735751053e918b3ba02cfa546ce7a/test/input/single.xd -o design.xd
#   npm install --prefix /tmp/xdemo/cli xd-extract
# Record (from /tmp/xdemo; make-gif.sh also renders the final SVG frame and optimizes):
#   PATH=/tmp/xdemo/cli/node_modules/.bin:$PATH /path/to/xd-extract/scripts/demo/make-gif.sh
#
# single.xd is the public sample from xd2svg (MIT). Output lines longer than the terminal are cut with an ellipsis.

Output terminal.gif

Set Shell "bash"
Set FontSize 18
Set Width 1200
Set Height 300
Set Padding 24
Set Theme "Catppuccin Mocha"
Set TypingSpeed 45ms
Set PlaybackSpeed 1

Hide
Type `PS1='$ '; clear` Enter
Type `xd() { command xd "$@" 2>&1 | sed -E 's/^(.{98}).+/\1…/'; }` Enter
Type `rm -rf out && mkdir out && clear` Enter
Show

Type "xd inventory design.xd --find 'Sign Up'" Sleep 400ms Enter
Sleep 2s
Ctrl+L

Type "xd extract design.xd --node 'Sign Up form' -o out/sign-up.svg" Sleep 400ms Enter
Sleep 3s
Ctrl+L

Type "xd validate out/sign-up.svg" Sleep 400ms Enter
Sleep 3s
