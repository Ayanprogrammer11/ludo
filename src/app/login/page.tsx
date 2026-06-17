import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthNav } from "@/components/auth/auth-nav";
import { getOptionalUser } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/validation";

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  return (
    <main>
      <nav className="site-nav">
        <Link className="brand" href="/" aria-label="Ludo home">
          <span className="brand-mark"><i /><i /><i /><i /></span>
          <span>Ludo<span className="brand-accent">.</span></span>
        </Link>
        <Suspense fallback={<div className="nav-status">Account</div>}>
          <AuthNav />
        </Suspense>
      </nav>
      <div className="auth-page">
        <Suspense fallback={<AuthShell mode="login" nextPath="/account" />}>
          <LoginGate searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function LoginGate({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const user = await getOptionalUser();
  if (user) redirect(nextPath);
  return <AuthShell mode="login" nextPath={nextPath} />;
}

function AuthShell({ mode, nextPath }: { mode: "login"; nextPath: string }) {
  return (
    <section className="auth-panel">
      <div className="auth-copy">
        <span className="eyebrow">Account</span>
        <h1>Welcome back.</h1>
        <p>Sign in to create rooms, keep your seat secure, and save match results.</p>
      </div>
      <AuthForm mode={mode} nextPath={nextPath} />
      <p className="auth-switch">New here? <Link href={`/signup?next=${encodeURIComponent(nextPath)}`}>Create an account</Link></p>
    </section>
  );
}
