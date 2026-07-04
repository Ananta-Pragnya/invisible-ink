#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { scan } = require('./src/scanner');
const { renderHtml } = require('./src/report');

function scoreColor(score) {
  if (score >= 0.7) return '\x1b[31m'; // red
  if (score >= 0.4) return '\x1b[33m'; // yellow/orange-ish
  if (score >= 0.15) return '\x1b[33m';
  return '\x1b[32m';
}
const RESET = '\x1b[0m';

async function main() {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node cli.js <url-or-local-html-file> [outDir]');
    console.error('       node cli.js demo/poisoned.html');
    process.exit(1);
  }
  const outDir = process.argv[3] || 'reports';
  const absTarget = /^[a-z]+:\/\//i.test(target) ? target : path.resolve(process.cwd(), target);

  console.log(`Scanning ${target} ...`);
  const result = await scan(absTarget);

  fs.mkdirSync(outDir, { recursive: true });
  const base = target.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'scan';
  const jsonPath = path.join(outDir, `${base}.json`);
  const htmlPath = path.join(outDir, `${base}.html`);

  const { screenshot, ...jsonSafe } = result;
  fs.writeFileSync(jsonPath, JSON.stringify(jsonSafe, null, 2));
  fs.writeFileSync(htmlPath, renderHtml(result));

  console.log('');
  console.log(`Found ${result.findings.length} hidden text node(s), ${result.nonVisualFindings.length} non-visual channel(s).`);
  const top = result.findings.slice(0, 10);
  for (const f of top) {
    const c = scoreColor(f.finalScore);
    console.log(`${c}[${f.finalScore.toFixed(2)}]${RESET} <${f.tag}> ${f.reasons.join(',')} :: ${f.text.slice(0, 80)}`);
  }
  console.log('');
  console.log(`Report: ${htmlPath}`);
  console.log(`JSON:   ${jsonPath}`);
}

main().catch((err) => {
  console.error('Scan failed:', err.message);
  process.exit(1);
});
