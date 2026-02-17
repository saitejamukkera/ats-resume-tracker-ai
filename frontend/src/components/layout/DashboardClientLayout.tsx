"use client";

import {
  useState,
  useTransition,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Briefcase,
  LayoutDashboard,
  FilePlus,
  Settings,
  Menu,
  X,
  Sun,
  Moon,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { useTheme } from "../../hooks/useTheme";
import { useAuth } from "../../context/AuthContext";
import { ConfirmModal } from "../ConfirmModal";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { path: "/new", label: "New Application", icon: FilePlus },
  { path: "/settings", label: "Settings", icon: Settings },
];

export default function DashboardClientLayout({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, logout, loading } = useAuth();

  // Prefetch all nav routes on mount
  useEffect(() => {
    for (const item of NAV_ITEMS) {
      router.prefetch(item.path);
    }
  }, [router]);

  const navigateTo = useCallback(
    (path: string) => {
      if (pathname === path) return;
      setPendingPath(path);
      setSidebarOpen(false);
      startTransition(() => {
        router.push(path);
      });
    },
    [pathname, router],
  );

  // Clear pending path once navigation completes
  const activePath = isPending && pendingPath ? pendingPath : pathname;

  // Basic protection
  if (!loading && !user) {
    router.replace("/login");
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white dark:bg-black flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 rounded-full border-2 border-primary-200 dark:border-primary-800 border-t-primary-600 animate-spin" />
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium animate-pulse">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
    router.replace("/");
  };

  return (
    <div className="min-h-screen bg-gray-50/50 dark:bg-black flex text-gray-900 dark:text-gray-100 transition-colors duration-300">
      {/* Mobile overlay */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/30 backdrop-blur-sm z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-xl border-r border-gray-200/80 dark:border-gray-800/80 flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-gray-100 dark:border-gray-800/60 shrink-0">
          <Link
            href="/dashboard"
            className="flex items-center gap-3 group"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-lg shadow-primary-500/25 group-hover:shadow-primary-500/40 transition-all duration-300 group-hover:scale-105">
              <Briefcase size={17} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-sm font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
                TrackHire AI
              </span>
              <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                Job Application Manager
              </span>
            </div>
          </Link>
          {/* Mobile close */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-400 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          <p className="px-3 mb-3 text-[10px] font-bold text-gray-400 dark:text-gray-600 uppercase tracking-[0.15em]">
            Menu
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activePath === item.path;
            return (
              <button
                key={item.path}
                onClick={() => navigateTo(item.path)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group relative ${
                  isActive
                    ? "bg-primary-50 dark:bg-primary-900/15 text-primary-700 dark:text-primary-400 shadow-sm shadow-primary-500/5"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-zinc-900 hover:text-gray-900 dark:hover:text-gray-200"
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <motion.span
                    layoutId="activeNavIndicator"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon
                  size={17}
                  className={`transition-colors ${isActive ? "text-primary-600 dark:text-primary-400" : "text-gray-400 dark:text-gray-500 group-hover:text-gray-600 dark:group-hover:text-gray-300"}`}
                />
                <span className="flex-1 text-left">{item.label}</span>
                {isActive && (
                  <ChevronRight
                    size={14}
                    className="text-primary-400 dark:text-primary-500 opacity-60"
                  />
                )}
              </button>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-3 py-4 border-t border-gray-100 dark:border-gray-800/60 shrink-0">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-linear-to-br from-primary-100 to-primary-200/50 dark:from-primary-900/30 dark:to-primary-800/20 flex items-center justify-center text-primary-700 dark:text-primary-400 font-bold text-[11px] shrink-0 ring-2 ring-primary-500/10 dark:ring-primary-500/5">
                {user?.fullName?.charAt(0)?.toUpperCase() ||
                  user?.email?.charAt(0)?.toUpperCase() ||
                  "?"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-gray-700 dark:text-gray-200 leading-tight truncate">
                  {user?.fullName || "User"}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium truncate">
                  {user?.email}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:text-primary-400 dark:hover:bg-zinc-800 transition-all duration-200"
                title={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
              >
                {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
              </button>
              <button
                onClick={handleLogout}
                className="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/10 transition-all duration-200"
                title="Logout"
              >
                <LogOut size={15} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen min-w-0">
        {/* Mobile top bar */}
        <header className="h-14 px-4 flex items-center border-b border-gray-200/60 dark:border-gray-800/60 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl lg:hidden shrink-0 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-zinc-800 text-gray-500 dark:text-gray-400 transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-500/20">
              <Briefcase size={13} className="text-white" />
            </div>
            <span className="text-sm font-bold tracking-tight bg-clip-text text-transparent bg-linear-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-400">
              TrackHire AI
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main
          className={`flex-1 p-5 lg:p-8 overflow-y-auto w-full max-w-7xl mx-auto transition-opacity duration-200 ${isPending ? "opacity-50 pointer-events-none" : "opacity-100"}`}
        >
          {children}
        </main>
      </div>

      {/* Logout Confirmation Modal */}
      <ConfirmModal
        open={showLogoutConfirm}
        title="Sign Out"
        message="Are you sure you want to sign out? You'll need to log in again to access your applications."
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
