import { NextResponse } from "next/server";
import { syncSharedDocument } from "@/db/documents";

export const dynamic = "force-dynamic";

function bearerToken(request: Request): string {
  const value = request.headers.get("authorization") ?? "";
  return value.startsWith("Bearer ") ? value.slice(7) : "";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await syncSharedDocument({
      id,
      token: bearerToken(request),
      update: body.update,
      stateVector: body.stateVector,
      title: body.title,
      presence: body.presence,
      actor: body.actor,
    });
    if (result.status === "unauthorized") {
      return NextResponse.json({ error: "Invalid document link." }, { status: 403 });
    }
    if (result.status === "forbidden") {
      return NextResponse.json({ error: "This link cannot edit the document." }, { status: 403 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to synchronize document.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
