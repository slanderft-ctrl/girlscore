import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Runs once a day from Vercel Cron (vercel.json). Creates classes ahead and
// locks any due ones, as a backup for pg_cron. The daily database request
// also keeps a free Supabase project from pausing after 7 idle days.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = createAdminClient();
  const [generated, locked] = await Promise.all([db.rpc("generate_sessions"), db.rpc("lock_due_sessions")]);
  const error = generated.error ?? locked.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ generated: generated.data, locked: locked.data });
}
