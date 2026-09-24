@AGENTS.md

<!-- skillrunner:begin (managed by `sr bootstrap` — do not edit inside) -->
## skillrunner (`sr`) — use it every session

This project (stack: **rn**) is served by `sr` (aka `skillrunner`), a central
skill dispatcher on your PATH. It detects the stack and prints "marching orders"
(rules + steps) for YOU (Claude) to execute — it never reasons and never rewrites your
source. `emit` only appends to `.skillrunner/ledger.json`; `pull`/`fetch`/`apply-base` write
generated files (types / markdown / base config). Nothing else in the repo is touched.

When a request matches a skill:
1. `sr status` — stack + whether docs/project-profile.md and docs/module-registry.md are cached.
   A cached doc marked `STALE` has fallen behind the source: still use it to orient, but confirm any
   file/symbol still exists before relying on it, and ask the user before rebuilding it.
2. `sr list` — skills with one-line descriptions; map the task to the right one.
3. `sr emit <skill>` — print the marching orders, then READ and FOLLOW the "Rules you MUST follow" section.
4. A skill tagged `[needs approval]` → only propose a plan/goal and STOP for the user; do not edit files first.
5. First task in a project with no docs/project-profile.md → run `learn-project` before implementing.

If a task clearly matches a skill, prefer `sr emit <skill>` over improvising.

Beyond skills, two deterministic 0-token bridges — use them instead of reading raw
sources yourself: `sr pull` (OpenAPI → types + hooks + digest) and `sr fetch`
(Confluence / Google Sheet → clean markdown + digest).
<!-- skillrunner:end -->
