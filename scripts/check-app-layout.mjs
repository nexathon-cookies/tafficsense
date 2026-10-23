import { access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const requiredFiles = [
  "ai/AGENTS.md",
  "ai/rules.md",
  "docs/plan.md",
  "docs/progress.md",
];
const targets = ["apps/web", "apps/mobile", "packages/shared"];

const missing = [];

for (const target of targets) {
  for (const file of requiredFiles) {
    try {
      await access(resolve(root, target, file));
    } catch {
      missing.push(`${target}/${file}`);
    }
  }
}

if (missing.length > 0) {
  console.error("App documentation layout is incomplete:");
  for (const file of missing) {
    console.error(`- ${file}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `App documentation layout is valid for ${targets.length} targets (${requiredFiles.length} required files each).`,
  );
}
