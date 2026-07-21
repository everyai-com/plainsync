import { NextResponse } from "next/server";
import { createSharedDocument } from "@/db/documents";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const result = await createSharedDocument(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to share document.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
