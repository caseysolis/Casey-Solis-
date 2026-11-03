// Render test-results/ledger.jsonl as docs/TEST_LEDGER.md
import fs from 'node:fs';
const rows = fs.readFileSync('test-results/ledger.jsonl', 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
const pass = rows.filter((r) => r.pass).length;
let md = `# Rendered-site control ledger\n\nGenerated from \`npm run test:browser\` on ${new Date().toISOString().slice(0, 10)}. ${pass}/${rows.length} checks passed.\n\nEnvironment: ${esc(rows[0]?.env || '')}. Quotes come from the mock provider; no live-provider result is included here.\n\n| Area | Control / action | Expected observable change | Actual | Result |\n|---|---|---|---|---|\n`;
for (const r of rows) md += `| ${esc(r.area)} | ${esc(r.control)} | ${esc(r.expected)} | ${esc(r.actual)} | ${r.pass ? 'PASS' : 'FAIL'} |\n`;
fs.writeFileSync('docs/TEST_LEDGER.md', md);
console.log(`Wrote docs/TEST_LEDGER.md (${pass}/${rows.length} passed)`);
