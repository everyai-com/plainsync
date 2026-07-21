import { NextResponse } from "next/server";
import { createNamedSnapshot, listDocumentHistory } from "@/db/documents";

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
    const result = await listDocumentHistory(id, bearerToken(request));
    if (!result) return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Document history is unavailable." }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createNamedSnapshot({
      id,
      token: bearerToken(request),
      label: body.label,
      actor: body.actor,
    });
    if (result === "forbidden") {
      return NextResponse.json({ error: "Only editors can create snapshots." }, { status: 403 });
    }
    if (!result) return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    return NextResponse.json({ version: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create snapshot.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
