import { createClient } from "@/lib/supabase/server";
import type { PassType } from "@/lib/types";
import { savePassType } from "../actions";

function PassTypeForm({ pt }: { pt?: PassType }) {
  return (
    <form action={savePassType} className="card grid gap-3 sm:grid-cols-6">
      {pt && <input type="hidden" name="id" value={pt.id} />}
      <label className="label sm:col-span-2">Назва<input className="input" name="name" required defaultValue={pt?.name} /></label>
      <label className="label">Занять<input className="input" type="number" min={1} name="visits" required defaultValue={pt?.visits} /></label>
      <label className="label">Днів дії<input className="input" type="number" min={1} name="valid_days" required defaultValue={pt?.valid_days ?? 30} /></label>
      <label className="label">Ціна, кр<input className="input" type="number" min={0} step="1" name="price" required defaultValue={pt ? pt.price_minor / 100 : ""} /></label>
      <label className="label">Порядок<input className="input" type="number" name="sort_order" defaultValue={pt?.sort_order ?? 0} /></label>
      <label className="label sm:col-span-5">Опис<input className="input" name="description" defaultValue={pt?.description ?? ""} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={pt?.active ?? true} /> У продажу</label>
      <button className="btn-ghost sm:col-span-6">{pt ? "Зберегти" : "Додати абонемент"}</button>
    </form>
  );
}

export default async function PassTypesPage() {
  const supabase = await createClient();
  const { data } = await supabase.from("pass_types").select("*").order("sort_order");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Абонементи</h1>
      <p className="text-sm text-muted">Що можуть купити клієнти. Дні дії рахуються від першого заняття. Зміни не впливають на вже куплені абонементи.</p>
      {((data ?? []) as PassType[]).map((pt) => <PassTypeForm key={pt.id} pt={pt} />)}
      <h2 className="pt-4 text-lg font-semibold">Новий абонемент</h2>
      <PassTypeForm />
    </div>
  );
}
