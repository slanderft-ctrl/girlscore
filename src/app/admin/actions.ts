"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { addDays, zonedToUtc } from "@/lib/format";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => Number(fd.get(k));

async function regenerate() {
  const { error } = await createAdminClient().rpc("generate_sessions");
  if (error) throw error;
}

// ---- Groups -----------------------------------------------------------------

export async function saveGroup(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const row = {
    name: str(fd, "name"),
    description: str(fd, "description") || null,
    location: str(fd, "location") || null,
    capacity: num(fd, "capacity") || 10,
    active: fd.get("active") === "on",
  };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("groups").update(row).eq("id", id)
    : await supabase.from("groups").insert(row);
  if (error) throw error;
  if (id) {
    // New capacity applies to classes not yet locked.
    await supabase.from("sessions").update({ capacity: row.capacity }).eq("group_id", id).is("locked_at", null);
  }
  await regenerate();
  revalidatePath("/admin/groups");
}

export async function addGroupTime(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase.from("group_times").insert({
    group_id: str(fd, "groupId"),
    weekday: num(fd, "weekday"),
    start_time: str(fd, "start"),
    end_time: str(fd, "end"),
  });
  if (error) throw error;
  await regenerate();
  revalidatePath("/admin/groups");
}

/** Stops a weekly time: future classes that nobody is locked into are removed. */
export async function removeGroupTime(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const id = str(fd, "id");
  await supabase.from("group_times").update({ active: false }).eq("id", id);
  await supabase.from("schedule_slots").update({ ended_at: new Date().toISOString() }).eq("group_time_id", id).is("ended_at", null);
  await supabase.from("sessions").delete().eq("group_time_id", id).is("locked_at", null).gt("starts_at", new Date().toISOString());
  revalidatePath("/admin/groups");
}

// ---- Classes ----------------------------------------------------------------

export async function cancelSession(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "sessionId");
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_session", { p_session_id: id });
  if (error) throw error;
  revalidatePath(`/admin/calendar/${id}`);
}

/** Cancels every class between two dates (holidays). */
export async function cancelRange(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data } = await supabase.from("sessions").select("id")
    .gte("starts_at", zonedToUtc(str(fd, "from"), "00:00")).lt("starts_at", zonedToUtc(addDays(str(fd, "to"), 1), "00:00"))
    .eq("cancelled", false);
  for (const s of data ?? []) await supabase.rpc("cancel_session", { p_session_id: s.id });
  revalidatePath("/admin/calendar");
  redirect(`/admin/calendar?week=${str(fd, "from")}&cancelled=${data?.length ?? 0}`);
}

export async function markAttendance(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const status = str(fd, "status");
  if (["attended", "no_show"].includes(status)) {
    await supabase.from("attendance").update({ status, updated_at: new Date().toISOString() }).eq("id", str(fd, "attendanceId"));
  }
  revalidatePath(`/admin/calendar/${str(fd, "sessionId")}`);
}

export async function returnVisit(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("return_visit", { p_attendance_id: str(fd, "attendanceId") });
  revalidatePath("/admin", "layout");
}

// ---- Clients ----------------------------------------------------------------

export async function createClientProfile(fd: FormData) {
  await requireAdmin();
  const digits = str(fd, "phone").replace(/\D/g, "");
  const phone = digits.length === 8 ? `47${digits}` : digits;
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    phone,
    phone_confirm: true,
    user_metadata: { full_name: str(fd, "full_name") },
  });
  if (error || !data.user) redirect(`/admin/clients?error=${encodeURIComponent(error?.message ?? "failed")}`);
  redirect(`/admin/clients/${data.user.id}`);
}

export async function updateClientProfile(fd: FormData) {
  await requireAdmin();
  const id = str(fd, "id");
  const supabase = await createClient();
  await supabase.from("profiles").update({
    full_name: str(fd, "full_name") || null,
    email: str(fd, "email") || null,
    notes: str(fd, "notes") || null,
  }).eq("id", id);
  revalidatePath(`/admin/clients/${id}`);
}

/** A pass paid outside the app (cash, transfer) or given for free. */
export async function grantPass(fd: FormData) {
  await requireAdmin();
  const clientId = str(fd, "clientId");
  const db = createAdminClient();
  const { data: pt } = await db.from("pass_types").select("*").eq("id", str(fd, "passTypeId")).single();
  if (!pt) throw new Error("pass type not found");
  const { data: payment, error } = await db.from("payments").insert({
    client_id: clientId,
    pass_type_id: pt.id,
    provider: "manual",
    amount_minor: fd.get("free") ? 0 : pt.price_minor,
    currency: pt.currency,
  }).select().single();
  if (error) throw error;
  const { error: fulfilError } = await db.rpc("fulfil_payment", { p_payment_id: payment.id });
  if (fulfilError) throw fulfilError;
  revalidatePath(`/admin/clients/${clientId}`);
}

export async function adjustPass(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const { data: pass } = await supabase.from("client_passes").select("*").eq("id", str(fd, "passId")).single();
  if (!pass) return;
  const left = Math.max(0, num(fd, "visitsLeft"));
  const expires = str(fd, "expires");
  const expiresAt = expires ? zonedToUtc(expires, "23:59") : null;
  await supabase.from("client_passes").update({
    visits_left: left,
    status: left === 0 ? "used_up" : expiresAt && new Date(expiresAt) < new Date() ? "expired" : "active",
    ...(expiresAt ? { expires_at: expiresAt, first_class_at: pass.first_class_at ?? new Date().toISOString() } : {}),
  }).eq("id", pass.id);
  await createAdminClient().rpc("sync_client", { p_client: pass.client_id });
  revalidatePath(`/admin/clients/${pass.client_id}`);
}

// ---- Pass types -------------------------------------------------------------

export async function savePassType(fd: FormData) {
  await requireAdmin();
  const supabase = await createClient();
  const row = {
    name: str(fd, "name"),
    description: str(fd, "description") || null,
    visits: num(fd, "visits"),
    valid_days: num(fd, "valid_days") || 30,
    price_minor: Math.round(num(fd, "price") * 100),
    active: fd.get("active") === "on",
    sort_order: num(fd, "sort_order") || 0,
  };
  const id = str(fd, "id");
  const { error } = id
    ? await supabase.from("pass_types").update(row).eq("id", id)
    : await supabase.from("pass_types").insert(row);
  if (error) throw error;
  revalidatePath("/admin/pass-types");
  revalidatePath("/passes");
}
