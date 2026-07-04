'use strict';

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreColor(score) {
  // status palette (fixed, never themed) — good / warning / serious / critical
  if (score >= 0.7) return '#d03b3b'; // critical
  if (score >= 0.4) return '#ec835a'; // serious
  if (score >= 0.15) return '#fab219'; // warning
  return '#0ca30c'; // good
}

function renderHtml({ target, screenshot, findings, nonVisualFindings }) {
  const overlays = findings
    .map((f, i) => {
      const color = scoreColor(f.finalScore);
      return `<div class="ghost-box" style="left:${f.rect.x}px;top:${f.rect.y}px;width:${f.rect.width}px;height:${f.rect.height}px;border-color:${color};" title="${escapeHtml(f.text)}">
        <span class="ghost-badge" style="background:${color}">${i + 1}</span>
      </div>`;
    })
    .join('\n');

  const rows = findings
    .map(
      (f, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td><span class="score-dot" style="background:${scoreColor(f.finalScore)}"></span>${f.finalScore.toFixed(2)}</td>
        <td><code>&lt;${escapeHtml(f.tag)}&gt;</code></td>
        <td>${f.reasons.map((r) => `<span class="pill">${escapeHtml(r)}</span>`).join(' ')}</td>
        <td>${f.suspicionMatches.map((m) => `<span class="pill pill-suspect">${escapeHtml(m)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
        <td class="text-cell">${escapeHtml(f.text.slice(0, 200))}${f.text.length > 200 ? '…' : ''}</td>
      </tr>`
    )
    .join('\n');

  const nonVisualRows = nonVisualFindings
    .map(
      (f) => `<tr>
        <td><span class="score-dot" style="background:${scoreColor(f.suspicionScore)}"></span>${f.suspicionScore.toFixed(2)}</td>
        <td><span class="pill">${escapeHtml(f.source)}</span></td>
        <td><code>&lt;${escapeHtml(f.tag)}&gt;</code></td>
        <td>${f.suspicionMatches.map((m) => `<span class="pill pill-suspect">${escapeHtml(m)}</span>`).join(' ') || '<span class="muted">—</span>'}</td>
        <td class="text-cell">${escapeHtml(f.text.slice(0, 200))}${f.text.length > 200 ? '…' : ''}</td>
      </tr>`
    )
    .join('\n');

  const highCount = findings.filter((f) => f.finalScore >= 0.4).length;

  return `<!doctype html>
<html data-theme="auto">
<head>
<meta charset="utf-8">
<title>invisible-ink report — ${escapeHtml(target)}</title>
<style>
  :root {
    --surface-1: #fcfcfb; --page: #f9f9f7; --text-primary: #0b0b0b;
    --text-secondary: #52514e; --muted: #898781; --grid: #e1e0d9; --border: rgba(11,11,11,0.10);
  }
  @media (prefers-color-scheme: dark) {
    :root { --surface-1: #1a1a19; --page: #0d0d0d; --text-primary: #ffffff; --text-secondary: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --border: rgba(255,255,255,0.10); }
  }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; background: var(--page); color: var(--text-primary); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .subtitle { color: var(--text-secondary); font-size: 13px; margin-bottom: 24px; word-break: break-all; }
  .summary { display: flex; gap: 16px; margin-bottom: 24px; }
  .stat { background: var(--surface-1); border: 1px solid var(--border); border-radius: 10px; padding: 12px 18px; }
  .stat .n { font-size: 24px; font-weight: 600; }
  .stat .l { font-size: 12px; color: var(--text-secondary); }
  .viewer { position: relative; display: inline-block; border: 1px solid var(--border); border-radius: 8px; overflow: auto; max-width: 100%; background: var(--surface-1); }
  .viewer img { display: block; max-width: none; }
  .ghost-box { position: absolute; border: 2px solid; border-radius: 3px; background: rgba(208,59,59,0.12); pointer-events: none; }
  .ghost-badge { position: absolute; top: -10px; left: -10px; color: white; font-size: 10px; font-weight: 700; border-radius: 999px; width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; }
  table { border-collapse: collapse; width: 100%; margin-top: 12px; font-size: 13px; background: var(--surface-1); border: 1px solid var(--border); border-radius: 8px; overflow: hidden; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid var(--grid); vertical-align: top; }
  th { color: var(--text-secondary); font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.03em; }
  .num { color: var(--muted); }
  .score-dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 6px; }
  .pill { display: inline-block; background: var(--grid); color: var(--text-secondary); font-size: 11px; padding: 2px 7px; border-radius: 999px; margin: 1px 2px 1px 0; }
  .pill-suspect { background: rgba(208,59,59,0.15); color: #d03b3b; }
  .text-cell { font-family: ui-monospace, monospace; font-size: 12px; max-width: 480px; }
  .muted { color: var(--muted); }
  section { margin-top: 32px; }
  h2 { font-size: 15px; margin-bottom: 4px; }
  .hint { color: var(--text-secondary); font-size: 12px; margin-bottom: 8px; }
</style>
</head>
<body>
  <h1>invisible-ink scan report</h1>
  <div class="subtitle">${escapeHtml(target)}</div>

  <div class="summary">
    <div class="stat"><div class="n">${findings.length}</div><div class="l">hidden text nodes</div></div>
    <div class="stat"><div class="n" style="color:${highCount ? '#d03b3b' : '#0ca30c'}">${highCount}</div><div class="l">high-suspicion (score ≥ 0.4)</div></div>
    <div class="stat"><div class="n">${nonVisualFindings.length}</div><div class="l">non-visual channels (alt/title/aria/hidden input)</div></div>
  </div>

  <section>
    <h2>Ghost text overlay</h2>
    <div class="hint">Red boxes mark text present in the DOM but not visible to a human on this rendered page. Numbers match the table below.</div>
    <div class="viewer">
      <img src="data:image/png;base64,${screenshot}" alt="page screenshot">
      ${overlays}
    </div>
  </section>

  <section>
    <h2>Hidden text findings</h2>
    <table>
      <thead><tr><th>#</th><th>Score</th><th>Element</th><th>Hiding technique</th><th>Suspicious language</th><th>Text</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted">No visually-suppressed text nodes found.</td></tr>'}</tbody>
    </table>
  </section>

  <section>
    <h2>Non-visual channels (alt text, titles, aria-hidden, hidden inputs)</h2>
    <div class="hint">Legitimate most of the time — flagged here only because agents read these attributes and humans generally don't.</div>
    <table>
      <thead><tr><th>Score</th><th>Source</th><th>Element</th><th>Suspicious language</th><th>Text</th></tr></thead>
      <tbody>${nonVisualRows || '<tr><td colspan="5" class="muted">None found.</td></tr>'}</tbody>
    </table>
  </section>
</body>
</html>`;
}

module.exports = { renderHtml };
