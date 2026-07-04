'use strict';

// Patterns that show up disproportionately often in prompt-injection payloads
// aimed at AI agents rather than human readers. Each match nudges the
// suspicion score up; the score is capped at 1.0.
const SUSPICIOUS_PATTERNS = [
  { re: /\bignore (all|any|the)?\s*(previous|prior|above)\b/i, weight: 0.4, label: 'override-previous-instructions' },
  { re: /\bdisregard\b.{0,30}\b(previous|prior|above|instructions?)\b/i, weight: 0.4, label: 'override-previous-instructions' },
  { re: /\byou are (an|a)\s*(ai|assistant|agent|bot|llm)\b/i, weight: 0.35, label: 'addresses-the-ai' },
  { re: /\b(system|developer)\s*(prompt|message|instruction)s?\b/i, weight: 0.3, label: 'system-prompt-reference' },
  { re: /\bnew\s+instructions?\b/i, weight: 0.3, label: 'new-instructions' },
  { re: /\bdo not (tell|inform|mention|alert|notify)\b.{0,30}\buser\b/i, weight: 0.45, label: 'conceal-from-user' },
  { re: /\bwithout (telling|informing|asking)\b.{0,20}\buser\b/i, weight: 0.45, label: 'conceal-from-user' },
  { re: /\bact as\b/i, weight: 0.2, label: 'role-override' },
  { re: /\boverride\b/i, weight: 0.2, label: 'override' },
  { re: /\bjailbreak\b/i, weight: 0.4, label: 'jailbreak-reference' },
  { re: /\breveal (your|the) (system|hidden|secret)\b/i, weight: 0.4, label: 'exfiltrate-prompt' },
  { re: /\bassistant\s*[:=]/i, weight: 0.25, label: 'fake-role-turn' },
  { re: /\buser\s*[:=]/i, weight: 0.2, label: 'fake-role-turn' },
  { re: /<\|.*?\|>/, weight: 0.35, label: 'special-token-syntax' },
  { re: /\bexecute\b.{0,20}\b(command|code|script|action)\b/i, weight: 0.3, label: 'execute-instruction' },
  { re: /\bnavigate to\b|\bclick (the|on)\b|\bsubmit (this|the) form\b/i, weight: 0.25, label: 'navigation-instruction' },
  { re: /https?:\/\/\S+/i, weight: 0.15, label: 'embedded-url' },
  { re: /\b(password|credit card|ssn|social security|api key|secret key)\b/i, weight: 0.35, label: 'exfiltration-target' },
  { re: /\bfor (ai|llm|agents?|bots?) only\b/i, weight: 0.4, label: 'ai-only-audience' },
  { re: /\bthis is (a|an) (test|instruction) for\b/i, weight: 0.3, label: 'meta-instruction' },
];

function scoreText(text) {
  if (!text) return { score: 0, matches: [] };
  const matches = [];
  let score = 0;
  for (const p of SUSPICIOUS_PATTERNS) {
    if (p.re.test(text)) {
      matches.push(p.label);
      score += p.weight;
    }
  }
  return { score: Math.min(1, score), matches };
}

module.exports = { scoreText, SUSPICIOUS_PATTERNS };
