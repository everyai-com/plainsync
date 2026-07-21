export type SharedDocument = {
  id: string;
  title: string;
  content: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

type StoredDocument = SharedDocument & { writeTokenHash: string };

const MAX_DOCUMENT_BYTES = 1_000_000;
let nodeWriteQueue: Promise<unknown> = Promise.resolve();

async function getDatabase(): Promise<D1Database | null> {
  try {
    const workers = await import("cloudflare:workers");
    return (workers.env as { DB?: D1Database }).DB ?? null;
  } catch {
    return null;
  }
}

export async function ensureDocumentSchema(): Promise<D1Database | null> {
  const database = await getDatabase();
  if (!database) return null;
  await database.batch([
    database.prepare(`CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      write_token_hash TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS documents_updated_at_idx ON documents(updated_at)",
    ),
  ]);
  return database;
}

function cleanTitle(value: unknown): string {
  if (typeof value !== "string") return "Untitled document";
  return value.trim().slice(0, 160) || "Untitled document";
}

function cleanContent(value: unknown): string {
  if (typeof value !== "string") return "";
  if (new TextEncoder().encode(value).byteLength > MAX_DOCUMENT_BYTES) {
    throw new Error("Document is larger than the 1 MB alpha limit.");
  }
  return value;
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function publicDocument(document: StoredDocument): SharedDocument {
  return {
    id: document.id,
    title: document.title,
    content: document.content,
    revision: document.revision,
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
  };
}

function rowToStoredDocument(row: Record<string, unknown>): StoredDocument {
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    revision: Number(row.revision),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    writeTokenHash: String(row.write_token_hash),
  };
}

async function nodeStorePath(): Promise<string> {
  const path = await import("node:path");
  const directory = process.env.PLAIN_SYNC_DATA_DIR || path.join(process.cwd(), "data");
  return path.join(directory, "documents.json");
}

async function readNodeStore(): Promise<Record<string, StoredDocument>> {
  const fs = await import("node:fs/promises");
  try {
    return JSON.parse(await fs.readFile(await nodeStorePath(), "utf8")) as Record<string, StoredDocument>;
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") return {};
    throw error;
  }
}

async function writeNodeStore(store: Record<string, StoredDocument>): Promise<void> {
  const fs = await import("node:fs/promises");
  const path = await import("node:path");
  const file = await nodeStorePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(store, null, 2), "utf8");
  await fs.rename(temporary, file);
}

async function withNodeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = nodeWriteQueue.then(operation, operation);
  nodeWriteQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

export async function createSharedDocument(input: {
  title?: unknown;
  content?: unknown;
}): Promise<{ document: SharedDocument; writeToken: string }> {
  const database = await ensureDocumentSchema();
  const id = crypto.randomUUID();
  const writeToken = randomToken();
  const writeTokenHash = await hashToken(writeToken);
  const now = Date.now();
  const stored: StoredDocument = {
    id,
    title: cleanTitle(input.title),
    content: cleanContent(input.content),
    writeTokenHash,
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };

  if (database) {
    await database
      .prepare(
        `INSERT INTO documents
          (id, title, content, write_token_hash, revision, created_at, updated_at)
         VALUES (?, ?, ?, ?, 1, ?, ?)`,
      )
      .bind(id, stored.title, stored.content, writeTokenHash, now, now)
      .run();
  } else {
    await withNodeWrite(async () => {
      const store = await readNodeStore();
      store[id] = stored;
      await writeNodeStore(store);
    });
  }

  return { document: publicDocument(stored), writeToken };
}

export async function authenticateDocument(
  id: string,
  token: string,
): Promise<SharedDocument | null> {
  if (!token || token.length > 256) return null;
  const database = await ensureDocumentSchema();
  const supplied = await hashToken(token);

  if (database) {
    const row = await database
      .prepare(
        `SELECT id, title, content, revision, created_at, updated_at,
          write_token_hash FROM documents WHERE id = ?`,
      )
      .bind(id)
      .first<Record<string, unknown>>();
    if (!row) return null;
    const stored = rowToStoredDocument(row);
    return supplied === stored.writeTokenHash ? publicDocument(stored) : null;
  }

  const stored = (await readNodeStore())[id];
  return stored && supplied === stored.writeTokenHash ? publicDocument(stored) : null;
}

export async function updateSharedDocument(input: {
  id: string;
  token: string;
  title?: unknown;
  content?: unknown;
  expectedRevision: unknown;
}): Promise<
  | { status: "updated"; document: SharedDocument }
  | { status: "conflict"; document: SharedDocument }
  | { status: "unauthorized" }
> {
  if (!input.token || input.token.length > 256) return { status: "unauthorized" };
  const database = await ensureDocumentSchema();
  const supplied = await hashToken(input.token);
  const expectedRevision = Number(input.expectedRevision);
  const title = cleanTitle(input.title);
  const content = cleanContent(input.content);

  if (database) {
    const row = await database
      .prepare(
        `SELECT id, title, content, revision, created_at, updated_at,
          write_token_hash FROM documents WHERE id = ?`,
      )
      .bind(input.id)
      .first<Record<string, unknown>>();
    if (!row) return { status: "unauthorized" };
    const current = rowToStoredDocument(row);
    if (supplied !== current.writeTokenHash) return { status: "unauthorized" };
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) {
      return { status: "conflict", document: publicDocument(current) };
    }

    const now = Date.now();
    const nextRevision = expectedRevision + 1;
    const result = await database
      .prepare(
        `UPDATE documents
         SET title = ?, content = ?, revision = ?, updated_at = ?
         WHERE id = ? AND revision = ?`,
      )
      .bind(title, content, nextRevision, now, input.id, expectedRevision)
      .run();
    if (result.meta.changes === 0) {
      const latest = await authenticateDocument(input.id, input.token);
      return latest
        ? { status: "conflict", document: latest }
        : { status: "unauthorized" };
    }
    return {
      status: "updated",
      document: {
        id: input.id,
        title,
        content,
        revision: nextRevision,
        createdAt: current.createdAt,
        updatedAt: now,
      },
    };
  }

  return withNodeWrite(async () => {
    const store = await readNodeStore();
    const current = store[input.id];
    if (!current || supplied !== current.writeTokenHash) return { status: "unauthorized" } as const;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) {
      return { status: "conflict", document: publicDocument(current) } as const;
    }
    const next: StoredDocument = {
      ...current,
      title,
      content,
      revision: expectedRevision + 1,
      updatedAt: Date.now(),
    };
    store[input.id] = next;
    await writeNodeStore(store);
    return { status: "updated", document: publicDocument(next) } as const;
  });
}
