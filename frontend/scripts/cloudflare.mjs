import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { patchPreviewManifest } from "./patch-preview-manifest.mjs";

const require = createRequire(import.meta.url);
const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const cli = resolve(dirname(require.resolve("@opennextjs/cloudflare")), "../cli/index.js");
const action = process.argv[2] || "build";

if (!["build", "preview", "deploy"].includes(action)) {
  console.error("Usage: node scripts/cloudflare.mjs [build|preview|deploy]");
  process.exit(1);
}

// NEXT_PUBLIC values are compiled into browser JavaScript. Wrangler's runtime
// vars cannot replace a localhost URL that Next already bundled from .env.local.
const environment = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_PUBLIC_API_URL:
    process.env.NEXT_PUBLIC_API_URL || "https://airbnb-api.mridulnegi.dev",
};
// OpenNext currently expects the conventional .next build directory.
delete environment.NEXT_DIST_DIR;

const commands = action === "build" ? ["build"] : ["build", action];
for (const command of commands) {
  const result = spawnSync(process.execPath, [cli, command], {
    cwd: projectDirectory,
    env: environment,
    stdio: "inherit",
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
  if (command === "build") patchPreviewManifest(projectDirectory);
}
