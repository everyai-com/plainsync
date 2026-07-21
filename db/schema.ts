import { index, integer, primaryKey, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const documents = sqliteTable(
  "documents",
  {
    id: text("id").primaryKey(),
    title: text("title").notNull(),
    content: text("content").notNull(),
    writeTokenHash: text("write_token_hash").notNull(),
    revision: integer("revision").notNull().default(1),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("documents_updated_at_idx").on(table.updatedAt)],
);

export const documentAccess = sqliteTable(
  "document_access",
  {
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull(),
    role: text("role", { enum: ["read", "suggest"] }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.tokenHash] }),
    index("document_access_document_idx").on(table.documentId),
  ],
);

export const documentCrdt = sqliteTable("document_crdt", {
  documentId: text("document_id").primaryKey().references(() => documents.id, { onDelete: "cascade" }),
  stateBase64: text("state_base64").notNull(),
  updatedAt: integer("updated_at").notNull(),
});

export const documentVersions = sqliteTable(
  "document_versions",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull(),
    revision: integer("revision").notNull(),
    label: text("label"),
    actor: text("actor").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (table) => [index("document_versions_document_idx").on(table.documentId, table.createdAt)],
);

export const documentComments = sqliteTable(
  "document_comments",
  {
    id: text("id").primaryKey(),
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    parentId: text("parent_id"),
    body: text("body").notNull(),
    quote: text("quote").notNull(),
    relativeStart: text("relative_start"),
    relativeEnd: text("relative_end"),
    authorName: text("author_name").notNull(),
    resolved: integer("resolved", { mode: "boolean" }).notNull().default(false),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (table) => [index("document_comments_document_idx").on(table.documentId, table.createdAt)],
);

export const documentPresence = sqliteTable(
  "document_presence",
  {
    documentId: text("document_id").notNull().references(() => documents.id, { onDelete: "cascade" }),
    sessionId: text("session_id").notNull(),
    name: text("name").notNull(),
    color: text("color").notNull(),
    lastSeen: integer("last_seen").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.sessionId] }),
    index("document_presence_seen_idx").on(table.documentId, table.lastSeen),
  ],
);
