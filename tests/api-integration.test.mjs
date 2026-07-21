import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import process from "node:process";
import test from "node:test";
import * as Y from "yjs";

const npm = process.platform === "win32" ? "npm.cmd" : "npm";

function bytesToBase64(value) {
  return Buffer.from(value).toString("base64");
}

function base64ToBytes(value) {
  return new Uint8Array(Buffer.from(value, "base64"));
}

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
  assert.ok(created.accessTokens.suggest);
  assert.ok(created.accessTokens.read);

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

  const readAuthorization = `Bearer ${created.accessTokens.read}`;
  const readDocument = await fetch(`${base}/api/documents/${created.document.id}`, {
    headers: { authorization: readAuthorization },
  });
  assert.equal(readDocument.status, 200);
  assert.equal((await readDocument.json()).role, "read");

  const readWrite = await fetch(`${base}/api/documents/${created.document.id}`, {
    method: "PUT",
    headers: { authorization: readAuthorization, "content-type": "application/json" },
    body: JSON.stringify({ title: "Nope", content: "Nope", expectedRevision: 2 }),
  });
  assert.equal(readWrite.status, 403);

  const suggestAuthorization = `Bearer ${created.accessTokens.suggest}`;
  const commentResponse = await fetch(`${base}/api/documents/${created.document.id}/comments`, {
    method: "POST",
    headers: { authorization: suggestAuthorization, "content-type": "application/json" },
    body: JSON.stringify({ body: "Please clarify this.", quote: "Second", authorName: "Reviewer" }),
  });
  assert.equal(commentResponse.status, 201);
  const comment = (await commentResponse.json()).comment;
  assert.equal(comment.authorName, "Reviewer");

  const readComment = await fetch(`${base}/api/documents/${created.document.id}/comments`, {
    method: "POST",
    headers: { authorization: readAuthorization, "content-type": "application/json" },
    body: JSON.stringify({ body: "Should fail" }),
  });
  assert.equal(readComment.status, 403);

  const resolve = await fetch(`${base}/api/documents/${created.document.id}/comments/${comment.id}`, {
    method: "PATCH",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ resolved: true }),
  });
  assert.equal(resolve.status, 200);
  assert.equal((await resolve.json()).comment.resolved, true);

  const snapshot = await fetch(`${base}/api/documents/${created.document.id}/history`, {
    method: "POST",
    headers: { authorization, "content-type": "application/json" },
    body: JSON.stringify({ label: "Review ready", actor: "API test" }),
  });
  assert.equal(snapshot.status, 201);
  assert.equal((await snapshot.json()).version.label, "Review ready");

  const history = await fetch(`${base}/api/documents/${created.document.id}/history`, {
    headers: { authorization: readAuthorization },
  });
  assert.equal(history.status, 200);
  assert.ok((await history.json()).versions.length >= 3);
});

test("Yjs updates merge concurrent writers without a conflict response", async (context) => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "plainsync-crdt-test-"));
  const port = 42_000 + (process.pid % 10_000);
  const base = `http://127.0.0.1:${port}`;
  const output = [];
  const server = spawn(npm, ["run", "start"], {
    cwd: new URL("../", import.meta.url),
    env: { ...process.env, PORT: String(port), PLAIN_SYNC_DATA_DIR: dataDirectory },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (chunk) => output.push(chunk.toString()));
  server.stderr.on("data", (chunk) => output.push(chunk.toString()));
  context.after(async () => {
    server.kill("SIGTERM");
    await rm(dataDirectory, { recursive: true, force: true });
  });
  await waitForServer(base, output);

  const created = await fetch(`${base}/api/documents`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Concurrent", content: "start" }),
  }).then((response) => response.json());
  const endpoint = `${base}/api/documents/${created.document.id}/sync`;
  const headers = { authorization: `Bearer ${created.writeToken}`, "content-type": "application/json" };

  async function connectedDoc() {
    const doc = new Y.Doc();
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ stateVector: bytesToBase64(Y.encodeStateVector(doc)) }),
    });
    const payload = await response.json();
    Y.applyUpdate(doc, base64ToBytes(payload.update));
    return doc;
  }

  const [left, right] = await Promise.all([connectedDoc(), connectedDoc()]);
  const leftUpdates = [];
  const rightUpdates = [];
  left.on("update", (update) => leftUpdates.push(update));
  right.on("update", (update) => rightUpdates.push(update));
  left.getText("markdown").insert(left.getText("markdown").length, " left");
  right.getText("markdown").insert(right.getText("markdown").length, " right");

  for (const update of [Y.mergeUpdates(leftUpdates), Y.mergeUpdates(rightUpdates)]) {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({ update: bytesToBase64(update) }),
    });
    assert.equal(response.status, 200);
  }

  const merged = await connectedDoc();
  const content = merged.getText("markdown").toString();
  assert.match(content, /left/);
  assert.match(content, /right/);
});
