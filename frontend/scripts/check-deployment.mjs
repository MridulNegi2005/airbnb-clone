import { setTimeout as delay } from "node:timers/promises";

const origin = "https://airbnb.mridulnegi.dev";
const paths = ["/", "/rooms/1", "/wishlists"];

// Check the deployed Worker, including its dynamic server routes, after upload.
for (let attempt = 1; attempt <= 6; attempt++) {
  const checks = await Promise.allSettled(paths.map(async path => {
    const response = await fetch(`${origin}${path}`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    const html = await response.text();
    if (!html.includes('id="main-content"')) throw new Error(`${path}: app shell missing`);
    return `${path}: HTTP ${response.status}`;
  }));
  const failures = checks.filter(check => check.status === "rejected");
  if (failures.length === 0) {
    for (const check of checks) console.log(check.value);
    console.log("Published frontend smoke check passed.");
    process.exit(0);
  }
  for (const failure of failures) console.error(failure.reason instanceof Error ? failure.reason.message : "Deployment check failed");
  if (attempt < 6) await delay(5000);
}
process.exit(1);
