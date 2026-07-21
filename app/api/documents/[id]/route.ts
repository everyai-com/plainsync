import { NextResponse } from "next/server";
import {
  authenticateDocument,
  updateSharedDocument,
} from "@/db/documents";

export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const result = await authenticateDocument(id, bearerToken(request));
    if (!result) {
      return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Document storage is unavailable." }, { status: 503 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await updateSharedDocument({
      id,
      token: bearerToken(request),
      title: body.title,
      content: body.content,
      expectedRevision: body.expectedRevision,
      actor: body.actor,
    });
    if (result.status === "unauthorized") {
      return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    }
    if (result.status === "forbidden") {
      return NextResponse.json({ error: "This link cannot edit the document." }, { status: 403 });
    }
    if (result.status === "conflict") {
      return NextResponse.json(
        { error: "A newer version is available.", document: result.document },
        { status: 409 },
      );
    }
    return NextResponse.json({ document: result.document });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save document.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
