# claude-config

My global Claude Code configuration. No secrets.

## Layout

| Path in repo | Goes to |
|---|---|
| `claude/CLAUDE.md` | `~/.claude/CLAUDE.md` |
| `claude/settings.json`, `claude/settings.local.json` | `~/.claude/` |
| `claude/agents/*.md` | `~/.claude/agents/` |
| `claude/skills/*` | `~/.claude/skills/` |
| `claude/memory/registry.toml` | reference only, not linked: the live file has more workspaces |
| `agents-skills/*` | `~/.agents/skills/` |
| `mcp/mcp-servers.template.json` | user MCP servers in `~/.claude.json`, secrets as `${VAR}` |
| `mcp/.env.example` | the variable names for those secrets; copy to `mcp/.env` (git-ignored) |

`install.sh` links everything into place. It also recreates the links into other repos
(cc-memory, excalidash, herdr, langfuse). Dry run by default; `--apply` makes the change and
moves the replaced files to `~/.claude/backups/`.

## Not in this repo, on purpose

- **Machine-specific:** some MCP servers and memory workspaces, the skills that claude.ai syncs
  (`~/.claude/skills/synced/`).
- **Secrets:** `~/.claude.json` as a whole (it holds API keys and app state).
- **Runtime data:** `projects/`, `teams/`, `history.jsonl`, sessions, caches, plugin cache,
  plan-review data, memory indexes.
- **Other repos own these:** the `memory` skill and `/ccmemory` command (cc-memory),
  `excalidash-diagrams` (excalidash), herdr hook and status line, langfuse skills (upstream).
