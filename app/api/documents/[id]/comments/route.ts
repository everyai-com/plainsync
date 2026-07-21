import { NextResponse } from "next/server";
import { createComment, listComments } from "@/db/documents";

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
    const result = await listComments(id, bearerToken(request));
    if (!result) return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Comments are unavailable." }, { status: 503 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createComment({
      id,
      token: bearerToken(request),
      body: body.body,
      quote: body.quote,
      relativeStart: body.relativeStart,
      relativeEnd: body.relativeEnd,
      parentId: body.parentId,
      authorName: body.authorName,
    });
    if (result === "forbidden") {
      return NextResponse.json({ error: "This read-only link cannot comment." }, { status: 403 });
    }
    if (!result) return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    return NextResponse.json({ comment: result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to add comment.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
