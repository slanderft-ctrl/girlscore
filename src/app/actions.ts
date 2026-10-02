"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Shared by the client pages and the owner pages. The database functions
// check who may do what; `clientId` is only honoured for the owner.

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const errorCodes = ["group_full", "full", "no_pass", "too_late", "already_started", "not_available", "not_booked", "not_signed_in"];

async function run(fd: FormData, fn: string, args: Record<string, unknown>) {
  const clientId = str(fd, "clientId");
  const back = str(fd, "back") || "/me";
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, clientId ? { ...args, p_client: clientId } : args);
  revalidatePath("/", "layout");
  const sep = back.includes("?") ? "&" : "?";
  if (error) {
    const code = errorCodes.find((c) => error.message.includes(c)) ?? "error";
    redirect(`${back}${sep}err=${code}`);
  }
  return { data, back, sep };
}

export async function addSlot(fd: FormData) {
  const { back, sep } = await run(fd, "add_slot", { p_group_time_id: str(fd, "groupTimeId") });
  redirect(`${back}${sep}ok=slot_added`);
}

export async function removeSlot(fd: FormData) {
  const { back, sep } = await run(fd, "remove_slot", { p_group_time_id: str(fd, "groupTimeId") });
  redirect(`${back}${sep}ok=slot_removed`);
}

export async function setComing(fd: FormData) {
  const coming = str(fd, "coming") === "1";
  const { data, back, sep } = await run(fd, "set_coming", { p_session_id: str(fd, "sessionId"), p_coming: coming });
  redirect(`${back}${sep}ok=${coming ? "coming" : data === "used" ? "absent_used" : "absent"}`);
}

export async function bookSingle(fd: FormData) {
  const { back, sep } = await run(fd, "book_single", { p_session_id: str(fd, "sessionId") });
  redirect(`${back}${sep}ok=booked`);
}

export async function addPause(fd: FormData) {
  const { back, sep } = await run(fd, "add_pause", { p_starts_on: str(fd, "from"), p_ends_on: str(fd, "to") });
  redirect(`${back}${sep}ok=paused`);
}

export async function removePause(fd: FormData) {
  const { back, sep } = await run(fd, "remove_pause", { p_pause_id: str(fd, "pauseId") });
  redirect(`${back}${sep}ok=unpaused`);
}

export async function updateMyProfile(fd: FormData) {
  const { back, sep } = await run(fd, "update_my_profile", { p_full_name: str(fd, "full_name"), p_email: str(fd, "email") });
  redirect(`${back}${sep}ok=saved`);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
