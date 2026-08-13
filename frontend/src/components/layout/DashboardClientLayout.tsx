"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  FilePlus,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  Settings,
  Sun,
  X,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../context/AuthContext";
import { ConfirmModal } from "../ConfirmModal";
import { Logo } from "../Logo";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/new", label: "New Application", icon: FilePlus },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function DashboardClientLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, logout, loading } = useAuth();

  useEffect(() => {
    NAV_ITEMS.forEach((item) => router.prefetch(item.path));
  }, [router]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!sidebarOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", closeOnEscape);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [sidebarOpen]);

  if (loading || !user) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-background" aria-live="polite">
        <div className="flex flex-col items-center gap-4">
          <div className="loading-spinner" aria-hidden="true" />
          <p className="text-sm font-medium text-text-secondary">Loading Workspace…</p>
        </div>
      </main>
    );
  }

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    router.replace("/");
  };

  const initials = (user.fullName || user.email || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");

  return (
    <div className="workspace-shell flex min-h-screen bg-background text-text-primary">
      <a href="#workspace-main" className="skip-link">Skip to Content</a>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            aria-hidden="true"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-[#181512]/55 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      <aside
        className="workspace-sidebar sticky top-0 hidden h-screen flex-col border-r border-border bg-background lg:flex"
        aria-label="Workspace navigation"
      >
        <div className="workspace-brand flex shrink-0 items-start justify-between border-b border-border">
          <Link href="/dashboard"><Logo size="lg" showSubtitle /></Link>
          <button type="button" className="icon-button lg:hidden" aria-label="Close navigation" onClick={() => setSidebarOpen(false)}>
            <X size={19} aria-hidden="true" />
          </button>
        </div>

        <nav className="workspace-nav flex-1">
          <p className="sr-only">Workspace</p>
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path || (item.path === "/dashboard" && pathname.startsWith("/applications/"));
              return (
                <li key={item.path}>
                  <Link
                    href={item.path}
                    onClick={() => setSidebarOpen(false)}
                    aria-current={active ? "page" : undefined}
                    className={`workspace-nav-link flex items-center gap-3 font-medium transition-colors ${active ? "active bg-primary-50 text-primary-700" : "text-text-primary hover:bg-surface-muted"}`}
                  >
                    <Icon size={17} strokeWidth={1.75} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="workspace-account border-t border-border">
          <div className="flex min-w-0 items-center gap-3 py-2">
            <div className="workspace-avatar flex shrink-0 items-center justify-center rounded-full border border-border-strong bg-surface font-medium">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{user.fullName || "User"}</p>
              <p className="truncate text-xs text-text-muted">{user.email}</p>
            </div>
            <ChevronDown size={16} aria-hidden="true" />
          </div>
          <div className="workspace-account-actions mt-4 flex flex-col gap-1 border-t border-border pt-3">
            <button
              type="button"
              className="button-quiet justify-between px-2 text-sm font-medium"
              onClick={toggleTheme}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              <span>Theme</span><span className="ml-auto">{theme === "dark" ? "Dark" : "Light"}</span><ChevronDown size={14} aria-hidden="true" />
            </button>
            <button type="button" className="button-quiet justify-start px-2 text-sm font-medium" onClick={() => setShowLogoutConfirm(true)}>
              <LogOut size={18} aria-hidden="true" /> Sign Out
            </button>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="workspace-mobile-header sticky top-0 z-30 flex items-center border-b border-border bg-background lg:hidden">
          <button type="button" className="icon-button" aria-label="Open navigation menu" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen(true)}>
            <Menu size={20} aria-hidden="true" />
          </button>
          <Link href="/dashboard" className="workspace-mobile-logo"><Logo size="lg" /></Link>
          <Link href="/new" className="workspace-mobile-add button-primary" aria-label="New application"><Plus size={37} aria-hidden="true" /></Link>
        </header>
        <main id="workspace-main" className="workspace-main w-full flex-1">
          {children}
        </main>
      </div>

      <AnimatePresence>
        {sidebarOpen && (
          <motion.nav
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="workspace-mobile-sheet lg:hidden"
            aria-label="Mobile workspace navigation"
          >
            <span className="workspace-mobile-sheet-handle" aria-hidden="true" />
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.path;
              return <Link key={item.path} href={item.path} onClick={() => setSidebarOpen(false)} aria-current={active ? "page" : undefined}><Icon size={27} aria-hidden="true" /><span>{item.label}</span><ChevronRight size={20} aria-hidden="true" /></Link>;
            })}
            <button type="button" onClick={() => { setSidebarOpen(false); setShowLogoutConfirm(true); }}><LogOut size={27} aria-hidden="true" /><span>Sign Out</span><ChevronRight size={20} aria-hidden="true" /></button>
          </motion.nav>
        )}
      </AnimatePresence>

      <ConfirmModal
        open={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out? You’ll need to sign in again to access your applications."
        confirmLabel="Sign Out"
        cancelLabel="Stay"
        variant="danger"
        icon="logout"
        onConfirm={confirmLogout}
        onCancel={() => setShowLogoutConfirm(false)}
      />
    </div>
  );
}
