'use strict';

const { chromium } = require('playwright');
const { scoreText } = require('./heuristics');

// Runs inside the page context. Walks every text node in the DOM, resolves
// computed style on its parent element (this is why we need a real browser
// and not just an HTML parser: a lot of hiding techniques only exist after
// CSS cascades and layout run), and flags text that is programmatically
// present but not perceivable by a human looking at the rendered page.
function collectPageText() {
  function parseRgb(str) {
    if (!str) return null;
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    return { r: parts[0], g: parts[1], b: parts[2], a: parts.length > 3 ? parts[3] : 1 };
  }

  function relLuminance({ r, g, b }) {
    const chan = (c) => {
      const v = c / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  }

  function effectiveBackground(el) {
    let node = el;
    while (node) {
      const cs = window.getComputedStyle(node);
      const bg = parseRgb(cs.backgroundColor);
      if (bg && bg.a > 0.05) return bg;
      node = node.parentElement;
    }
    return { r: 255, g: 255, b: 255, a: 1 };
  }

  const results = [];
  const nonVisual = [];

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    const text = node.textContent.trim();
    if (!text || text.length < 3) continue;
    const el = node.parentElement;
    if (!el) continue;

    const cs = window.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    const reasons = [];

    if (cs.display === 'none') reasons.push({ type: 'display-none', confidence: 0.6 });
    if (cs.visibility === 'hidden' || cs.visibility === 'collapse') reasons.push({ type: 'visibility-hidden', confidence: 0.6 });

    const opacity = parseFloat(cs.opacity);
    if (!Number.isNaN(opacity) && opacity <= 0.05) reasons.push({ type: 'near-zero-opacity', confidence: 0.7 });

    const fontSize = parseFloat(cs.fontSize);
    if (!Number.isNaN(fontSize) && fontSize <= 1) reasons.push({ type: 'zero-font-size', confidence: 0.8 });

    // Text-color / background-color camouflage (e.g. white-on-white).
    const color = parseRgb(cs.color);
    if (color) {
      const bg = effectiveBackground(el);
      const diff = Math.abs(relLuminance(color) - relLuminance(bg));
      if (diff < 0.03 && color.a > 0.5) reasons.push({ type: 'color-matches-background', confidence: 0.9 });
    }

    // Positioned off-canvas: the classic "left: -9999px" trick.
    const posAbs = cs.position === 'absolute' || cs.position === 'fixed';
    if (posAbs && (rect.right < -50 || rect.bottom < -50 || rect.left > window.innerWidth + 500 || rect.top > document.documentElement.scrollHeight + 500)) {
      reasons.push({ type: 'positioned-off-canvas', confidence: 0.8 });
    }

    // Clipped to a 0/1px box (visually hidden but screen-reader/DOM readable).
    if ((rect.width <= 1 || rect.height <= 1) && (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.overflowY === 'hidden')) {
      reasons.push({ type: 'clipped-to-zero-size', confidence: 0.8 });
    }

    // Huge negative text-indent hides text while keeping the box visible.
    const textIndent = parseFloat(cs.textIndent);
    if (!Number.isNaN(textIndent) && textIndent < -999) reasons.push({ type: 'negative-text-indent', confidence: 0.8 });

    if (reasons.length > 0) {
      const best = reasons.reduce((a, b) => (b.confidence > a.confidence ? b : a));
      results.push({
        text,
        tag: el.tagName.toLowerCase(),
        reasons: reasons.map((r) => r.type),
        visibilityConfidence: best.confidence,
        rect: {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: Math.max(rect.width, 40),
          height: Math.max(rect.height, 14),
        },
      });
    }
  }

  // Attributes read by agents/screen readers but never rendered as visible text.
  const attrSelectors = ['[aria-hidden="true"] *', 'img[alt]', '[title]', '[aria-label]', 'input[type="hidden"]', '[data-*]'];
  const seen = new Set();

  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => {
    const text = el.textContent.trim();
    if (text && text.length >= 3 && !seen.has(text)) {
      seen.add(text);
      nonVisual.push({ text, source: 'aria-hidden-subtree', tag: el.tagName.toLowerCase() });
    }
  });

  document.querySelectorAll('img[alt]').forEach((el) => {
    const text = el.getAttribute('alt').trim();
    const rect = el.getBoundingClientRect();
    const invisible = rect.width <= 1 || rect.height <= 1 || window.getComputedStyle(el).display === 'none' || window.getComputedStyle(el).visibility === 'hidden';
    if (text && text.length >= 3 && invisible && !seen.has(text)) {
      seen.add(text);
      nonVisual.push({ text, source: 'alt-text-on-invisible-image', tag: 'img' });
    }
  });

  document.querySelectorAll('input[type="hidden"]').forEach((el) => {
    const text = (el.getAttribute('value') || '').trim();
    if (text && text.length >= 3 && !seen.has(text)) {
      seen.add(text);
      nonVisual.push({ text, source: 'hidden-input-value', tag: 'input' });
    }
  });

  document.querySelectorAll('[title]').forEach((el) => {
    const text = el.getAttribute('title').trim();
    if (text && text.length >= 8 && !seen.has(text)) {
      seen.add(text);
      nonVisual.push({ text, source: 'title-attribute', tag: el.tagName.toLowerCase() });
    }
  });

  return { suppressed: results, nonVisual };
}

async function scan(target, { headless = true, viewport = { width: 1280, height: 800 } } = {}) {
  const url = /^[a-z]+:\/\//i.test(target) ? target : `file://${target.replace(/\\/g, '/')}`;

  const browser = await chromium.launch({ headless });
  try {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 }).catch(async () => {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    });

    const { suppressed, nonVisual } = await page.evaluate(collectPageText);
    const screenshotBuffer = await page.screenshot({ fullPage: true });
    const screenshot = screenshotBuffer.toString('base64');

    const findings = suppressed
      .map((item) => {
        const { score, matches } = scoreText(item.text);
        const finalScore = Math.min(1, item.visibilityConfidence * 0.4 + score * 0.6);
        return { ...item, suspicionScore: score, suspicionMatches: matches, finalScore };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    const nonVisualFindings = nonVisual
      .map((item) => {
        const { score, matches } = scoreText(item.text);
        return { ...item, suspicionScore: score, suspicionMatches: matches };
      })
      .sort((a, b) => b.suspicionScore - a.suspicionScore);

    return { target: url, screenshot, findings, nonVisualFindings };
  } finally {
    await browser.close();
  }
}

module.exports = { scan };
