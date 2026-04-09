const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function walkJsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(fullPath, out);
      continue;
    }
    if (entry.isFile() && fullPath.endsWith(".js")) {
      out.push(fullPath);
    }
  }
  return out;
}

const root = process.cwd();
const targets = [
  ...walkJsFiles(path.join(root, "src")),
  ...walkJsFiles(path.join(root, "scripts")),
];

if (targets.length === 0) {
  console.log("No JavaScript files found to check.");
  process.exit(0);
}

let failed = false;
for (const file of targets) {
  const result = spawnSync(process.execPath, ["--check", file], {
    stdio: "inherit",
  });
  if (result.status !== 0) {
    failed = true;
  }
}

if (failed) {
  console.error("Syntax check failed.");
  process.exit(1);
}

console.log(`Syntax check passed for ${targets.length} files.`);
