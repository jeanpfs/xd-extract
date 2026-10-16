# Records the real Claude Code session behind assets/demo.gif (https://github.com/charmbracelet/vhs).
#
# Setup:
#   1. mkdir -p /tmp/xdemo-cc && cd /tmp/xdemo-cc
#      curl -sL https://raw.githubusercontent.com/L2jLiga/xd2svg/937365e71fe735751053e918b3ba02cfa546ce7a/test/input/single.xd -o design.xd
#      npx skills@latest add jeanpfs/xd-extract --all -a claude-code -y
#   2. A clean Claude Code config dir (no personal skills, hooks or status line) that already has credentials
#      and allows the commands the skill runs: Bash(npx -y xd-extract@latest:*), Bash(mkdir:*), Bash(ls:*),
#      Bash(which:*), Bash(npx -y @resvg/resvg-js-cli:*), Read(//tmp/**), Skill. Point CLAUDE_CONFIG_DIR at it.
# Record from any directory:  vhs agent.tape   (writes session.mp4 in the current directory)
# Then:                       make-gif.sh      (needs how-it-works.svg copied from /tmp/xdemo-cc/out/)
#
# The session is real and not deterministic: re-record until the agent loads the skill, extracts, validates and
# looks at the render, then set T_SHOW in make-gif.sh to the second where the render appears.

Output "session.mp4"
Set Shell "bash"
Set FontSize 18
Set Width 940
Set Height 720
Set Padding 16
Set Theme "Catppuccin Mocha"
Set TypingSpeed 38ms

Hide
Type "cd /tmp/xdemo-cc && export CLAUDE_CONFIG_DIR=/tmp/cc-demo-config && PS1='$ ' && rm -rf out && clear" Enter
Show
Type "claude" Enter
Wait+Screen@30s /Try|\? for shortcuts|esc to interrupt|❯/
Sleep 2s
Type "Extract the How it works section from design.xd as out/how-it-works.svg and look at the render to check it. Summarize in two lines." Sleep 600ms Enter
Wait+Screen@240s /done at|done \d+:\d+/
Sleep 3s
