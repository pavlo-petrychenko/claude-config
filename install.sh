#!/usr/bin/env bash
# Link this repo's config into ~/.claude and ~/.agents.
# Dry run by default. Run with --apply to make the changes.
# Every file that gets replaced is moved to ~/.claude/backups/claude-config-<time>/ first.
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
APPLY=0; [[ "${1:-}" == "--apply" ]] && APPLY=1
BACKUP="$HOME/.claude/backups/claude-config-$(date +%Y%m%d-%H%M%S)"

link() { # link <source> <target>
  local src="$1" dst="$2"
  if [[ -L "$dst" && "$(readlink "$dst")" == "$src" ]]; then echo "ok      $dst"; return; fi
  echo "link    $dst -> $src"
  (( APPLY )) || return 0
  mkdir -p "$(dirname "$dst")"
  if [[ -e "$dst" || -L "$dst" ]]; then
    mkdir -p "$BACKUP/$(dirname "${dst#$HOME/}")"
    mv "$dst" "$BACKUP/${dst#$HOME/}"
  fi
  ln -s "$src" "$dst"
}

# 1. Files owned by this repo
# memory/registry.toml is NOT linked: the live one has more workspaces.
for f in CLAUDE.md settings.json settings.local.json; do
  link "$REPO/claude/$f" "$HOME/.claude/$f"
done
for f in "$REPO"/claude/agents/*.md; do link "$f" "$HOME/.claude/agents/$(basename "$f")"; done
for d in "$REPO"/claude/skills/*/;  do d="${d%/}"; link "$d" "$HOME/.claude/skills/$(basename "$d")"; done
for d in "$REPO"/agents-skills/*/;  do d="${d%/}"; link "$d" "$HOME/.agents/skills/$(basename "$d")"; done

# 2. Links into other repos (they own these files)
P="$HOME/Documents/personal"
link "$P/cc-memory/src/skills/memory"                        "$HOME/.claude/skills/memory"
link "$P/cc-memory/src/commands/ccmemory.md"                 "$HOME/.claude/commands/ccmemory.md"
link "$P/excalidash/mcp-server/skills/excalidash-diagrams"   "$HOME/.claude/skills/excalidash-diagrams"
link "$HOME/.agents/skills/show-me"                          "$HOME/.claude/skills/show-me"
link "$HOME/.config/herdr-app/extras/claude/hooks/herdr-status.mjs" "$HOME/.claude/hooks/herdr-status.mjs"
link "$HOME/.config/herdr-app/extras/claude/statusline-herdr.sh"    "$HOME/.claude/statusline-herdr.sh"
if [[ ! -d "$HOME/.claude/skills-external/langfuse-skills" ]]; then
  echo "clone   langfuse/skills -> ~/.claude/skills-external/langfuse-skills"
  (( APPLY )) && git clone https://github.com/langfuse/skills "$HOME/.claude/skills-external/langfuse-skills"
fi
link "$HOME/.claude/skills-external/langfuse-skills/skills/langfuse" "$HOME/.claude/skills/langfuse"

# 3. MCP servers: only printed, never applied. ~/.claude.json also holds app state.
echo
echo "MCP servers: fill mcp/.env, then run for each server you need:"
echo "  set -a; source mcp/.env; set +a"
echo "  jq -c '.\"<name>\"' mcp/mcp-servers.template.json | envsubst | xargs -0 claude mcp add-json -s user <name>"

(( APPLY )) || echo -e "\nDry run. Nothing changed. Run ./install.sh --apply"
