import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { patchPreviewManifest } from "./patch-preview-manifest.mjs";

test("embedded filename lists do not skip preview props on Linux or Windows", () => {
  const root = mkdtempSync(join(tmpdir(), "airbnb-preview-manifest-test-"));
  const props = { previewModeId: "test-id", previewModeSigningKey: "test-signing", previewModeEncryptionKey: "test-encryption" };
  const server = join(root, ".open-next/server-functions/default");
  const files = {
    "node_modules/next/package.json": { version: "16.4.0" },
    "node_modules/@opennextjs/cloudflare/package.json": { version: "1.20.9" },
    ".open-next/server-functions/default/.next/server/preview-props.json": props,
  };
  try {
    for (const [file, value] of Object.entries(files)) {
      mkdirSync(dirname(join(root, file)), { recursive: true });
      writeFileSync(join(root, file), JSON.stringify(value));
    }
    const handlerPath = join(server, "handler.mjs");
    writeFileSync(handlerPath, `function loadManifest(path) {
      if (path.endsWith("/required-server-files.json")) return { files: [".next/server/preview-props.json"] };
      throw new Error("Unexpected loadManifest(" + path + ") call!");
    }`);
    patchPreviewManifest(root);
    const patched = readFileSync(handlerPath, "utf8");
    const load = runInNewContext(`${patched}; loadManifest`);
    for (const path of ["/.next/server/preview-props.json", "C:\\app\\.next\\server\\preview-props.json"]) {
      assert.deepEqual(JSON.parse(JSON.stringify(load(path))), props);
    }
    assert.equal(load("/.next/required-server-files.json").files[0], ".next/server/preview-props.json");
    assert.throws(() => load("/.next/unknown.json"), /Unexpected loadManifest/);
    patchPreviewManifest(root);
    assert.equal(readFileSync(handlerPath, "utf8"), patched, "patching twice must be safe");
  } finally {
    assert.equal(dirname(resolve(root)), resolve(tmpdir()));
    assert.ok(root.startsWith(join(tmpdir(), "airbnb-preview-manifest-test-")));
    rmSync(root, { recursive: true });
  }
});
