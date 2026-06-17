"use client";

import { ArrowRight, LoaderCircle, LogIn, UserPlus } from "lucide-react";
import { useActionState } from "react";
import type { AuthActionState } from "@/lib/auth/actions";
import { loginAction, signupAction } from "@/lib/auth/actions";

const initialState: AuthActionState = { message: "" };

type AuthFormProps = {
  mode: "login" | "signup";
  nextPath: string;
};

export function AuthForm({ mode, nextPath }: AuthFormProps) {
  const action = mode === "login" ? loginAction : signupAction;
  const [state, formAction, pending] = useActionState(action, initialState);
  const isSignup = mode === "signup";

  return (
    <form className="auth-form" action={formAction}>
      <input type="hidden" name="next" value={nextPath} />
      {isSignup ? (
        <label>
          <span>Name</span>
          <input name="displayName" autoComplete="name" minLength={2} maxLength={24} required placeholder="Ayan" />
          {state.errors?.displayName ? <small>{state.errors.displayName[0]}</small> : null}
        </label>
      ) : null}
      <label>
        <span>Email</span>
        <input name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        {state.errors?.email ? <small>{state.errors.email[0]}</small> : null}
      </label>
      <label>
        <span>Password</span>
        <input
          name="password"
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          minLength={isSignup ? 12 : 1}
          maxLength={128}
          required
          placeholder={isSignup ? "12+ characters" : "Your password"}
        />
        {state.errors?.password ? <small>{state.errors.password[0]}</small> : null}
      </label>
      {state.message ? <p className="form-error" role="alert">{state.message}</p> : null}
      <button className="primary-action auth-submit" type="submit" disabled={pending}>
        {pending ? <LoaderCircle className="spin" size={18} /> : isSignup ? <UserPlus size={18} /> : <LogIn size={18} />}
        {isSignup ? "Create account" : "Sign in"}
        <ArrowRight size={15} />
      </button>
    </form>
  );
}
