"use client";

import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import {
  Briefcase,
  Mail,
  Lock,
  User,
  Github,
  Eye,
  EyeOff,
  ArrowLeft,
  ShieldCheck,
  Sun,
  Moon,
  FileCheck,
  Shield,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/hooks/useTheme";
import { api, API_BASE_URL } from "@/lib/api";

const fadeInUp = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const staggerContainer = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.15,
    },
  },
};

type View = "login" | "signup" | "signup-otp" | "forgot" | "forgot-otp";

interface AuthPageProps {
  initialView?: View;
}

export default function AuthPage({ initialView = "login" }: AuthPageProps) {
  const { theme, toggle: toggleTheme } = useTheme();
  const { login, user } = useAuth();
  const router = useRouter();
  const [view, setView] = useState<View>(initialView);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [otp, setOtp] = useState(["", "", "", "", "", ""]);
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (user) {
      router.push("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  const resetForm = () => {
    setEmail("");
    setPassword("");
    setFullName("");
    setOtp(["", "", "", "", "", ""]);
    setNewPassword("");
    setError("");
    setSuccess("");
    setShowPassword(false);
    setShowNewPassword(false);
  };

  const otpValue = otp.join("");

  const handleOtpChange = (index: number, value: string) => {
    if (value.length > 1) value = value.slice(-1);
    if (value && !/^\d$/.test(value)) return;
    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    if (value && index < 5) {
      otpRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      otpRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      if (i < 6) newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    const focusIdx = Math.min(pasted.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleSendSignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.sendOtp(email);
      setView("signup-otp");
      setCountdown(300);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyAndRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpValue.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.auth.verifyOtpRegister(email, password, fullName, otpValue);
      await login(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await api.auth.forgotPassword(email);
      setView("forgot-otp");
      setCountdown(300);
      setOtp(["", "", "", "", "", ""]);
      setTimeout(() => otpRefs.current[0]?.focus(), 100);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code");
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpValue.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }
    if (newPassword.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    setError("");
    setLoading(true);
    try {
      await api.auth.resetPassword(email, otpValue, newPassword);
      setSuccess("Password reset successful! You can now sign in.");
      resetForm();
      setView("login");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Reset failed");
    } finally {
      setLoading(false);
    }
  };

  const handleResendOtp = async () => {
    if (countdown > 0) return;
    setError("");
    setLoading(true);
    try {
      if (view === "signup-otp") {
        await api.auth.sendOtp(email);
      } else {
        await api.auth.forgotPassword(email);
      }
      setCountdown(300);
      setOtp(["", "", "", "", "", ""]);
      setSuccess("New code sent!");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to resend code");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    window.location.href = `${API_BASE_URL}/oauth2/authorization/google`;
  };

  const handleGithubLogin = () => {
    window.location.href = `${API_BASE_URL}/oauth2/authorization/github`;
  };

  const formatCountdown = (s: number) => {
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, "0")}`;
  };

  const renderOtpInputs = () => (
    <div className="flex gap-2 justify-center" onPaste={handleOtpPaste}>
      {otp.map((digit, i) => (
        <input
          key={i}
          ref={(el) => {
            otpRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={digit}
          onChange={(e) => handleOtpChange(i, e.target.value)}
          onKeyDown={(e) => handleOtpKeyDown(i, e)}
          className="w-11 h-12 text-center text-lg font-bold rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
        />
      ))}
    </div>
  );

  const features = [
    {
      icon: FileCheck,
      title: "ATS Optimized",
      desc: "Resumes that pass automated screening",
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-50 dark:bg-blue-900/30",
    },
    {
      icon: Shield,
      title: "Privacy First",
      desc: "Your data stays safe and encrypted",
      color: "text-green-600 dark:text-green-400",
      bg: "bg-green-50 dark:bg-green-900/30",
    },
    {
      icon: Zap,
      title: "AI Powered",
      desc: "Smart automation saves you hours",
      color: "text-primary-600 dark:text-primary-400",
      bg: "bg-primary-50 dark:bg-primary-900/30",
    },
  ];

  return (
    <div className="min-h-screen bg-white dark:bg-black text-gray-900 dark:text-gray-100 font-sans selection:bg-primary-100 dark:selection:bg-primary-900 selection:text-primary-900 dark:selection:text-primary-100 overflow-x-hidden">
      <nav className="fixed w-full z-50 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md shadow-sm py-3">
        <div className="container mx-auto px-6 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/30">
              <Briefcase className="text-white" size={20} />
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              ATS Tracker
            </span>
          </Link>

          <div className="flex items-center gap-4">
            <button
              onClick={toggleTheme}
              className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-zinc-800 transition-colors"
              title={
                theme === "dark"
                  ? "Switch to light mode"
                  : "Switch to dark mode"
              }
            >
              {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            <Link
              href="/"
              className="text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors hidden sm:block"
            >
              Home
            </Link>
          </div>
        </div>
      </nav>

      <div className="relative pt-24 pb-16 min-h-screen flex items-center">
        <div className="absolute top-[-10%] right-[-5%] w-125 h-125 bg-primary-200/30 dark:bg-primary-900/20 rounded-full blur-3xl opacity-50 animate-pulse pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] w-150 h-150 bg-blue-100/40 dark:bg-blue-900/20 rounded-full blur-3xl opacity-50 pointer-events-none" />

        <div className="container mx-auto px-6 relative z-10">
          <div className="flex flex-col lg:flex-row items-center gap-16 max-w-6xl mx-auto">
            {(view === "login" || view === "signup") && (
              <motion.div
                initial="hidden"
                animate="visible"
                variants={staggerContainer}
                className="lg:w-1/2 text-center lg:text-left"
              >
                <motion.div
                  variants={fadeInUp}
                  className="mb-6 inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary-50 dark:bg-primary-900/20 border border-primary-100 dark:border-primary-800 text-primary-700 dark:text-primary-400 text-xs font-semibold uppercase tracking-wider"
                >
                  <span className="w-2 h-2 rounded-full bg-primary-500 animate-pulse" />
                  Free to get started
                </motion.div>

                <motion.h1
                  variants={fadeInUp}
                  className="text-4xl lg:text-5xl font-extrabold tracking-tight text-gray-900 dark:text-white mb-6 leading-[1.1]"
                >
                  {view === "login" ? "Welcome back" : "Get started"}{" "}
                  <span className="text-transparent bg-clip-text bg-linear-to-r from-primary-600 to-blue-600">
                    {view === "login" ? "to ATS Tracker" : "for free"}
                  </span>
                </motion.h1>

                <motion.p
                  variants={fadeInUp}
                  className="text-lg text-gray-600 dark:text-gray-400 mb-10 max-w-md mx-auto lg:mx-0 leading-relaxed"
                >
                  {view === "login"
                    ? "Sign in to manage your applications, track your progress, and optimize your resume."
                    : "Create your account and start tracking applications with intelligent ATS optimization."}
                </motion.p>

                <motion.div variants={fadeInUp} className="space-y-4">
                  {features.map((feature, i) => (
                    <div key={i} className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 ${feature.bg} rounded-xl flex items-center justify-center shrink-0`}
                      >
                        <feature.icon className={`w-5 h-5 ${feature.color}`} />
                      </div>
                      <div className="text-left">
                        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
                          {feature.title}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {feature.desc}
                        </p>
                      </div>
                    </div>
                  ))}
                </motion.div>
              </motion.div>
            )}

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className={`w-full ${view === "login" || view === "signup" ? "lg:w-1/2 max-w-md" : "max-w-md mx-auto"}`}
            >
              <div className="bg-white/80 dark:bg-zinc-900/80 backdrop-blur-md rounded-2xl shadow-xl border border-gray-200 dark:border-gray-800 overflow-hidden ring-1 ring-gray-900/5 dark:ring-white/5">
                {(view === "login" || view === "signup") && (
                  <div className="flex border-b border-gray-200 dark:border-gray-800">
                    <button
                      onClick={() => {
                        setView("login");
                        setError("");
                        setSuccess("");
                        router.push("/login");
                      }}
                      className={`flex-1 py-3.5 text-[13px] font-semibold transition-colors ${
                        view === "login"
                          ? "text-primary-600 border-b-2 border-primary-500 bg-primary-50/50 dark:bg-primary-900/10"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      Sign In
                    </button>
                    <button
                      onClick={() => {
                        setView("signup");
                        setError("");
                        setSuccess("");
                        router.push("/register");
                      }}
                      className={`flex-1 py-3.5 text-[13px] font-semibold transition-colors ${
                        view === "signup"
                          ? "text-primary-600 border-b-2 border-primary-500 bg-primary-50/50 dark:bg-primary-900/10"
                          : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                      }`}
                    >
                      Sign Up
                    </button>
                  </div>
                )}

                {(view === "signup-otp" ||
                  view === "forgot" ||
                  view === "forgot-otp") && (
                  <div className="border-b border-gray-200 dark:border-gray-800 px-4 py-3 flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (view === "signup-otp") setView("signup");
                        else if (view === "forgot-otp") setView("forgot");
                        else setView("login");
                        setError("");
                        setSuccess("");
                      }}
                      className="text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                      <ArrowLeft size={18} />
                    </button>
                    <span className="text-[13px] font-semibold text-gray-900 dark:text-white">
                      {view === "signup-otp" && "Verify Email"}
                      {view === "forgot" && "Forgot Password"}
                      {view === "forgot-otp" && "Reset Password"}
                    </span>
                  </div>
                )}

                <div className="p-6">
                  {error && (
                    <div className="mb-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 text-[12px] font-medium">
                      {error}
                    </div>
                  )}
                  {success && (
                    <div className="mb-4 p-3 rounded-xl bg-green-50 dark:bg-green-900/10 border border-green-200 dark:border-green-800 text-green-600 dark:text-green-400 text-[12px] font-medium">
                      {success}
                    </div>
                  )}

                  {view === "login" && (
                    <>
                      <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Email
                          </label>
                          <div className="relative">
                            <Mail
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="you@example.com"
                              required
                              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                              Password
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                setView("forgot");
                                setError("");
                              }}
                              className="text-[11px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
                            >
                              Forgot password?
                            </button>
                          </div>
                          <div className="relative">
                            <Lock
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              required
                              minLength={6}
                              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              {showPassword ? (
                                <EyeOff size={16} />
                              ) : (
                                <Eye size={16} />
                              )}
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 rounded-full bg-primary-600 text-white text-[13px] font-semibold shadow-lg shadow-primary-500/25 hover:bg-primary-700 hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        >
                          {loading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Signing in...
                            </span>
                          ) : (
                            "Sign In"
                          )}
                        </button>
                      </form>

                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-[11px]">
                          <span className="px-3 bg-white dark:bg-zinc-900 text-gray-500 font-medium">
                            or continue with
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={handleGoogleLogin}
                          className="w-full flex items-center justify-center gap-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-[13px] font-medium text-gray-600 dark:text-gray-300 transition-all duration-200 hover:shadow-sm"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                          Continue with Google
                        </button>

                        <button
                          onClick={handleGithubLogin}
                          className="w-full flex items-center justify-center gap-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-[13px] font-medium text-gray-600 dark:text-gray-300 transition-all duration-200 hover:shadow-sm"
                        >
                          <Github size={16} />
                          Continue with GitHub
                        </button>
                      </div>
                    </>
                  )}

                  {view === "signup" && (
                    <>
                      <form
                        onSubmit={handleSendSignupOtp}
                        className="space-y-4"
                      >
                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Full Name
                          </label>
                          <div className="relative">
                            <User
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                              type="text"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              placeholder="John Doe"
                              required
                              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Email
                          </label>
                          <div className="relative">
                            <Mail
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="you@example.com"
                              required
                              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                            Password
                          </label>
                          <div className="relative">
                            <Lock
                              size={16}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                            />
                            <input
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(e) => setPassword(e.target.value)}
                              placeholder="••••••••"
                              required
                              minLength={6}
                              className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                            />
                            <button
                              type="button"
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                            >
                              {showPassword ? (
                                <EyeOff size={16} />
                              ) : (
                                <Eye size={16} />
                              )}
                            </button>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-2.5 rounded-full bg-primary-600 text-white text-[13px] font-semibold shadow-lg shadow-primary-500/25 hover:bg-primary-700 hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                        >
                          {loading ? (
                            <span className="flex items-center justify-center gap-2">
                              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                              Sending code...
                            </span>
                          ) : (
                            "Send Verification Code"
                          )}
                        </button>
                      </form>

                      <div className="relative my-6">
                        <div className="absolute inset-0 flex items-center">
                          <div className="w-full border-t border-gray-200 dark:border-gray-700" />
                        </div>
                        <div className="relative flex justify-center text-[11px]">
                          <span className="px-3 bg-white dark:bg-zinc-900 text-gray-500 font-medium">
                            or continue with
                          </span>
                        </div>
                      </div>

                      <div className="space-y-3">
                        <button
                          onClick={handleGoogleLogin}
                          className="w-full flex items-center justify-center gap-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-[13px] font-medium text-gray-600 dark:text-gray-300 transition-all duration-200 hover:shadow-sm"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24">
                            <path
                              fill="#4285F4"
                              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                            />
                            <path
                              fill="#34A853"
                              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                            />
                            <path
                              fill="#FBBC05"
                              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                            />
                            <path
                              fill="#EA4335"
                              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                            />
                          </svg>
                          Continue with Google
                        </button>

                        <button
                          onClick={handleGithubLogin}
                          className="w-full flex items-center justify-center gap-3 py-2.5 rounded-full border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 hover:bg-gray-50 dark:hover:bg-zinc-800 text-[13px] font-medium text-gray-600 dark:text-gray-300 transition-all duration-200 hover:shadow-sm"
                        >
                          <Github size={16} />
                          Continue with GitHub
                        </button>
                      </div>
                    </>
                  )}

                  {view === "signup-otp" && (
                    <form
                      onSubmit={handleVerifyAndRegister}
                      className="space-y-5"
                    >
                      <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/30 mb-3">
                          <ShieldCheck
                            size={24}
                            className="text-primary-600 dark:text-primary-400"
                          />
                        </div>
                        <p className="text-[13px] text-gray-500 dark:text-gray-400">
                          We sent a 6-digit code to
                        </p>
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                          {email}
                        </p>
                      </div>

                      {renderOtpInputs()}

                      <div className="text-center">
                        {countdown > 0 ? (
                          <p className="text-[12px] text-gray-400">
                            Code expires in{" "}
                            <span className="font-semibold text-primary-600">
                              {formatCountdown(countdown)}
                            </span>
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={loading}
                            className="text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
                          >
                            Resend code
                          </button>
                        )}
                      </div>

                      <button
                        type="submit"
                        disabled={loading || otpValue.length !== 6}
                        className="w-full py-2.5 rounded-full bg-primary-600 text-white text-[13px] font-semibold shadow-lg shadow-primary-500/25 hover:bg-primary-700 hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Verifying...
                          </span>
                        ) : (
                          "Verify & Create Account"
                        )}
                      </button>
                    </form>
                  )}

                  {view === "forgot" && (
                    <form onSubmit={handleForgotSendOtp} className="space-y-4">
                      <p className="text-[13px] text-gray-500 dark:text-gray-400 mb-2">
                        Enter your email address and we&apos;ll send you a
                        verification code to reset your password.
                      </p>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          Email
                        </label>
                        <div className="relative">
                          <Mail
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          />
                          <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            required
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-2.5 rounded-full bg-primary-600 text-white text-[13px] font-semibold shadow-lg shadow-primary-500/25 hover:bg-primary-700 hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Sending code...
                          </span>
                        ) : (
                          "Send Reset Code"
                        )}
                      </button>
                    </form>
                  )}

                  {view === "forgot-otp" && (
                    <form onSubmit={handleResetPassword} className="space-y-5">
                      <div className="text-center">
                        <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-primary-50 dark:bg-primary-900/30 mb-3">
                          <ShieldCheck
                            size={24}
                            className="text-primary-600 dark:text-primary-400"
                          />
                        </div>
                        <p className="text-[13px] text-gray-500 dark:text-gray-400">
                          Enter the code sent to
                        </p>
                        <p className="text-[13px] font-semibold text-gray-900 dark:text-white">
                          {email}
                        </p>
                      </div>

                      {renderOtpInputs()}

                      <div className="text-center">
                        {countdown > 0 ? (
                          <p className="text-[12px] text-gray-400">
                            Code expires in{" "}
                            <span className="font-semibold text-primary-600">
                              {formatCountdown(countdown)}
                            </span>
                          </p>
                        ) : (
                          <button
                            type="button"
                            onClick={handleResendOtp}
                            disabled={loading}
                            className="text-[12px] font-medium text-primary-600 hover:text-primary-700 transition-colors"
                          >
                            Resend code
                          </button>
                        )}
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                          New Password
                        </label>
                        <div className="relative">
                          <Lock
                            size={16}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                          />
                          <input
                            type={showNewPassword ? "text" : "password"}
                            value={newPassword}
                            onChange={(e) => setNewPassword(e.target.value)}
                            placeholder="••••••••"
                            required
                            minLength={6}
                            className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-zinc-900 text-[13px] text-gray-900 dark:text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500/30 focus:border-primary-500 transition-all"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewPassword(!showNewPassword)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
                          >
                            {showNewPassword ? (
                              <EyeOff size={16} />
                            ) : (
                              <Eye size={16} />
                            )}
                          </button>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading || otpValue.length !== 6}
                        className="w-full py-2.5 rounded-full bg-primary-600 text-white text-[13px] font-semibold shadow-lg shadow-primary-500/25 hover:bg-primary-700 hover:shadow-primary-500/40 hover:-translate-y-0.5 transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
                      >
                        {loading ? (
                          <span className="flex items-center justify-center gap-2">
                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                            Resetting...
                          </span>
                        ) : (
                          "Reset Password"
                        )}
                      </button>
                    </form>
                  )}
                </div>
              </div>

              <p className="text-center text-[11px] text-gray-400 dark:text-gray-500 mt-4">
                &copy; {new Date().getFullYear()} ATS Tracker. All rights
                reserved.
              </p>
            </motion.div>
          </div>
        </div>
      </div>
    </div>
  );
}
