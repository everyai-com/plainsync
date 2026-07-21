import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

async function waitForServer(url, output) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${url}/api/health`);
      if (response.ok) return;
    } catch {
      // The production server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Production server did not start.\n${output.join("")}`);
}

test("portable server persists documents and rejects stale writes", async (context) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "plainsync-test-"));
  const port = 32_000 + (process.pid % 10_000);
  const base = `http://127.0.0.1:${port}`;
  const output = [];
  const server = spawn(npm, ["run", "start"], {
    cwd: new URL("../", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      PLAIN_SYNC_DATA_DIR: dataDirectory,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk) => output.push(chunk.toString()));
  context.after(async () => {
    server.kill("SIGTERM");
    await rm(dataDirectory, { recursive: true, force: true });
  });

  await waitForServer(base, output);

  const createResponse = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "API test", content: "# First" }),
  });
  assert.equal(createResponse.status, 201);
  const created = await createResponse.json();
  assert.equal(created.document.revision, 1);
  assert.ok(created.writeToken);

  const unauthorized = await fetch(`${base}/api/documents/${created.document.id}`, {
    headers: { authorization: "Bearer wrong-key" },
  });
  assert.equal(unauthorized.status, 403);

  const authorization = `Bearer ${created.writeToken}`;
  const update = await fetch(`${base}/api/documents/${created.document.id}`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ title: "API test", content: "# Second", expectedRevision: 1 }),
  });
  assert.equal(update.status, 200);
  assert.equal((await update.json()).document.revision, 2);

  const stale = await fetch(`${base}/api/documents/${created.document.id}`, {
    method: "PUT",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ title: "API test", content: "# Stale", expectedRevision: 1 }),
  });
  assert.equal(stale.status, 409);
  const conflict = await stale.json();
  assert.equal(conflict.document.content, "# Second");
  assert.equal(conflict.document.revision, 2);
});
