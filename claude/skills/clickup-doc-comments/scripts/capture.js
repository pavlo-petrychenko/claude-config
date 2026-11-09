// Runs inside a ClickUp Doc page tab via the Claude in Chrome `javascript_tool`.
// Pass this whole file as the `text` argument. It:
//   1. hooks window.fetch to capture the app's own comment-service `comments/search`
//      response for the current page (the app's request carries auth; this script never reads tokens),
//   2. opens the Comments panel and switches Resolved -> Open to make the app fire that request,
//   3. collects author names from the rendered comments,
//   4. downloads one JSON export to ~/Downloads and returns a short summary (no URLs, no comment text).
await (async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const waitFor = async (fn, timeoutMs = 8000, stepMs = 250) => {
    const end = Date.now() + timeoutMs;
    while (Date.now() < end) {
      const v = fn();
      if (v) return v;
      await sleep(stepMs);
    }
    return null;
  };

  // URL shapes: /<ws>/v/dc/<docId>/<pageId> and /<ws>/docs/<docId>/<pageId>; pageId may be absent.
  const segments = location.pathname.split('/').filter(Boolean);
  const dcIdx = segments.findIndex((p) => p === 'dc' || p === 'docs');
  const docId = dcIdx >= 0 ? segments[dcIdx + 1] || null : null;
  let pageId = dcIdx >= 0 ? segments[dcIdx + 2] || null : null;

  if (!window.__cuCommentsHook) {
    window.__cuCommentsCaptures = [];
    const prevFetch = window.fetch;
    window.fetch = async function (input, init) {
      const url = typeof input === 'string' ? input : input && input.url;
      const res = await prevFetch.apply(this, arguments);
      if (url && /\/comment-service\/v\d+\/workspaces\/\d+\/comments\/search/.test(url)) {
        let body = init && init.body;
        if (!body && input instanceof Request) {
          try { body = await input.clone().text(); } catch (e) { /* ignore */ }
        }
        res.clone().text().then((text) => {
          let parsedBody = null;
          try { parsedBody = JSON.parse(body); } catch (e) { /* ignore */ }
          window.__cuCommentsCaptures.push({ at: Date.now(), body: parsedBody, text });
        });
      }
      return res;
    };
    window.__cuCommentsHook = true;
  }

  const countSpan = () => document.querySelector('[data-test^="dashboard-doc-page__comments-tab-count"]');
  if (!countSpan()) {
    const toggle = document.querySelector('[data-test="floating-action-menu__item__comments"]');
    if (!toggle) {
      return { ok: false, error: 'comments-toggle-not-found', hint: 'Open the Comments panel manually (screenshot + click), then run capture.js again.' };
    }
    toggle.click();
    if (!(await waitFor(countSpan, 8000))) {
      return { ok: false, error: 'comments-panel-did-not-open', hint: 'Open the Comments panel manually, then run capture.js again.' };
    }
  }

  const tabButton = (label) => [...document.querySelectorAll('button[role="tab"]')]
    .find((b) => new RegExp(`^${label}\\b`).test((b.innerText || '').trim()));

  const names = {};
  const collectNames = () => {
    for (const el of document.querySelectorAll('[data-comment-id]')) {
      const nameEl = el.querySelector('[data-test="task-comment__meta-left"]');
      const name = nameEl && nameEl.innerText.trim();
      if (name) names[el.getAttribute('data-comment-id')] = name;
    }
  };

  const uiCounts = {};
  for (const span of document.querySelectorAll('[data-test^="dashboard-doc-page__comments-tab-count"]')) {
    const tab = span.closest('button[role="tab"]');
    const label = tab ? (tab.innerText || '').replace(/\d+/g, '').trim() : span.getAttribute('data-test');
    uiCounts[label] = Number(span.innerText.trim()) || 0;
  }

  const startedAt = Date.now();
  const resolvedTab = tabButton('Resolved');
  if (resolvedTab) {
    resolvedTab.click();
    await sleep(2000);
    collectNames();
  }
  const openTab = tabButton('Open');
  if (openTab) openTab.click();

  const capture = await waitFor(() => {
    const fresh = window.__cuCommentsCaptures.filter((c) => c.at >= startedAt - 500);
    const forPage = fresh.filter((c) => {
      const parent = c.body && c.body.filters && c.body.filters.parent;
      return parent && (!pageId || parent.id === pageId);
    });
    return forPage[forPage.length - 1] || null;
  }, 10000);
  await sleep(1500);
  collectNames();

  if (!capture) {
    return { ok: false, error: 'no-comments-search-captured', hint: 'Click the Open/Resolved tabs in the Comments panel once, then run capture.js again (the hook stays installed).', uiCounts };
  }

  const data = JSON.parse(capture.text);
  const comments = data.comments || [];
  if (!pageId) pageId = capture.body.filters.parent.id;

  const users = {};
  for (const c of comments) {
    if (names[c.id]) users[c.userid] = names[c.id];
    for (const op of c.comment || []) {
      if (op.type === 'tag' && op.user && op.user.id && op.user.username) users[op.user.id] = op.user.username;
    }
  }
  const unknownUserIds = [...new Set(comments.flatMap((c) => [c.userid, c.resolved_by]).filter((id) => id && !users[id]))];

  const isTop = (c) => c.parent === c.root_parent_id;
  const top = comments.filter(isTop);
  const exportedAt = new Date().toISOString();
  const payload = {
    source_url: location.origin + location.pathname,
    workspace_id: (location.pathname.match(/^\/(\d+)\//) || [])[1] || null,
    doc_id: docId,
    page_id: pageId,
    page_title: document.title.split(' | ')[0],
    exported_at: exportedAt,
    ui_counts: uiCounts,
    users,
    comments,
    comment_threads: data.comment_threads || [],
  };

  const fileName = `clickup-comments-${pageId}-${exportedAt.replace(/[:.]/g, '-')}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);

  return {
    ok: true,
    fileName,
    pageTitle: payload.page_title,
    threads: top.length,
    threadsOpen: top.filter((c) => !c.resolved).length,
    threadsResolved: top.filter((c) => c.resolved).length,
    replies: comments.length - top.length,
    images: comments.reduce((n, c) => n + (c.comment || []).filter((op) => op.type === 'image').length, 0),
    uiCounts,
    namedUsers: Object.keys(users).length,
    unknownUserIds,
  };
})();
