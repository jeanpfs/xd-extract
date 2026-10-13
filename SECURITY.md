# Security

Report vulnerabilities privately through GitHub: **Security → Report a vulnerability** on this repository. Please do not open a public issue.

Scope worth reporting: path traversal when reading `.xd` archives or writing output, token leakage in `--record` output, and code execution through crafted designs or share-link responses.

`xd` fetches only the share link you pass and the manifest and AGC files it points to. `--browser` additionally runs the optional `agent-browser` on that link. Recordings made with `--record` contain the full design (tokens are stripped): treat them as private.
