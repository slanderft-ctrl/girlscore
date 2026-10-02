import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import "./globals.css";

const name = process.env.NEXT_PUBLIC_STUDIO_NAME ?? "Studio";

export const metadata: Metadata = {
  title: { default: name, template: `%s · ${name}` },
  description: `Timeplan og klippekort for ${name}.`,
  appleWebApp: { capable: true, title: name, statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbfaf8" },
    { media: "(prefers-color-scheme: dark)", color: "#141412" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <html lang="nb">
      <body className="antialiased">
        <header className="sticky top-0 z-10 border-b border-line bg-bg/90 pt-[env(safe-area-inset-top)] backdrop-blur">
          <div className="mx-auto flex max-w-5xl items-center gap-1 px-4 py-3">
            <Link href="/" className="mr-auto text-lg font-semibold">{name}</Link>
            <Link href="/" className="rounded-lg px-2 py-1 text-sm hover:bg-surface">Timeplan</Link>
            <Link href="/passes" className="rounded-lg px-2 py-1 text-sm hover:bg-surface">Klippekort</Link>
            {user?.is_admin && <Link href="/admin" className="rounded-lg px-2 py-1 text-sm font-medium text-accent hover:bg-surface">Адмін</Link>}
            <Link href={user ? "/me" : "/login"} className="rounded-lg px-2 py-1 text-sm hover:bg-surface">
              {user ? "Min side" : "Logg inn"}
            </Link>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">{children}</main>
      </body>
    </html>
  );
}
