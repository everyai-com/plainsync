import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const origin = new URL(request.url).origin;
  return NextResponse.json({
    openapi: "3.1.0",
    info: {
      title: "PlainSync Agent API",
      version: "0.2.0",
      description: "Revision-aware Markdown documents with Yjs synchronization, history, and comments.",
    },
    servers: [{ url: origin }],
    components: {
      securitySchemes: { bearerLinkKey: { type: "http", scheme: "bearer" } },
    },
    security: [{ bearerLinkKey: [] }],
    paths: {
      "/api/documents/{id}": {
        get: { summary: "Read a document and access role" },
        put: { summary: "Replace Markdown with an expected revision" },
      },
      "/api/documents/{id}/sync": {
        post: { summary: "Exchange conflict-free Yjs updates and presence" },
      },
      "/api/documents/{id}/history": {
        get: { summary: "List document versions" },
        post: { summary: "Create a named snapshot" },
      },
      "/api/documents/{id}/comments": {
        get: { summary: "List comments" },
        post: { summary: "Create an anchored comment" },
      },
    },
  });
}
