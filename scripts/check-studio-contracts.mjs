#!/usr/bin/env node
// DS-0: compares this repo's copy of the Design Studio contract names
// (src/lib/studio/contracts.snapshot.json) with the backend's
// (ESG-lite ci/studio-contracts.json) and prints every difference.
//
//   node scripts/check-studio-contracts.mjs [path to ESG-lite]   (default: ../ESG-lite)
//   npm run check:studio-contracts
//
// The mirror itself (src/lib/studio/contracts.ts) is compared with the copy
// by src/lib/studio/contracts.test.ts (npm test).
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const backend = resolve(process.argv[2] ?? join(root, "../ESG-lite"));
const read = (file) => JSON.parse(readFileSync(file, "utf8"));

/** Every leaf as "path = value", so the two files diff line by line. */
function flatten(value, prefix = "", out = []) {
  if (Array.isArray(value)) value.forEach((v, i) => (v && typeof v === "object" ? flatten(v, `${prefix}[${i}]`, out) : out.push(`${prefix} = ${JSON.stringify(v)}`)));
  else if (value && typeof value === "object") for (const [k, v] of Object.entries(value)) flatten(v, prefix ? `${prefix}.${k}` : k, out);
  else out.push(`${prefix} = ${JSON.stringify(value)}`);
  return out;
}

const fe = new Set(flatten(read(join(root, "src/lib/studio/contracts.snapshot.json"))));
const be = new Set(flatten(read(join(backend, "ci/studio-contracts.json"))));
const onlyBe = [...be].filter((x) => !fe.has(x));
const onlyFe = [...fe].filter((x) => !be.has(x));
for (const x of onlyBe) console.log(`- backend only: ${x}`);
for (const x of onlyFe) console.log(`+ FE only:      ${x}`);
if (onlyBe.length || onlyFe.length) {
  console.error("The FE contract copy differs from the backend's: copy ESG-lite ci/studio-contracts.json and update src/lib/studio/contracts.ts.");
  process.exit(1);
}
console.log("Design Studio contracts: FE copy matches the backend.");
