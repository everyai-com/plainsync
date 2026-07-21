import { NextResponse } from "next/server";
import { resolveComment } from "@/db/documents";

export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; commentId: string }> },
) {
  const { id, commentId } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await resolveComment({
      id,
      commentId,
      token: bearerToken(request),
      resolved: body.resolved,
    });
    if (result === "forbidden") {
      return NextResponse.json({ error: "Only editors can resolve comments." }, { status: 403 });
    }
    if (!result) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
    return NextResponse.json({ comment: result });
  } catch {
    return NextResponse.json({ error: "Unable to update comment." }, { status: 400 });
  }
}
