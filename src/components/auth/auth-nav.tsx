import Link from "next/link";
import { LogOut, UserRound } from "lucide-react";
import { logoutAction } from "@/lib/auth/actions";
import { getOptionalUser } from "@/lib/auth/dal";

export async function AuthNav() {
  const user = await getOptionalUser();

  if (!user) {
    return (
      <div className="auth-nav">
        <Link className="nav-button" href="/login">Sign in</Link>
        <Link className="nav-button nav-button-strong" href="/signup">Create account</Link>
      </div>
    );
  }

  return (
    <div className="auth-nav">
      <Link className="nav-button account-link" href="/account"><UserRound size={14} /> {user.displayName}</Link>
      <form action={logoutAction}>
        <button className="nav-button icon-nav-button" type="submit" aria-label="Sign out"><LogOut size={14} /></button>
      </form>
    </div>
  );
}
