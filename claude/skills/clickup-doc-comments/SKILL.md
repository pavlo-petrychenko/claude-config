---
name: clickup-doc-comments
description: Export ALL comments of a ClickUp Doc page (open AND resolved threads, every reply, quoted doc text, reactions, and comment images) to a local comments.md + comments.json + images/ folder. Use when the user shares an app.clickup.com Doc link (/v/dc/... or /docs/...) and wants its comments extracted, reviewed, answered, summarised, or addressed — "get all comments from this doc", "витягни коменти з доки", "address the doc comments", "what did reviewers say on this doc". The public ClickUp API and the ClickUp MCP cannot read Doc comments; this skill goes through the user's logged-in Chrome (Claude in Chrome).
---

# ClickUp Doc comments export

The ClickUp public API has no Doc-comments endpoint. The web app loads a page's comments with one
internal call (`POST frontdoor-prod-*.clickup.com/comment-service/v3/workspaces/<ws>/comments/search`,
body `{"filters":{"parent":{"id":"<pageId>","include_replies":true,"type":"doc"}}}`), which returns
every comment on the page — open and resolved, top-level and replies — in a single response.

`scripts/capture.js` hooks `window.fetch` in the ClickUp tab, makes the app fire that call itself (by
switching the Comments panel tabs), and saves the response. The app's request carries the auth;
the script never reads or returns tokens — keep it that way. Don't replay requests with copied
headers or go looking for tokens in storage.

Files: `scripts/capture.js` (runs in the page), `scripts/render.mjs` (runs locally, Node ≥ 18).

## Steps

1. **Chrome.** Load the Claude in Chrome tools in one ToolSearch call (`tabs_context_mcp`,
   `navigate`, `javascript_tool`, `computer`, `browser_batch`, `tabs_close_mcp`). Call
   `tabs_context_mcp`; if the extension is not connected, stop and tell the user (fix: `/chrome`,
   then `/mcp` → reconnect `claude-in-chrome`).
2. **Open the page** in a new tab of this session's group: `navigate` to the Doc URL, then wait
   ~6 s for the editor to load. A link without a page id opens the doc's default page — that page is
   what gets exported. The export is per page: for several pages, repeat steps 2–4 per page URL.
3. **Capture.** Read `scripts/capture.js` and pass its full contents as `text` to `javascript_tool`.
   It opens the Comments panel if closed, clicks Resolved → Open, waits for the response, collects
   author names from the rendered comments, triggers a download of
   `~/Downloads/clickup-comments-<pageId>-<timestamp>.json`, and returns a summary (counts only).
   - `ok: false` → follow its `hint` (usually: take a screenshot, open the Comments panel by hand
     with the speech-bubble button on the right edge of the doc, run capture.js again — the hook
     stays installed).
   - Check `threadsOpen` / `threadsResolved` against `uiCounts` (the panel's tab badges). A
     mismatch means the response was partial (e.g. pagination on very large pages) — say so; don't
     report the export as complete.
4. **Render.**
   ```bash
   F=$(ls -t ~/Downloads/clickup-comments-<pageId>-*.json | head -1)
   node ~/.claude/skills/clickup-doc-comments/scripts/render.mjs "$F" --out <outDir>
   ```
   Default `<outDir>`: `~/Downloads/clickup-comments/<pageId>` unless the user named a place. It
   writes `comments.md` (Open then Resolved threads, quoted doc text, replies, reactions, resolver,
   images inline), `comments.json` (normalised threads), and `images/` (downloaded; ClickUp
   attachment URLs need no auth). Re-running is idempotent.
5. **Unknown authors.** If the summary lists `unknownUserIds`, resolve them (ClickUp MCP
   `clickup_get_workspace_members` / `clickup_find_member_by_name` if connected; otherwise ask), write
   `{"<id>": "Name"}` to a `users.json` next to the export, and re-run render with `--users users.json`.
6. **Clean up.** Close the tab you opened (`tabs_close_mcp`). Leave the raw export JSON in
   `~/Downloads` unless the user asks to delete it.
7. **Report** the `comments.md` path and counts (open / resolved / replies / images). When the user
   wants the comments analysed or answered, read `comments.md` and view the images with Read.

## Notes

- Reading is safe; never click Resolve, Reply, reactions, or anything that writes to the doc. Posting
  replies to doc comments only when the user explicitly asks, per their global rules.
- `javascript_tool` output that contains URLs with query strings is blocked by the extension — keep
  the in-page return value to counts, and move data through the downloaded file.
- Internal, undocumented API: if ClickUp changes it, re-discover by hooking `fetch` for
  `comments/search` and inspecting the request body and response keys (`comments[]`,
  `comment_threads[]`). Selectors the script relies on: `[data-test="floating-action-menu__item__comments"]`,
  `[data-test^="dashboard-doc-page__comments-tab-count"]`, `button[role="tab"]` labelled Open/Resolved,
  `[data-comment-id]`, `[data-test="task-comment__meta-left"]`.
- Comment model: top-level comment ⇔ `parent === root_parent_id` (the page id); replies point at
  their thread's top comment. `referenced_content` is the highlighted doc text. Body is Quill-style
  ops (`text` + `attributes`, `image`, `tag`, `link_mention`, `link_preview`). Non-positive user ids
  are placeholders (`-2` = "Anyone").
