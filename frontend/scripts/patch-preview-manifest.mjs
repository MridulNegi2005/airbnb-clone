import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// Next 16.4 split preview props out of prerender-manifest.json. OpenNext 1.20.9
// does not yet include this file in its filesystem-free manifest loader.
// Inline the real build values, matching the adapter's other manifest patches.
export function patchPreviewManifest(projectDirectory) {
  const nextVersion = JSON.parse(readFileSync(join(projectDirectory, "node_modules/next/package.json"), "utf8")).version;
  const adapterVersion = JSON.parse(readFileSync(join(projectDirectory, "node_modules/@opennextjs/cloudflare/package.json"), "utf8")).version;
  const serverDirectory = join(projectDirectory, ".open-next/server-functions/default");
  const manifestPath = join(serverDirectory, ".next/server/preview-props.json");
  if (!existsSync(manifestPath)) {
    if (/^16\.4\./.test(nextVersion)) throw new Error("Next 16.4 preview-props manifest is missing from the OpenNext server output.");
    return;
  }

  const handlerPath = join(serverDirectory, "handler.mjs");
  const handler = readFileSync(handlerPath, "utf8");
  const signatures = [...handler.matchAll(/function loadManifest\(\s*([A-Za-z_$][\w$]*)[^)]*\)\s*\{/g)];
  if (signatures.length !== 1) {
    throw new Error("OpenNext manifest loader changed; review the preview-props compatibility patch before deploying.");
  }

  const signature = signatures[0];
  const loaderStart = signature.index;
  const loaderEnd = handler.indexOf("Unexpected loadManifest(", loaderStart);
  if (loaderEnd === -1) {
    // A newer adapter may no longer use this guarded filesystem-free loader.
    throw new Error("OpenNext manifest loader guard changed; review the preview-props compatibility patch before deploying.");
  }
  // Linux builds may list this filename inside another embedded manifest.
  // Only an actual loader branch means the preview props are already handled.
  const loader = handler.slice(loaderStart, loaderEnd);
  if (/\.endsWith\(\s*["']\/?(?:\.next\/)?server\/preview-props\.json["']\s*\)\s*\)\s*return\s/.test(loader)) return;
  if (!/^16\.4\./.test(nextVersion) || adapterVersion !== "1.20.9") {
    throw new Error(`Review preview-props manifest compatibility for Next ${nextVersion} and OpenNext ${adapterVersion} before deploying.`);
  }

  const previewProps = JSON.parse(readFileSync(manifestPath, "utf8"));
  for (const field of ["previewModeId", "previewModeSigningKey", "previewModeEncryptionKey"]) {
    if (typeof previewProps[field] !== "string" || !previewProps[field]) {
      throw new Error(`Next preview-props manifest is missing ${field}.`);
    }
  }

  const parameter = signature[1];
  const insertion = `\nif (${parameter}.replaceAll("\\\\", "/").endsWith("/.next/server/preview-props.json")) return ${JSON.stringify(previewProps)};\n`;
  const insertionPoint = loaderStart + signature[0].length;
  writeFileSync(handlerPath, handler.slice(0, insertionPoint) + insertion + handler.slice(insertionPoint), "utf8");
  console.log("Applied Next 16.4 preview-props manifest compatibility patch.");
}
