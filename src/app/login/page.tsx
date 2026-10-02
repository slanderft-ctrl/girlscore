import { LoginForm } from "./login-form";

export const metadata = { title: "Logg inn" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/me";
  return (
    <div className="mx-auto max-w-sm py-10">
      <h1 className="text-2xl font-semibold">Logg inn</h1>
      <p className="mt-2 text-sm text-muted">Skriv inn mobilnummeret ditt, så sender vi deg en kode på SMS.</p>
      <LoginForm next={safeNext} />
    </div>
  );
}
