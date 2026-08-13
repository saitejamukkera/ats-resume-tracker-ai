"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Github,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { api, API_BASE_URL, ensureCsrfToken } from "@/lib/api";
import { Logo } from "@/components/Logo";

type View = "login" | "signup" | "signup-otp" | "forgot" | "forgot-otp";

interface AuthPageProps {
  initialView?: View;
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09A6.99 6.99 0 0 1 5.49 12c0-.73.13-1.43.35-2.09V7.07H2.18A10.95 10.95 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

export default function AuthPage({ initialView = "login" }: AuthPageProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { login, user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [csrfReady, setCsrfReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);

  useEffect(() => {
    if (user) router.replace("/dashboard");
  }, [user, router]);

  useEffect(() => {
    ensureCsrfToken().finally(() => setCsrfReady(true));
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);

  const clearMessages = () => {
    setError("");
    setSuccess("");
  };

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setOtp("");
    setNewPassword("");
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const switchView = (next: View) => {
    clearMessages();
    setView(next);
    if (next === "login") router.push("/login");
    if (next === "signup") router.push("/register");
  };

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await login(email, password);
      router.replace("/dashboard");
    } catch (loginError) {
      setError(loginError instanceof Error ? loginError.message : "Sign-in failed. Check your details and try again.");
      setLoading(false);
    }
  };

  const handleSendSignupOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await api.auth.sendOtp(email);
      setView("signup-otp");
      setCountdown(60);
      setOtp("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn’t send the code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      await api.auth.verifyOtpRegister(email, password, fullName, otp);
      await login(email, password);
      router.replace("/dashboard");
    } catch (verifyError) {
      setError(verifyError instanceof Error ? verifyError.message : "Verification failed. Check the code and try again.");
      setLoading(false);
    }
  };

  const handleForgotSendOtp = async (event: React.FormEvent) => {
    event.preventDefault();
    clearMessages();
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
      setView("forgot-otp");
      setCountdown(60);
      setOtp("");
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : "Couldn’t send the code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (otp.length !== 6) {
      setError("Enter the 6-digit code from your email.");
      return;
    }
    clearMessages();
    setLoading(true);
    try {
      await api.auth.resetPassword(email, otp, newPassword);
      resetForm();
      setView("login");
      setSuccess("Password reset. You can now sign in.");
    } catch (resetError) {
      setError(resetError instanceof Error ? resetError.message : "Couldn’t reset your password. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    clearMessages();
    setLoading(true);
    try {
      if (view === "signup-otp") await api.auth.sendOtp(email);
      else await api.auth.forgotPassword(email);
      setCountdown(60);
      setOtp("");
      setSuccess("A new code was sent.");
    } catch (resendError) {
      setError(resendError instanceof Error ? resendError.message : "Couldn’t resend the code. Try again.");
    } finally {
      setLoading(false);
    }
  };

  const socialButtons = (
    <div className="auth-socials grid gap-3">
      <button type="button" className="button-secondary" onClick={() => { window.location.href = `${API_BASE_URL}/oauth2/authorization/google`; }}>
        <GoogleIcon /> Continue with Google
      </button>
      <button type="button" className="button-secondary" onClick={() => { window.location.href = `${API_BASE_URL}/oauth2/authorization/github`; }}>
        <Github size={16} aria-hidden="true" /> Continue with GitHub
      </button>
    </div>
  );

  const emailField = (
    <div>
      <label htmlFor="auth-email" className="field-label">Email</label>
      <input
        id="auth-email"
        name="email"
        type="email"
        inputMode="email"
        autoComplete="email"
        spellCheck={false}
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        placeholder="jane.doe@gmail.com"
        className="field"
      />
    </div>
  );

  const passwordField = (
    <div>
      <label htmlFor="auth-password" className="field-label">Password</label>
      <div className="relative">
        <input
          id="auth-password"
          name="password"
          type={showPassword ? "text" : "password"}
          autoComplete={view === "login" ? "current-password" : "new-password"}
          required
          minLength={6}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Enter your password"
          className="field pr-12"
        />
        <button
          type="button"
          className="icon-button absolute right-0 top-0"
          onClick={() => setShowPassword((visible) => !visible)}
          aria-label={showPassword ? "Hide password" : "Show password"}
        >
          {showPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
        </button>
      </div>
      {view === "login" && (
        <button
          type="button"
          className="auth-forgot text-primary-600 hover:text-primary-700"
          onClick={() => switchView("forgot")}
        >
          Forgot Password?
        </button>
      )}
    </div>
  );

  const otpField = (
    <div>
      <label htmlFor="verification-code" className="field-label">Verification Code</label>
      <input
        id="verification-code"
        name="one-time-code"
        type="text"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="[0-9]{6}"
        maxLength={6}
        required
        value={otp}
        onChange={(event) => setOtp(event.target.value.replace(/\D/g, "").slice(0, 6))}
        placeholder="6-digit code"
        className="field font-mono text-center text-xl tracking-[0.35em] tabular-nums"
      />
    </div>
  );

  if ((!csrfReady || authLoading) && !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="text-sm font-medium text-text-secondary">Preparing Sign In…</p>
        </div>
      </main>
    );
  }

  const isPrimaryView = view === "login" || view === "signup";
  const title = view === "login" ? "Welcome Back" : view === "signup" ? "Create Your Account" : view === "signup-otp" ? "Verify Your Email" : view === "forgot" ? "Reset Your Password" : "Choose a New Password";

  return (
    <div className="auth-page min-h-screen bg-background text-text-primary">
      <a href="#auth-main" className="skip-link">Skip to Sign In</a>
      <header className="auth-header">
        <Link href="/" aria-label="TrackHire AI home"><Logo size="lg" /></Link>
        <div className="flex items-center gap-2">
          <button type="button" className="icon-button" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}>
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <Link href="/" className="button-quiet px-3 text-sm font-semibold">Home</Link>
        </div>
      </header>

      <main id="auth-main" className="auth-main paper-edge">
        <div className="auth-inner">
        <section className="auth-intro text-center">
          <h1 className="font-display text-[clamp(3.35rem,6vw,4.6rem)] font-[390] leading-none tracking-[-0.04em]">{title}</h1>
          <p className="mx-auto mt-5 max-w-[470px] text-lg leading-7 text-text-secondary">
            {view === "login" ? "Sign in to manage your applications, track progress, and optimize your resume." : view === "signup" ? "Create a focused workspace for tracking applications and tailoring career documents." : view === "forgot" ? "Enter the email connected to your account and we’ll send a verification code." : `Enter the code sent to ${email}.`}
          </p>
        </section>

        <section className="auth-surface surface overflow-hidden bg-surface-raised" aria-label="Account access">
          {isPrimaryView ? (
            <div className="grid grid-cols-2 border-b border-border" role="tablist" aria-label="Account access">
              <button type="button" role="tab" aria-selected={view === "login"} className={`min-h-12 border-b-2 text-sm font-semibold ${view === "login" ? "border-primary-600 text-primary-600" : "border-transparent text-text-muted hover:text-text-primary"}`} onClick={() => switchView("login")}>Sign In</button>
              <button type="button" role="tab" aria-selected={view === "signup"} className={`min-h-12 border-b-2 text-sm font-semibold ${view === "signup" ? "border-primary-600 text-primary-600" : "border-transparent text-text-muted hover:text-text-primary"}`} onClick={() => switchView("signup")}>Sign Up</button>
            </div>
          ) : (
            <div className="flex items-center gap-2 border-b border-border px-4 py-3">
              <button type="button" className="icon-button" aria-label="Go back" onClick={() => switchView(view === "signup-otp" ? "signup" : view === "forgot-otp" ? "forgot" : "login")}>
                <ArrowLeft size={18} aria-hidden="true" />
              </button>
              <p className="text-sm font-semibold">Account Recovery</p>
            </div>
          )}

          <div className="p-6 sm:p-8">
            {error && <div className="mb-5 rounded-[6px] border border-danger bg-danger-bg px-4 py-3 text-sm font-medium text-danger-text" role="alert">{error}</div>}
            {success && <div className="mb-5 rounded-[6px] border border-success bg-success-bg px-4 py-3 text-sm font-medium text-success-text" role="status">{success}</div>}

            {view === "login" && (
              <>
                <form onSubmit={handleLogin} className="space-y-5">
                  {emailField}
                  {passwordField}
                  <button type="submit" disabled={loading} className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60">
                    {loading ? "Signing In…" : "Sign In"}
                  </button>
                </form>
                <div className="my-6 flex items-center gap-3 text-xs text-text-muted"><span className="h-px flex-1 bg-border" /><span>or continue with</span><span className="h-px flex-1 bg-border" /></div>
                {socialButtons}
              </>
            )}

            {view === "signup" && (
              <>
                <form onSubmit={handleSendSignupOtp} className="space-y-5">
                  <div>
                    <label htmlFor="full-name" className="field-label">Full Name</label>
                    <input id="full-name" name="name" type="text" autoComplete="name" required value={fullName} onChange={(event) => setFullName(event.target.value)} placeholder="Your full name" className="field" />
                  </div>
                  {emailField}
                  {passwordField}
                  <button type="submit" disabled={loading} className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Sending Code…" : "Send Verification Code"}</button>
                </form>
                <div className="my-6 flex items-center gap-3 text-xs text-text-muted"><span className="h-px flex-1 bg-border" /><span>or continue with</span><span className="h-px flex-1 bg-border" /></div>
                {socialButtons}
              </>
            )}

            {view === "signup-otp" && (
              <form onSubmit={handleVerifyAndRegister} className="space-y-5">
                <ShieldCheck className="text-primary-600" size={28} strokeWidth={1.5} aria-hidden="true" />
                {otpField}
                <button type="submit" disabled={loading || otp.length !== 6} className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Creating Account…" : "Verify & Create Account"}</button>
                <button type="button" disabled={loading || countdown > 0} onClick={handleResendOtp} className="button-quiet w-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">
                  {countdown > 0 ? `Resend Code in ${countdown}s` : "Resend Code"}
                </button>
              </form>
            )}

            {view === "forgot" && (
              <form onSubmit={handleForgotSendOtp} className="space-y-5">
                {emailField}
                <button type="submit" disabled={loading} className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Sending Code…" : "Send Reset Code"}</button>
              </form>
            )}

            {view === "forgot-otp" && (
              <form onSubmit={handleResetPassword} className="space-y-5">
                {otpField}
                <div>
                  <label htmlFor="new-password" className="field-label">New Password</label>
                  <div className="relative">
                    <input id="new-password" name="new-password" type={showNewPassword ? "text" : "password"} autoComplete="new-password" minLength={6} required value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="At least 6 characters" className="field pr-12" />
                    <button type="button" className="icon-button absolute right-0 top-0" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? "Hide new password" : "Show new password"}>
                      {showNewPassword ? <EyeOff size={17} aria-hidden="true" /> : <Eye size={17} aria-hidden="true" />}
                    </button>
                  </div>
                </div>
                <button type="submit" disabled={loading || otp.length !== 6} className="button-primary w-full disabled:cursor-not-allowed disabled:opacity-60">{loading ? "Resetting Password…" : "Reset Password"}</button>
                <button type="button" disabled={loading || countdown > 0} onClick={handleResendOtp} className="button-quiet w-full text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60">{countdown > 0 ? `Resend Code in ${countdown}s` : "Resend Code"}</button>
              </form>
            )}
          </div>
        </section>
        <p className="mt-10 text-center text-sm text-text-secondary">© {new Date().getFullYear()} TrackHire AI. All rights reserved.</p>
        </div>
      </main>
    </div>
  );
}
