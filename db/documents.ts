import * as Y from "yjs";

export type AccessRole = "edit" | "suggest" | "read";

export type SharedDocument = {
  id: string;
  title: string;
  content: string;
  revision: number;
  createdAt: number;
  updatedAt: number;
};

export type DocumentVersion = {
  id: string;
  documentId: string;
  title: string;
  content: string;
  revision: number;
  label: string | null;
  actor: string;
  createdAt: number;
};

export type SharedComment = {
  id: string;
  documentId: string;
  parentId: string | null;
  body: string;
  quote: string;
  relativeStart: string | null;
  relativeEnd: string | null;
  authorName: string;
  resolved: boolean;
  createdAt: number;
  updatedAt: number;
};

export type Participant = {
  sessionId: string;
  name: string;
  color: string;
  lastSeen: number;
};

type StoredAccess = {
  tokenHash: string;
  role: Exclude<AccessRole, "edit">;
  createdAt: number;
};

type StoredDocument = SharedDocument & {
  writeTokenHash: string;
  crdtState?: string;
  access?: StoredAccess[];
  history?: DocumentVersion[];
  comments?: SharedComment[];
  presence?: Participant[];
};

const MAX_DOCUMENT_BYTES = 1_000_000;
const MAX_UPDATE_BYTES = 1_500_000;
const MAX_COMMENT_BYTES = 8_000;
const MAX_HISTORY = 100;
const PRESENCE_TTL_MS = 30_000;
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
    database.prepare(`CREATE TABLE IF NOT EXISTS document_access (
      document_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (document_id, token_hash),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS document_access_document_idx ON document_access(document_id)",
    ),
    database.prepare(`CREATE TABLE IF NOT EXISTS document_crdt (
      document_id TEXT PRIMARY KEY NOT NULL,
      state_base64 TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )`),
    database.prepare(`CREATE TABLE IF NOT EXISTS document_versions (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      revision INTEGER NOT NULL,
      label TEXT,
      actor TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS document_versions_document_idx ON document_versions(document_id, created_at DESC)",
    ),
    database.prepare(`CREATE TABLE IF NOT EXISTS document_comments (
      id TEXT PRIMARY KEY NOT NULL,
      document_id TEXT NOT NULL,
      parent_id TEXT,
      body TEXT NOT NULL,
      quote TEXT NOT NULL,
      relative_start TEXT,
      relative_end TEXT,
      author_name TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS document_comments_document_idx ON document_comments(document_id, created_at)",
    ),
    database.prepare(`CREATE TABLE IF NOT EXISTS document_presence (
      document_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      last_seen INTEGER NOT NULL,
      PRIMARY KEY (document_id, session_id),
      FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
    )`),
    database.prepare(
      "CREATE INDEX IF NOT EXISTS document_presence_seen_idx ON document_presence(document_id, last_seen)",
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
    throw new Error("Document is larger than the 1 MB limit.");
  }
  return value;
}

function cleanShortText(value: unknown, fallback: string, limit: number): string {
  if (typeof value !== "string") return fallback;
  return value.trim().slice(0, limit) || fallback;
}

function cleanComment(value: unknown): string {
  const body = cleanShortText(value, "", MAX_COMMENT_BYTES);
  if (!body) throw new Error("Comment text is required.");
  return body;
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
  return bytesToHex(new Uint8Array(digest));
}

function bytesToHex(value: Uint8Array): string {
  return Array.from(value, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (let index = 0; index < value.length; index += 0x8000) {
    binary += String.fromCharCode(...value.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

function createCrdtState(content: string): string {
  const doc = new Y.Doc();
  doc.getText("markdown").insert(0, content);
  return bytesToBase64(Y.encodeStateAsUpdate(doc));
}

function loadCrdt(state: string | undefined, fallbackContent: string): Y.Doc {
  const doc = new Y.Doc();
  if (state) Y.applyUpdate(doc, base64ToBytes(state));
  else doc.getText("markdown").insert(0, fallbackContent);
  return doc;
}

function replaceCrdtText(doc: Y.Doc, content: string): void {
  const text = doc.getText("markdown");
  doc.transact(() => {
    if (text.length) text.delete(0, text.length);
    if (content) text.insert(0, content);
  });
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

function rowToVersion(row: Record<string, unknown>): DocumentVersion {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    title: String(row.title),
    content: String(row.content),
    revision: Number(row.revision),
    label: row.label == null ? null : String(row.label),
    actor: String(row.actor),
    createdAt: Number(row.created_at),
  };
}

function rowToComment(row: Record<string, unknown>): SharedComment {
  return {
    id: String(row.id),
    documentId: String(row.document_id),
    parentId: row.parent_id == null ? null : String(row.parent_id),
    body: String(row.body),
    quote: String(row.quote),
    relativeStart: row.relative_start == null ? null : String(row.relative_start),
    relativeEnd: row.relative_end == null ? null : String(row.relative_end),
    authorName: String(row.author_name),
    resolved: Boolean(row.resolved),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
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

async function accessForStoredDocument(
  stored: StoredDocument | undefined,
  tokenHash: string,
): Promise<AccessRole | null> {
  if (!stored) return null;
  if (stored.writeTokenHash === tokenHash) return "edit";
  return stored.access?.find((access) => access.tokenHash === tokenHash)?.role ?? null;
}

async function d1AccessRole(
  database: D1Database,
  document: StoredDocument,
  tokenHash: string,
): Promise<AccessRole | null> {
  if (document.writeTokenHash === tokenHash) return "edit";
  const row = await database
    .prepare("SELECT role FROM document_access WHERE document_id = ? AND token_hash = ?")
    .bind(document.id, tokenHash)
    .first<{ role: string }>();
  return row?.role === "read" || row?.role === "suggest" ? row.role : null;
}

async function authenticatedRecord(
  id: string,
  token: string,
): Promise<{ database: D1Database | null; stored: StoredDocument; role: AccessRole } | null> {
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
    const role = await d1AccessRole(database, stored, supplied);
    return role ? { database, stored, role } : null;
  }
  const stored = (await readNodeStore())[id];
  const role = await accessForStoredDocument(stored, supplied);
  return stored && role ? { database: null, stored, role } : null;
}

function makeVersion(
  document: SharedDocument,
  actor: string,
  label: string | null = null,
): DocumentVersion {
  return {
    id: crypto.randomUUID(),
    documentId: document.id,
    title: document.title,
    content: document.content,
    revision: document.revision,
    label,
    actor,
    createdAt: Date.now(),
  };
}

async function insertD1Version(database: D1Database, version: DocumentVersion): Promise<void> {
  await database
    .prepare(
      `INSERT INTO document_versions
       (id, document_id, title, content, revision, label, actor, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      version.id,
      version.documentId,
      version.title,
      version.content,
      version.revision,
      version.label,
      version.actor,
      version.createdAt,
    )
    .run();
  await database
    .prepare(
      `DELETE FROM document_versions WHERE document_id = ? AND label IS NULL AND id NOT IN (
        SELECT id FROM document_versions WHERE document_id = ? ORDER BY created_at DESC LIMIT ?
      )`,
    )
    .bind(version.documentId, version.documentId, MAX_HISTORY)
    .run();
}

export async function createSharedDocument(input: {
  title?: unknown;
  content?: unknown;
}): Promise<{
  document: SharedDocument;
  writeToken: string;
  accessTokens: { edit: string; suggest: string; read: string };
}> {
  const database = await ensureDocumentSchema();
  const id = crypto.randomUUID();
  const writeToken = randomToken();
  const suggestToken = randomToken();
  const readToken = randomToken();
  const [writeTokenHash, suggestTokenHash, readTokenHash] = await Promise.all([
    hashToken(writeToken),
    hashToken(suggestToken),
    hashToken(readToken),
  ]);
  const now = Date.now();
  const stored: StoredDocument = {
    id,
    title: cleanTitle(input.title),
    content: cleanContent(input.content),
    writeTokenHash,
    crdtState: createCrdtState(cleanContent(input.content)),
    access: [
      { tokenHash: suggestTokenHash, role: "suggest", createdAt: now },
      { tokenHash: readTokenHash, role: "read", createdAt: now },
    ],
    revision: 1,
    createdAt: now,
    updatedAt: now,
  };
  const initialVersion = makeVersion(publicDocument(stored), "human");
  stored.history = [initialVersion];

  if (database) {
    await database.batch([
      database
        .prepare(
          `INSERT INTO documents
            (id, title, content, write_token_hash, revision, created_at, updated_at)
           VALUES (?, ?, ?, ?, 1, ?, ?)`,
        )
        .bind(id, stored.title, stored.content, writeTokenHash, now, now),
      database
        .prepare(
          `INSERT INTO document_access (document_id, token_hash, role, created_at)
           VALUES (?, ?, 'suggest', ?), (?, ?, 'read', ?)`,
        )
        .bind(id, suggestTokenHash, now, id, readTokenHash, now),
      database
        .prepare(
          "INSERT INTO document_crdt (document_id, state_base64, updated_at) VALUES (?, ?, ?)",
        )
        .bind(id, stored.crdtState, now),
      database
        .prepare(
          `INSERT INTO document_versions
           (id, document_id, title, content, revision, label, actor, created_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .bind(
          initialVersion.id,
          id,
          stored.title,
          stored.content,
          stored.revision,
          initialVersion.actor,
          initialVersion.createdAt,
        ),
    ]);
  } else {
    await withNodeWrite(async () => {
      const store = await readNodeStore();
      store[id] = stored;
      await writeNodeStore(store);
    });
  }

  return {
    document: publicDocument(stored),
    writeToken,
    accessTokens: { edit: writeToken, suggest: suggestToken, read: readToken },
  };
}

export async function authenticateDocument(
  id: string,
  token: string,
): Promise<{ document: SharedDocument; role: AccessRole } | null> {
  const record = await authenticatedRecord(id, token);
  return record ? { document: publicDocument(record.stored), role: record.role } : null;
}

export async function updateSharedDocument(input: {
  id: string;
  token: string;
  title?: unknown;
  content?: unknown;
  expectedRevision: unknown;
  actor?: unknown;
}): Promise<
  | { status: "updated"; document: SharedDocument }
  | { status: "conflict"; document: SharedDocument }
  | { status: "forbidden" }
  | { status: "unauthorized" }
> {
  const expectedRevision = Number(input.expectedRevision);
  const title = cleanTitle(input.title);
  const content = cleanContent(input.content);
  const actor = cleanShortText(input.actor, "human", 80);
  const auth = await authenticatedRecord(input.id, input.token);
  if (!auth) return { status: "unauthorized" };
  if (auth.role !== "edit") return { status: "forbidden" };

  if (auth.database) {
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== auth.stored.revision) {
      return { status: "conflict", document: publicDocument(auth.stored) };
    }
    const crdtRow = await auth.database
      .prepare("SELECT state_base64 FROM document_crdt WHERE document_id = ?")
      .bind(input.id)
      .first<{ state_base64: string }>();
    const ydoc = loadCrdt(crdtRow?.state_base64, auth.stored.content);
    replaceCrdtText(ydoc, content);
    const state = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
    const now = Date.now();
    const nextRevision = expectedRevision + 1;
    const [result] = await auth.database.batch([
      auth.database
        .prepare(
          `UPDATE documents SET title = ?, content = ?, revision = ?, updated_at = ?
           WHERE id = ? AND revision = ?`,
        )
        .bind(title, content, nextRevision, now, input.id, expectedRevision),
      auth.database
        .prepare(
          `INSERT INTO document_crdt (document_id, state_base64, updated_at)
           SELECT ?, ?, ? WHERE EXISTS (
             SELECT 1 FROM documents WHERE id = ? AND revision = ? AND title = ? AND content = ?
           )
           ON CONFLICT(document_id) DO UPDATE SET state_base64 = excluded.state_base64,
           updated_at = excluded.updated_at`,
        )
        .bind(input.id, state, now, input.id, nextRevision, title, content),
    ]);
    if (result.meta.changes === 0) {
      const latest = await authenticateDocument(input.id, input.token);
      return latest
        ? { status: "conflict", document: latest.document }
        : { status: "unauthorized" };
    }
    const document: SharedDocument = {
      id: input.id,
      title,
      content,
      revision: nextRevision,
      createdAt: auth.stored.createdAt,
      updatedAt: now,
    };
    await insertD1Version(auth.database, makeVersion(document, actor));
    return { status: "updated", document };
  }

  return withNodeWrite(async () => {
    const store = await readNodeStore();
    const current = store[input.id];
    const supplied = await hashToken(input.token);
    const role = await accessForStoredDocument(current, supplied);
    if (!current || !role) return { status: "unauthorized" } as const;
    if (role !== "edit") return { status: "forbidden" } as const;
    if (!Number.isSafeInteger(expectedRevision) || expectedRevision !== current.revision) {
      return { status: "conflict", document: publicDocument(current) } as const;
    }
    const ydoc = loadCrdt(current.crdtState, current.content);
    replaceCrdtText(ydoc, content);
    const next: StoredDocument = {
      ...current,
      title,
      content,
      crdtState: bytesToBase64(Y.encodeStateAsUpdate(ydoc)),
      revision: expectedRevision + 1,
      updatedAt: Date.now(),
    };
    next.history = [...(current.history ?? []), makeVersion(publicDocument(next), actor)].slice(-MAX_HISTORY);
    store[input.id] = next;
    await writeNodeStore(store);
    return { status: "updated", document: publicDocument(next) } as const;
  });
}

function cleanPresence(input: unknown): Omit<Participant, "lastSeen"> | null {
  if (!input || typeof input !== "object") return null;
  const value = input as Record<string, unknown>;
  const sessionId = cleanShortText(value.sessionId, "", 80);
  if (!sessionId) return null;
  const color = typeof value.color === "string" && /^#[0-9a-f]{6}$/i.test(value.color)
    ? value.color
    : "#2e6a51";
  return {
    sessionId,
    name: cleanShortText(value.name, "Guest", 50),
    color,
  };
}

function validateBase64Update(value: unknown): Uint8Array | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || value.length > MAX_UPDATE_BYTES * 1.5) {
    throw new Error("Collaboration update is too large.");
  }
  const bytes = base64ToBytes(value);
  if (bytes.byteLength > MAX_UPDATE_BYTES) throw new Error("Collaboration update is too large.");
  return bytes;
}

async function d1Presence(
  database: D1Database,
  documentId: string,
  presence: Omit<Participant, "lastSeen"> | null,
): Promise<Participant[]> {
  const now = Date.now();
  const cutoff = now - PRESENCE_TTL_MS;
  const statements = [
    database.prepare("DELETE FROM document_presence WHERE document_id = ? AND last_seen < ?").bind(documentId, cutoff),
  ];
  if (presence) {
    statements.push(
      database
        .prepare(
          `INSERT INTO document_presence (document_id, session_id, name, color, last_seen)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(document_id, session_id) DO UPDATE SET name = excluded.name,
           color = excluded.color, last_seen = excluded.last_seen`,
        )
        .bind(documentId, presence.sessionId, presence.name, presence.color, now),
    );
  }
  await database.batch(statements);
  const result = await database
    .prepare(
      "SELECT session_id, name, color, last_seen FROM document_presence WHERE document_id = ? ORDER BY last_seen DESC",
    )
    .bind(documentId)
    .all<Record<string, unknown>>();
  return result.results.map((row) => ({
    sessionId: String(row.session_id),
    name: String(row.name),
    color: String(row.color),
    lastSeen: Number(row.last_seen),
  }));
}

export async function syncSharedDocument(input: {
  id: string;
  token: string;
  update?: unknown;
  stateVector?: unknown;
  title?: unknown;
  presence?: unknown;
  actor?: unknown;
}): Promise<
  | {
      status: "synced";
      document: SharedDocument;
      role: AccessRole;
      update: string;
      participants: Participant[];
    }
  | { status: "forbidden" }
  | { status: "unauthorized" }
> {
  const incoming = validateBase64Update(input.update);
  const stateVector = validateBase64Update(input.stateVector);
  const presence = cleanPresence(input.presence);
  const actor = cleanShortText(input.actor, "human", 80);

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const auth = await authenticatedRecord(input.id, input.token);
    if (!auth) return { status: "unauthorized" };
    if (incoming && auth.role !== "edit") return { status: "forbidden" };
    if (
      input.title !== undefined &&
      auth.role !== "edit" &&
      cleanTitle(input.title) !== auth.stored.title
    ) return { status: "forbidden" };

    if (auth.database) {
      const crdtRow = await auth.database
        .prepare("SELECT state_base64 FROM document_crdt WHERE document_id = ?")
        .bind(input.id)
        .first<{ state_base64: string }>();
      const ydoc = loadCrdt(crdtRow?.state_base64, auth.stored.content);
      if (incoming) Y.applyUpdate(ydoc, incoming);
      const content = cleanContent(ydoc.getText("markdown").toString());
      const title = auth.role === "edit" && input.title !== undefined
        ? cleanTitle(input.title)
        : auth.stored.title;
      const changed = content !== auth.stored.content || title !== auth.stored.title;
      let document = publicDocument(auth.stored);

      if (changed) {
        const now = Date.now();
        const nextRevision = auth.stored.revision + 1;
        const compactState = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
        const [result] = await auth.database.batch([
          auth.database
            .prepare(
              `UPDATE documents SET title = ?, content = ?, revision = ?, updated_at = ?
               WHERE id = ? AND revision = ?`,
            )
            .bind(title, content, nextRevision, now, input.id, auth.stored.revision),
          auth.database
            .prepare(
              `INSERT INTO document_crdt (document_id, state_base64, updated_at)
               SELECT ?, ?, ? WHERE EXISTS (
                 SELECT 1 FROM documents WHERE id = ? AND revision = ? AND title = ? AND content = ?
               )
               ON CONFLICT(document_id) DO UPDATE SET state_base64 = excluded.state_base64,
               updated_at = excluded.updated_at`,
            )
            .bind(input.id, compactState, now, input.id, nextRevision, title, content),
        ]);
        if (result.meta.changes === 0) continue;
        document = {
          ...document,
          title,
          content,
          revision: nextRevision,
          updatedAt: now,
        };
        await insertD1Version(auth.database, makeVersion(document, actor));
      } else if (!crdtRow) {
        await auth.database
          .prepare(
            `INSERT INTO document_crdt (document_id, state_base64, updated_at) VALUES (?, ?, ?)
             ON CONFLICT(document_id) DO NOTHING`,
          )
          .bind(input.id, bytesToBase64(Y.encodeStateAsUpdate(ydoc)), Date.now())
          .run();
      }

      const participants = await d1Presence(auth.database, input.id, presence);
      return {
        status: "synced",
        document,
        role: auth.role,
        update: bytesToBase64(Y.encodeStateAsUpdate(ydoc, stateVector ?? undefined)),
        participants,
      };
    }

    return withNodeWrite(async () => {
      const store = await readNodeStore();
      const current = store[input.id];
      const supplied = await hashToken(input.token);
      const role = await accessForStoredDocument(current, supplied);
      if (!current || !role) return { status: "unauthorized" } as const;
      if (incoming && role !== "edit") return { status: "forbidden" } as const;
      const ydoc = loadCrdt(current.crdtState, current.content);
      if (incoming) Y.applyUpdate(ydoc, incoming);
      const content = cleanContent(ydoc.getText("markdown").toString());
      const title = role === "edit" && input.title !== undefined ? cleanTitle(input.title) : current.title;
      const changed = content !== current.content || title !== current.title;
      let next = current;
      if (changed) {
        next = {
          ...current,
          title,
          content,
          revision: current.revision + 1,
          updatedAt: Date.now(),
        };
        next.history = [...(current.history ?? []), makeVersion(publicDocument(next), actor)].slice(-MAX_HISTORY);
      }
      next.crdtState = bytesToBase64(Y.encodeStateAsUpdate(ydoc));
      const cutoff = Date.now() - PRESENCE_TTL_MS;
      next.presence = (next.presence ?? []).filter((participant) => participant.lastSeen >= cutoff);
      if (presence) {
        next.presence = next.presence.filter((participant) => participant.sessionId !== presence.sessionId);
        next.presence.unshift({ ...presence, lastSeen: Date.now() });
      }
      store[input.id] = next;
      await writeNodeStore(store);
      return {
        status: "synced",
        document: publicDocument(next),
        role,
        update: bytesToBase64(Y.encodeStateAsUpdate(ydoc, stateVector ?? undefined)),
        participants: next.presence,
      } as const;
    });
  }

  throw new Error("The document is changing too quickly. Please try again.");
}

export async function listDocumentHistory(
  id: string,
  token: string,
): Promise<{ role: AccessRole; versions: DocumentVersion[] } | null> {
  const auth = await authenticatedRecord(id, token);
  if (!auth) return null;
  if (auth.database) {
    const result = await auth.database
      .prepare(
        `SELECT id, document_id, title, content, revision, label, actor, created_at
         FROM document_versions WHERE document_id = ? ORDER BY created_at DESC LIMIT ?`,
      )
      .bind(id, MAX_HISTORY)
      .all<Record<string, unknown>>();
    return { role: auth.role, versions: result.results.map(rowToVersion) };
  }
  return { role: auth.role, versions: [...(auth.stored.history ?? [])].reverse() };
}

export async function createNamedSnapshot(input: {
  id: string;
  token: string;
  label?: unknown;
  actor?: unknown;
}): Promise<DocumentVersion | "forbidden" | null> {
  const auth = await authenticatedRecord(input.id, input.token);
  if (!auth) return null;
  if (auth.role !== "edit") return "forbidden";
  const version = makeVersion(
    publicDocument(auth.stored),
    cleanShortText(input.actor, "human", 80),
    cleanShortText(input.label, "Named snapshot", 120),
  );
  if (auth.database) {
    await insertD1Version(auth.database, version);
  } else {
    await withNodeWrite(async () => {
      const store = await readNodeStore();
      const current = store[input.id];
      if (!current) return;
      current.history = [...(current.history ?? []), version];
      store[input.id] = current;
      await writeNodeStore(store);
    });
  }
  return version;
}

export async function listComments(
  id: string,
  token: string,
): Promise<{ role: AccessRole; comments: SharedComment[] } | null> {
  const auth = await authenticatedRecord(id, token);
  if (!auth) return null;
  if (auth.database) {
    const result = await auth.database
      .prepare(
        `SELECT id, document_id, parent_id, body, quote, relative_start, relative_end,
          author_name, resolved, created_at, updated_at
         FROM document_comments WHERE document_id = ? ORDER BY created_at ASC LIMIT 500`,
      )
      .bind(id)
      .all<Record<string, unknown>>();
    return { role: auth.role, comments: result.results.map(rowToComment) };
  }
  return { role: auth.role, comments: auth.stored.comments ?? [] };
}

export async function createComment(input: {
  id: string;
  token: string;
  body?: unknown;
  quote?: unknown;
  relativeStart?: unknown;
  relativeEnd?: unknown;
  parentId?: unknown;
  authorName?: unknown;
}): Promise<SharedComment | "forbidden" | null> {
  const auth = await authenticatedRecord(input.id, input.token);
  if (!auth) return null;
  if (auth.role === "read") return "forbidden";
  const now = Date.now();
  const comment: SharedComment = {
    id: crypto.randomUUID(),
    documentId: input.id,
    parentId: typeof input.parentId === "string" ? input.parentId.slice(0, 80) || null : null,
    body: cleanComment(input.body),
    quote: typeof input.quote === "string" ? input.quote.slice(0, 500) : "",
    relativeStart: typeof input.relativeStart === "string" ? input.relativeStart.slice(0, 2000) : null,
    relativeEnd: typeof input.relativeEnd === "string" ? input.relativeEnd.slice(0, 2000) : null,
    authorName: cleanShortText(input.authorName, "Guest", 50),
    resolved: false,
    createdAt: now,
    updatedAt: now,
  };
  if (auth.database) {
    await auth.database
      .prepare(
        `INSERT INTO document_comments
         (id, document_id, parent_id, body, quote, relative_start, relative_end,
          author_name, resolved, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(
        comment.id,
        input.id,
        comment.parentId,
        comment.body,
        comment.quote,
        comment.relativeStart,
        comment.relativeEnd,
        comment.authorName,
        now,
        now,
      )
      .run();
  } else {
    await withNodeWrite(async () => {
      const store = await readNodeStore();
      const current = store[input.id];
      if (!current) return;
      current.comments = [...(current.comments ?? []), comment];
      store[input.id] = current;
      await writeNodeStore(store);
    });
  }
  return comment;
}

export async function resolveComment(input: {
  id: string;
  commentId: string;
  token: string;
  resolved?: unknown;
}): Promise<SharedComment | "forbidden" | null> {
  const auth = await authenticatedRecord(input.id, input.token);
  if (!auth) return null;
  if (auth.role !== "edit") return "forbidden";
  const resolved = input.resolved !== false;
  const now = Date.now();
  if (auth.database) {
    await auth.database
      .prepare(
        "UPDATE document_comments SET resolved = ?, updated_at = ? WHERE id = ? AND document_id = ?",
      )
      .bind(resolved ? 1 : 0, now, input.commentId, input.id)
      .run();
    const row = await auth.database
      .prepare(
        `SELECT id, document_id, parent_id, body, quote, relative_start, relative_end,
          author_name, resolved, created_at, updated_at
         FROM document_comments WHERE id = ? AND document_id = ?`,
      )
      .bind(input.commentId, input.id)
      .first<Record<string, unknown>>();
    return row ? rowToComment(row) : null;
  }
  return withNodeWrite(async () => {
    const store = await readNodeStore();
    const current = store[input.id];
    const comment = current?.comments?.find((item) => item.id === input.commentId);
    if (!current || !comment) return null;
    comment.resolved = resolved;
    comment.updatedAt = now;
    await writeNodeStore(store);
    return comment;
  });
}
