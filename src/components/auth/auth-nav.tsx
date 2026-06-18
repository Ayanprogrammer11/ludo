import Link from "next/link";
import { UserRound } from "lucide-react";
import { LogoutButton } from "@/components/auth/logout-button";
import { LinkPendingIndicator } from "@/components/loading/link-pending-indicator";
import { logoutAction } from "@/lib/auth/actions";
import { getOptionalUser } from "@/lib/auth/dal";

export async function AuthNav() {
  const user = await getOptionalUser();

  if (!user) {
    return (
      <div className="auth-nav">
        <Link className="nav-button" href="/login">Sign in <LinkPendingIndicator /></Link>
        <Link className="nav-button nav-button-strong" href="/signup">Create account <LinkPendingIndicator /></Link>
      </div>
    );
  }

  return (
    <div className="auth-nav">
      <Link className="nav-button account-link" href="/account"><UserRound size={14} /> {user.displayName}<LinkPendingIndicator /></Link>
      <form action={logoutAction}>
        <LogoutButton />
      </form>
    </div>
  );
}
