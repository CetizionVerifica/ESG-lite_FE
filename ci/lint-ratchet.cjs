// Lint ratchet: the legacy UI carries ~450 ESLint problems, so a whole-repo
// `npm run lint` can't gate PRs yet. Instead no file may get worse: every
// file's problem count on this branch must be <= its count on the base
// branch, and new files must be clean.
//
//   node ci/lint-ratchet.cjs <base-eslint.json> <head-eslint.json>
const fs = require("fs");
const path = require("path");

const load = (file, root) => {
  const counts = new Map();
  for (const r of JSON.parse(fs.readFileSync(file, "utf8"))) {
    const rel = path.relative(root, r.filePath);
    counts.set(rel, { n: r.errorCount + r.warningCount, messages: r.messages });
  }
  return counts;
};

const [baseFile, headFile] = process.argv.slice(2);
const base = load(baseFile, path.resolve(".ci-base"));
const head = load(headFile, path.resolve("."));

let worse = 0;
let total = { base: 0, head: 0 };
for (const [, v] of base) total.base += v.n;
for (const [file, { n, messages }] of head) {
  total.head += n;
  const before = base.get(file)?.n ?? 0;
  if (n > before) {
    worse++;
    console.log(`${file}: ${before} -> ${n} problems`);
    for (const m of messages.slice(0, 10)) {
      console.log(`::error file=${file},line=${m.line}::${m.message} (${m.ruleId})`);
    }
  }
}
console.log(`ESLint problems: base ${total.base}, this branch ${total.head}.`);
if (worse) {
  console.log(`${worse} file(s) gained lint problems. Fix the new ones (old ones may stay).`);
  process.exit(1);
}
console.log("No file gained lint problems.");
