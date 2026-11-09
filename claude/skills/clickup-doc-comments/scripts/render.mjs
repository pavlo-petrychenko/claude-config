#!/usr/bin/env node
// Turns a capture.js export into comments.md + comments.json + images/.
// Usage: node render.mjs <export.json> [--out <dir>] [--users <users.json>]
//   --users: {"<userId>": "Full Name"} to fill authors capture.js could not name.
import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i].startsWith('--')) flags[args[i]] = args[++i];
  else positional.push(args[i]);
}
const inputPath = positional[0];
const flag = (name) => flags[name] || null;
if (!inputPath) {
  console.error('Usage: node render.mjs <export.json> [--out <dir>] [--users <users.json>]');
  process.exit(1);
}

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
const outDir = path.resolve(flag('--out') || path.join(path.dirname(inputPath), `clickup-comments-${data.page_id}`));
const imagesDir = path.join(outDir, 'images');
fs.mkdirSync(imagesDir, { recursive: true });

const users = { ...data.users };
const usersPath = flag('--users');
if (usersPath) Object.assign(users, JSON.parse(fs.readFileSync(usersPath, 'utf8')));
// Non-positive ids are ClickUp placeholders (e.g. -2 = the "Anyone" assignee).
const isRealUser = (id) => Number(id) > 0;
const userName = (id) => (isRealUser(id) ? users[id] || `user:${id}` : null);

const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (ms) => {
  if (!ms) return null;
  const d = new Date(Number(ms));
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const images = new Map();
const imageFile = (img) => {
  const file = (img.id || `${img.parent_id}-${images.size}.${img.extension || 'png'}`).replace(/[^\w.-]/g, '_');
  images.set(file, { file, url: img.url || img.thumbnail_large, title: img.title });
  return `images/${file}`;
};

// Comment bodies are Quill-style ops: inline text with attributes, and "\n" ops
// whose attributes (blockquote, list, code-block) format the line they close.
const renderOps = (ops = []) => {
  const lines = [];
  let line = '';
  const closeLine = (attrs = {}) => {
    let prefix = '';
    if (attrs.blockquote) prefix = '> ';
    else if (attrs.list === 'bullet') prefix = '- ';
    else if (attrs.list === 'ordered') prefix = '1. ';
    else if (attrs.list === 'checked' || attrs.list === 'unchecked') prefix = `- [${attrs.list === 'checked' ? 'x' : ' '}] `;
    lines.push(prefix + line);
    line = '';
  };
  for (const op of ops) {
    const attrs = op.attributes || {};
    if (op.type === 'image' && op.image) {
      line += `![${op.image.title || 'image'}](${imageFile(op.image)})`;
      continue;
    }
    if (op.type === 'tag' && op.user) {
      line += `@${op.user.username || userName(op.user.id)}`;
      continue;
    }
    if (op.type === 'link_mention' || op.type === 'link_preview') {
      const link = op[op.type] || {};
      line += link.url ? `<${link.url}>` : '';
      continue;
    }
    if (op.type && op.type !== 'text' && !op.text) {
      line += `[${op.type}]`;
      continue;
    }
    const parts = String(op.text ?? '').split('\n');
    parts.forEach((part, i) => {
      if (i > 0) closeLine(attrs);
      if (!part) return;
      let t = part;
      if (attrs.code) t = `\`${t}\``;
      if (attrs.bold) t = `**${t}**`;
      if (attrs.italic) t = `*${t}*`;
      if (attrs.strike) t = `~~${t}~~`;
      if (attrs.link) t = `[${t}](${attrs.link})`;
      line += t;
    });
  }
  if (line) lines.push(line);
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const comments = data.comments || [];
const byId = new Map(comments.map((c) => [c.id, c]));
const isTop = (c) => c.parent === c.root_parent_id;
const rootOf = (c) => {
  let cur = c;
  for (let i = 0; i < 20 && cur && !isTop(cur); i += 1) cur = byId.get(cur.parent);
  return cur;
};
const byDate = (a, b) => Number(a.date) - Number(b.date);

const threads = comments.filter(isTop).sort(byDate).map((top) => ({
  top,
  replies: comments.filter((c) => !isTop(c) && rootOf(c) === top).sort(byDate),
}));
const orphans = comments.filter((c) => !isTop(c) && !rootOf(c));

// Reactions come as hex codepoints, e.g. "2764-FE0F".
const emoji = (code) => {
  try { return String.fromCodePoint(...String(code).split('-').map((h) => parseInt(h, 16))); } catch (e) { return String(code); }
};
const reactionsText = (c) => {
  const counts = new Map();
  for (const r of c.reactions || []) counts.set(r.reaction, (counts.get(r.reaction) || 0) + 1);
  return counts.size ? ` · reactions: ${[...counts].map(([code, n]) => `${emoji(code)}×${n}`).join(' ')}` : '';
};

const md = [];
const open = threads.filter((t) => !t.top.resolved);
const resolved = threads.filter((t) => t.top.resolved);
md.push(`# Comments: ${data.page_title}`);
md.push('');
md.push(`- Source: ${data.source_url}`);
md.push(`- Exported: ${data.exported_at}`);
md.push(`- Threads: ${threads.length} (${open.length} open, ${resolved.length} resolved) · replies: ${comments.length - threads.length} · images: …`);
md.push('');

const indent = (text, by) => text.split('\n').map((l) => (l ? by + l : l)).join('\n');
const renderThread = (t, n) => {
  const c = t.top;
  const status = c.resolved ? 'RESOLVED' : 'OPEN';
  md.push(`### ${n}. [${status}] ${userName(c.userid)} · ${fmtDate(c.date)}`);
  md.push('');
  if (c.referenced_content) {
    md.push(indent(`Quoted from doc: "${c.referenced_content.trim()}"`, '> '));
    md.push('');
  }
  md.push(renderOps(c.comment) || '_(empty)_');
  md.push('');
  const meta = [];
  if (c.resolved) meta.push(`resolved by ${userName(c.resolved_by) || 'unknown'}${c.date_resolved ? ` on ${fmtDate(c.date_resolved)}` : ''}`);
  if (isRealUser(c.assignee)) meta.push(`assigned to ${userName(c.assignee)}`);
  const rx = reactionsText(c);
  if (meta.length || rx) md.push(`_${meta.join(' · ')}${rx}_`.replace(/^_ · /, '_'), '');
  if (t.replies.length) {
    md.push(`**Replies (${t.replies.length}):**`);
    md.push('');
    for (const r of t.replies) {
      md.push(`- **${userName(r.userid)}** · ${fmtDate(r.date)}${reactionsText(r)}`);
      md.push(indent(renderOps(r.comment) || '_(empty)_', '  '));
    }
    md.push('');
  }
  md.push('---');
  md.push('');
};

md.push('## Open');
md.push('');
open.forEach((t, i) => renderThread(t, i + 1));
md.push('## Resolved');
md.push('');
resolved.forEach((t, i) => renderThread(t, open.length + i + 1));
if (orphans.length) {
  md.push('## Replies with a missing parent');
  md.push('');
  for (const r of orphans.sort(byDate)) md.push(`- **${userName(r.userid)}** · ${fmtDate(r.date)}: ${renderOps(r.comment)}`);
  md.push('');
}

const failed = [];
for (const img of images.values()) {
  const target = path.join(imagesDir, img.file);
  if (fs.existsSync(target)) continue;
  try {
    const res = await fetch(img.url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
  } catch (e) {
    failed.push({ file: img.file, url: img.url, error: e.message });
  }
}

const mdText = md.join('\n').replace(`images: …`, `images: ${images.size}`);
fs.writeFileSync(path.join(outDir, 'comments.md'), mdText);

const normalize = (c) => ({
  id: c.id,
  author: userName(c.userid),
  author_id: c.userid,
  date: fmtDate(c.date),
  text: renderOps(c.comment),
  reactions: c.reactions || [],
});
fs.writeFileSync(path.join(outDir, 'comments.json'), JSON.stringify({
  source_url: data.source_url,
  page_title: data.page_title,
  doc_id: data.doc_id,
  page_id: data.page_id,
  exported_at: data.exported_at,
  threads: threads.map((t) => ({
    ...normalize(t.top),
    status: t.top.resolved ? 'resolved' : 'open',
    quoted: t.top.referenced_content || null,
    resolved_by: userName(t.top.resolved_by),
    date_resolved: fmtDate(t.top.date_resolved),
    replies: t.replies.map(normalize),
  })),
}, null, 2));

const unknown = [...new Set(comments.flatMap((c) => [c.userid, c.resolved_by, c.assignee]).filter((id) => isRealUser(id) && !users[id]))];
console.log(JSON.stringify({
  outDir,
  markdown: path.join(outDir, 'comments.md'),
  threads: threads.length,
  open: open.length,
  resolved: resolved.length,
  replies: comments.length - threads.length,
  orphanReplies: orphans.length,
  images: images.size,
  imagesFailed: failed,
  uiCounts: data.ui_counts,
  unknownUserIds: unknown,
}, null, 2));
