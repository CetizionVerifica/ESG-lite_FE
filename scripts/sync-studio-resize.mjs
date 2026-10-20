#!/usr/bin/env node
/* eslint-env node */
// DS-10 · the resize engine mirror. ESG-lite src/studio/resize/engine.ts is the source;
// ESG-lite_FE src/lib/studio/resize.ts is a byte-for-byte copy (never edit it here).
//
//   npm run sync:studio-resize           copy the engine from the ESG-lite checkout and write
//                                        src/lib/studio/resizeHash.ts (RESIZE_HASH, as ESG-lite's
//                                        src/studio/resize/hash.ts)
//   npm run sync:studio-resize -- check  fail when resize.ts doesn't hash to RESIZE_HASH
//
// Checkout: --be=<dir> / STUDIO_BE_DIR (default ../ESG-lite).
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const args = Object.fromEntries(process.argv.slice(2).map((a) => (a.startsWith("--") ? a.slice(2).split("=") : [a, true])));
const FE_FILE = path.join(ROOT, "src/lib/studio/resize.ts");
const HASH_FILE = path.join(ROOT, "src/lib/studio/resizeHash.ts");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");
const readHash = () => (existsSync(HASH_FILE) ? (/RESIZE_HASH = "([^"]*)"/.exec(readFileSync(HASH_FILE, "utf8"))?.[1] ?? null) : null);

if (args.check) {
  const want = readHash();
  const got = existsSync(FE_FILE) ? sha(readFileSync(FE_FILE)) : null;
  if (!want || want !== got) {
    console.error(`resize.ts hashes to ${got}, RESIZE_HASH is ${want}: run npm run sync:studio-resize (never edit resize.ts by hand)`);
    process.exit(1);
  }
  console.log(`resize mirror ok (${want.slice(0, 12)})`);
  process.exit(0);
}

const be = path.resolve(args.be || process.env.STUDIO_BE_DIR || path.join(ROOT, "../ESG-lite"));
const src = path.join(be, "src/studio/resize/engine.ts");
if (!existsSync(src)) {
  console.error(`No ESG-lite checkout with src/studio/resize/engine.ts at ${be} (pass --be=<dir>)`);
  process.exit(1);
}
const bytes = readFileSync(src);
const hash = sha(bytes);
const beHash = /RESIZE_HASH = "([^"]*)"/.exec(readFileSync(path.join(be, "src/studio/resize/hash.ts"), "utf8"))?.[1];
if (beHash !== hash) {
  console.error(`ESG-lite's engine.ts hashes to ${hash} but its hash.ts says ${beHash}: update ESG-lite first`);
  process.exit(1);
}
writeFileSync(FE_FILE, bytes);
writeFileSync(
  HASH_FILE,
  `/**
 * RESIZE_HASH: sha256 of src/lib/studio/resize.ts, the byte-for-byte mirror of ESG-lite
 * src/studio/resize/engine.ts, written by \`npm run sync:studio-resize\`. ESG-lite's
 * src/studio/resize/hash.ts carries the same value.
 */
export const RESIZE_HASH = "${hash}";
`,
);
console.log(`resize mirror synced (${hash.slice(0, 12)})`);
