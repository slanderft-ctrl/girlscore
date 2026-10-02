import Link from "next/link";
import { requireAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

const links = [
  { href: "/admin", label: "Сьогодні" },
  { href: "/admin/calendar", label: "Календар" },
  { href: "/admin/groups", label: "Групи" },
  { href: "/admin/clients", label: "Клієнти" },
  { href: "/admin/pass-types", label: "Абонементи" },
];

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <div>
      <nav className="-mx-4 mb-6 flex gap-1 overflow-x-auto border-b border-line px-4 pb-2">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm hover:bg-surface">
            {l.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
