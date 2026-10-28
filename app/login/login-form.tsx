"use client";

import { useActionState, useState } from "react";

import { type ActionState, loginAction } from "@/app/login/actions";

interface LoginFormProps {
  turnstileSiteKey: string;
  adminContactEmail: string;
}

export function LoginForm({
  turnstileSiteKey,
  adminContactEmail,
}: LoginFormProps) {
  const [state, formAction, isPending] = useActionState<
    ActionState | null,
    FormData
  >(loginAction, null);
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="login-form">
      {state?.error && (
        <div className="login-alert-error" role="alert" aria-live="polite">
          <svg
            className="login-alert-icon"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
              clipRule="evenodd"
            />
          </svg>
          <span>{state.error}</span>
        </div>
      )}

      <div className="form-group">
        <label className="sr-only" htmlFor="email">
          Institutional email
        </label>
        <div className="login-field">
          <svg
            className="login-field-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <path d="M4 6.75h16v10.5H4z" />
            <path d="m4.5 7.25 7.5 6 7.5-6" />
          </svg>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            placeholder="Email Address"
            disabled={isPending}
            className="login-input"
          />
        </div>
      </div>

      <div className="form-group">
        <label className="sr-only" htmlFor="password">
          Password
        </label>
        <div className="login-field">
          <svg
            className="login-field-icon"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            aria-hidden="true"
          >
            <rect x="6.5" y="10" width="11" height="9" rx="2" />
            <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
          </svg>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            placeholder="Password"
            disabled={isPending}
            className="login-input login-password-input"
          />
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            className="password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10.8 10.8 0 0 1 12 4c5 0 9 4.1 10 8a11.8 11.8 0 0 1-3 5.2M6.2 6.2A11.7 11.7 0 0 0 2 12c1 3.9 5 8 10 8 1.5 0 2.9-.4 4.2-1"
                />
              </svg>
            ) : (
              <svg
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path d="M2.5 12C3.7 8 7.5 5 12 5s8.3 3 9.5 7c-1.2 4-5 7-9.5 7s-8.3-3-9.5-7Z" />
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="form-row remember-row">
        <label className="remember-label">
          <input
            type="checkbox"
            name="remember_me"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            disabled={isPending}
          />
          <span>Remember me</span>
        </label>
        <a
          href={`mailto:${adminContactEmail}?subject=Password%20Reset%20Request`}
          className="forgot-link"
        >
          Forgot password?
        </a>
      </div>

      <div className="turnstile-container">
        <input
          type="hidden"
          name="turnstile_token"
          value={turnstileSiteKey ? "1x00000000000000000000AA" : ""}
        />
        <div className="turnstile-badge" aria-label="Security verification">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <rect x="6.5" y="10" width="11" height="9" rx="2" />
            <path d="M9 10V7.5a3 3 0 0 1 6 0V10" />
          </svg>
          <span>Security verification bypassed for local development</span>
        </div>
      </div>

      <button
        type="submit"
        className="login-submit-btn"
        disabled={isPending}
        aria-busy={isPending}
      >
        {isPending ? (
          <>
            <svg
              className="login-spinner"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                opacity=".25"
              />
              <path
                fill="currentColor"
                d="M4 12a8 8 0 0 1 8-8V0A12 12 0 0 0 0 12h4Z"
                opacity=".75"
              />
            </svg>
            <span>Signing in...</span>
          </>
        ) : (
          <span>Sign In</span>
        )}
      </button>

      <div className="login-divider">
        <span>Or continue with</span>
      </div>

      <div className="google-btn-wrapper">
        <button
          type="button"
          disabled
          aria-disabled="true"
          className="google-sign-in-btn"
          aria-describedby="google-disabled-note"
        >
          <svg
            className="google-icon"
            viewBox="0 0 24 24"
            width="18"
            height="18"
            aria-hidden="true"
          >
            <path fill="#4285F4" d="M23.7 12.3c0-.7-.1-1.4-.2-2.1H12v4.5h6.6a5.7 5.7 0 0 1-2.4 3.7v3h3.9c2.3-2.1 3.6-5.1 3.6-9.1Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 7.9-2.9L16 18a7.2 7.2 0 0 1-10.7-3.7h-4v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3A7.2 7.2 0 0 1 5.3 9.7V6.6h-4A12 12 0 0 0 0 12c0 1.9.4 3.7 1.3 5.4l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.4.6 4.6 1.8L20 3.1A11.6 11.6 0 0 0 12 0 12 12 0 0 0 1.3 6.6l4 3.1A7.2 7.2 0 0 1 12 4.8Z" />
          </svg>
          <span>Sign in with Google</span>
        </button>
        <p id="google-disabled-note" className="google-disabled-note" role="note">
          Google Workspace sign-in is not available yet.
        </p>
      </div>

      <div className="login-trust-note">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 5.5 5.7v5.5c0 4.1 2.7 7.8 6.5 9.8 3.8-2 6.5-5.7 6.5-9.8V5.7L12 3Z" />
          <path d="m9.2 12 1.8 1.8 3.8-4" />
        </svg>
        <span>Secured connection · SSL protected</span>
      </div>

      <div className="login-footer-links">
        <span>Don&apos;t have an account?</span>{" "}
        <a
          href={`mailto:${adminContactEmail}?subject=PECIT%20Thesis%20Archive%20Account%20Inquiry`}
          className="contact-admin-link"
        >
          Contact Administrator
        </a>
      </div>
    </form>
  );
}
