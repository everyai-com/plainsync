import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${path}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }),
    {
      ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
    },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the PlainSync application shell and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");

  const html = await response.text();
  assert.match(html, /<title>PlainSync — Open Markdown workspace<\/title>/i);
  assert.match(html, /The self-hostable Markdown workspace that humans and AI agents can share/);
  assert.match(html, /Loading PlainSync/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /og\.png/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape|react-loading-skeleton/i);
});

test("ships installable and self-hosting surfaces", async () => {
  const [manifest, compose, dockerfile, packageJson, license, readme] = await Promise.all([
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../compose.yaml", import.meta.url), "utf8"),
    readFile(new URL("../Dockerfile", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../LICENSE", import.meta.url), "utf8"),
    readFile(new URL("../README.md", import.meta.url), "utf8"),
  ]);

  const parsedManifest = JSON.parse(manifest);
  assert.equal(parsedManifest.name, "PlainSync");
  assert.equal(parsedManifest.display, "standalone");
  assert.equal(parsedManifest.icons.length, 2);
  assert.match(compose, /plainsync-data:\/data/);
  assert.match(compose, /api\/health/);
  assert.match(dockerfile, /PLAIN_SYNC_DATA_DIR=\/data/);
  const parsedPackage = JSON.parse(packageJson);
  assert.equal(parsedPackage.license, "MIT");
  assert.ok(parsedPackage.scripts.check);
  assert.match(packageJson, /deploy:cloudflare/);
  assert.match(license, /^MIT License/);
  assert.match(readme, /## The problem/);
  assert.match(readme, /docs\/DEVELOPER-GUIDE\.md/);

  await Promise.all([
    access(new URL("../public/icon-192.png", import.meta.url)),
    access(new URL("../public/icon-512.png", import.meta.url)),
    access(new URL("../public/og.png", import.meta.url)),
    access(new URL("../public/sw.js", import.meta.url)),
    access(new URL("../docs/USE-CASES.md", import.meta.url)),
    access(new URL("../docs/DEVELOPER-GUIDE.md", import.meta.url)),
    access(new URL("../.github/ISSUE_TEMPLATE/bug_report.yml", import.meta.url)),
    access(new URL("../.github/pull_request_template.md", import.meta.url)),
  ]);
});

test("starter preview has been removed", async () => {
  await assert.rejects(access(new URL("app/_sites-preview", root)));
});
