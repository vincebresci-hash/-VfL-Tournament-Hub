import { NextResponse } from "next/server";
import { assertBearerSecret, readInboxSyncSecret } from "@/lib/inbox/config";
import { runInboxSyncBatch } from "@/lib/inbox/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Hobby-safe ceiling; batching keeps work within shorter budgets. */
export const maxDuration = 10;

/**
 * Protected sync endpoint for future external schedulers.
 * Vercel Cron uses GET. Not enabled on Hobby via vercel.json.
 * Auth: Authorization: Bearer <INBOX_SYNC_SECRET> (inbox-specific only).
 */
export async function GET(request: Request) {
  const secret = readInboxSyncSecret();
  if (!secret) {
    return NextResponse.json({ error: "Sync secret not configured." }, { status: 503 });
  }

  const authorized = assertBearerSecret(request.headers.get("authorization"), secret);
  if (!authorized) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const result = await runInboxSyncBatch();
  return NextResponse.json({
    ok: !result.error,
    ...result,
  });
}
