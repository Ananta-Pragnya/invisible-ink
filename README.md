# invisible-ink

Finds text a web page hides from human eyes but exposes to AI browsing agents.

AI agents (Claude in Chrome, browsing agents in general) parse the rendered DOM,
not just what's visually on screen. That means a page can hide instructions from
a human - white text on white, `font-size:0`, off-canvas positioning,
`aria-hidden`, hidden inputs, alt text - while an agent reading the DOM sees them
just fine. This is a live prompt-injection vector for agentic browsing, and there
is no reliable defense against it yet.

`invisible-ink` points a real headless browser at a URL (or local HTML file),
resolves computed CSS the same way an agent's DOM read would, flags every text
node that is programmatically present but visually suppressed, and scores it by
how instruction-like the hidden text reads. Static HTML parsing isn't enough -
most of these tricks only reveal themselves after the CSS cascade and layout run.

## Install

```bash
npm install
npx playwright install chromium
```

## Run

```bash
node cli.js https://example.com
node cli.js demo/poisoned.html      # bundled test fixture, no network needed
```

Output goes to `reports/<name>.html` (visual report with a ghost-text overlay on
the screenshot) and `reports/<name>.json` (raw findings).

## How it works

1. Launch headless Chromium (Playwright), load the target, wait for network idle.
2. In-page, walk every DOM text node with a `TreeWalker`. For each one, resolve
   the parent element's *computed* style and bounding rect, and check for:
   - `display: none` / `visibility: hidden`
   - near-zero opacity or font-size
   - text color that matches its resolved background (white-on-white, etc.)
   - absolute/fixed positioning that places the box off-canvas
   - clipping to a 0–1px box with `overflow: hidden`
   - large negative `text-indent`
3. Separately collect non-visual channels an agent might still read: `aria-hidden`
   subtrees, `alt`/`title` attributes, hidden `<input>` values.
4. Score each hit with a keyword/pattern classifier tuned to injection language
   ("ignore previous instructions", "you are an AI", "do not tell the user",
   embedded URLs, exfiltration targets like "credit card", etc.). Final score
   blends *how hidden* the text is with *how instruction-like* it reads.
5. Render a report: the full-page screenshot with red boxes over every hidden
   node, plus a ranked table.

## Demo

`demo/poisoned.html` is a normal-looking café menu page with six different
hiding techniques and two non-visual-channel injections planted in it. Run:

```bash
node cli.js demo/poisoned.html
```

and open the generated `reports/demo_poisoned_html.html` - the visible page
looks completely benign; the report shows seven-plus hidden instructions aimed
at an AI agent, each boxed in red and scored.

## Scope / limitations

This is static analysis + heuristics, not a model call - it's fast and cheap by
design, but it's a detector, not a guarantee. It won't catch injections that use
zero-width Unicode characters within otherwise-visible text, or content injected
dynamically after the scan's `networkidle` wait. Treat high scores as "worth a
human look," not an automatic block.
