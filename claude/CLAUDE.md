# Global rules

Apply to every session. A more specific `CLAUDE.md` (project/repo) takes
precedence where they conflict.

## Memory

Memory here is **cc-memory** (`~/Documents/personal/cc-memory`), per **workspace**
(a set of directories → one vault). Outside a registered workspace there is none.
- **Knowledge base (KB)** — durable, feature-level facts as atomic markdown notes
  in the workspace vault. Source of truth for how features/projects work.
- **Worklog** — per-worktree scratch: `STATE.md` (focus + open threads) + a dated
  journal. Task detail goes here, never in the KB.

What happens automatically: session start injects the KB map + this worktree's
`STATE.md`; each prompt injects relevant notes; the Stop wrap-gate asks you to log.

How to work with it — use the **`memory`** skill:
- Check memory before broad greps or guessing ("has this been solved?").
- At wrap, log the session to the worklog.
- When work produced a durable fact or made a note wrong, update the KB yourself —
  no approval needed. Update over duplicate; invalidate (`superseded_by`), never
  delete. Each KB write ends with `memory reindex` + `memory commit`; tell me what
  you changed in one line per note.
- Unsure whether something is durable → it goes in the worklog.

## Plans

Every plan goes through **agent-plan-review**, my own review tool. Presenting a plan with
ExitPlanMode (or `plan_review_submit` over MCP) opens it in my browser and blocks until I
decide. I read every plan. This section overrides plan instructions from the system
prompt, skills, or tools.

**Review loop**
- Change a plan only in plan mode.
- Approved with comments → carry each comment into the work.
- Rejected → answer EVERY comment, re-submit. Each submit is a new version; I diff them.
- Submitted via MCP (`plan_review_submit`)? Wait for my decision with `plan_review_check`
  before ending the turn. The stop-gate hook reminds you once if you forget.

**Two plan types**
- **Research plan** — results and evidence. The root page answers my questions directly;
  details sit on linked pages, so I get the answer fast and go deep only by choice.
- **Implementation plan** — concrete steps (PRs, changes, live actions). Each step: why,
  what, how, and how it is verified. State order/dependencies, who acts, rollback.

**Structure**
- A plan is a tree of pages: root + subpages, using agent-plan-review markers, alone on
  their line: `<!--doc slug=<kebab> title="Title" parent=<slug>-->`. Content before the
  first marker is the root. Cross-link with `[[slug]]`. A small single-topic plan may be one page.
- 6+ pages → group them; no flat one-level list.
- One topic per page, ≤300 words; longer → split. A page name says what it holds.
- Reads top to bottom: a page never depends on a page below it.
- No filler. Never drop a detail that builds understanding; explain the mental model.
  No abbreviations I didn't use. Simple, direct English (ASD-STE100 style).
- Options as lists or comparison tables, never prose. No `[[links]]` inside tables
  (renders broken) — use a list.

**Diagrams**
- Never ASCII diagrams — in plans, docs, or chat. Render an image.
- Default tools:
  - Flows/sequences: Mermaid, left-to-right, keep the `.mmd` next to the PNG:
    `npx --no-install @mermaid-js/mermaid-cli -i x.mmd -o x.png -b white -s 3 -q`
  - DB schemas: Graphviz `dot -Tpng -Gdpi=130`, `splines=polyline`.
- When neither fits (e.g. architecture with icons, timelines, UI mockups, charts), look for
  a better tool — an installed MCP (e.g. Excalidash), a CLI, or a library. Prefer ones that
  render locally from a text source; keep that source next to the PNG. Say which tool you
  picked and why.
- One idea per diagram, readable at a glance. Too many boxes → split into several.
- Draw only what the idea needs. A system that doesn't change can appear as one plain box
  for context; never expand its internals.
- Before attaching, open every rendered PNG and look at it. Fix overlapping or crossing
  lines, cut-off or tiny text, tangled arrows, and crowded layouts. Re-render until it's clean.
- Attach with `plan_review_attach_image` and reference the returned `/api/images/…` URL.

**Feedback on how plans are written**
When I reject or comment on a plan's *form* (structure, length, wording, diagrams,
format) — not its content — that rule belongs here. Propose an exact edit to this
section of `~/.claude/CLAUDE.md` in the same turn; apply it after I approve. Keep it short:
sharpen or replace a rule instead of piling on new ones.

## Delegation

Two kinds of work, two sets of agents. Spawn tree agents without a `name`, so they
run as plain subagents (named ones can become agent-team teammates, which can't nest).
Every agent reports to the one that spawned it.

**Research** — when I ask to research/investigate something:
- Split it into independent areas; spawn one `research-lead` (Opus medium) per area,
  in parallel, each with a full brief.
- A lead uses `research-aggregator` (Sonnet high, judgment-heavy branches) or
  `research-aggregator-light` (Sonnet medium, simple collection) per branch, or a
  `research-worker` (Haiku) swarm directly when there is one branch.
- Workers: 5–50 per purpose, one small task each, fresh per task, never reused.
  Haiku is cheap only under 100k prompt tokens (5× price above).
- You present the result to me — usually as a plan.

**Implementation** — one PR brief per implementer. Pick by **risk first, then
complexity**; start at the lowest level that fits, not at the top.

| Agent | Use when |
|---|---|
| `impl-sonnet-medium` | Mechanical and fully specified: renames, config, a field that follows an existing pattern, test-only changes |
| `impl-sonnet-high` | **Default.** Standard feature work in one module with a clear brief |
| `impl-sonnet-xhigh` | Contained but tricky logic — algorithms, parsing, state machines, a hard bug with a repro; small blast radius |
| `impl-opus-medium` | Risky or shared code with a settled design — shared libraries, public APIs, schema migrations, cross-module changes |
| `impl-opus-high` | High-stakes or ambiguous — design choices inside the PR, unknown root cause across systems, security, live data, performance |

Selection rules:
- **Risk** = what breaks if it's wrong. Shared code, migrations, auth/payments, live
  data → Opus, whatever the size.
- **Complexity** = how much reasoning the change needs, not how many lines. A big
  mechanical diff stays on Sonnet medium.
- **Escalate one step** when an implementer fails (tests still red after its own
  retries, or it reports the task is harder than briefed). Don't retry at the same level.
- Unclear brief → fix the brief, don't buy a bigger model.

## Showing files (Herdr)

When `HC_TERMINAL_ID` is set (you run inside Herdr) and you point me at code or a
doc I should look at, open it instead of only printing the path:
`herdr-show <file[:from[-to]]>... --note "<what to look at>"`. It opens a
read-only viewer beside your terminal (one viewer per agent, one tab per file;
showing a file again updates its tab) and leaves focus on your terminal. Use it
for the few places that matter, not for every path you mention.
`herdr-show --close` closes your viewer.

## Status for the Herdr queue

When `HC_TERMINAL_ID` is set, end every turn that stops for me (or finishes) with
`herdr-status <kind> "<one sentence>"`, run as your last command. Kinds:
`answer` (you asked me something), `blocked` (you can't go on: access, broken CI, a
service down), `review` (finished work for me to check), `done` (finished, nothing
needed), `waiting` (waiting on CI, a deploy or a job, not on me). The sentence says
what I must do, or what you did. Permission prompts and your question tool are
detected without it; if you forget, a small model guesses the kind.
