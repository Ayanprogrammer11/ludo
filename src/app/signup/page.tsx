import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthNav } from "@/components/auth/auth-nav";
import { getOptionalUser } from "@/lib/auth/dal";
import { safeNextPath } from "@/lib/auth/validation";

export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
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
        <Suspense fallback={<AuthShell mode="signup" nextPath="/account" />}>
          <SignupGate searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

async function SignupGate({ searchParams }: { searchParams: Promise<{ next?: string | string[] }> }) {
  const params = await searchParams;
  const nextPath = safeNextPath(params.next);
  const user = await getOptionalUser();
  if (user) redirect(nextPath);
  return <AuthShell mode="signup" nextPath={nextPath} />;
}

function AuthShell({ mode, nextPath }: { mode: "signup"; nextPath: string }) {
  return (
    <section className="auth-panel">
      <div className="auth-copy">
        <span className="eyebrow">Join the table</span>
        <h1>Create your account.</h1>
        <p>Your account name is what friends see in online rooms and match history.</p>
      </div>
      <AuthForm mode={mode} nextPath={nextPath} />
      <p className="auth-switch">Already have an account? <Link href={`/login?next=${encodeURIComponent(nextPath)}`}>Sign in</Link></p>
    </section>
  );
}
