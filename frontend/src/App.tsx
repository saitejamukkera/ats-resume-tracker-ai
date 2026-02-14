import {
  BrowserRouter,
  Routes,
  Route,
  Link,
  useLocation,
} from "react-router-dom";
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
} from "lucide-react";
import { useState } from "react";
import { useTheme } from "./hooks/useTheme";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { ToastProvider } from "./context/ToastContext";
import { ConfirmModal } from "./components/ConfirmModal";
import Dashboard from "./pages/Dashboard";
import NewApplication from "./pages/NewApplication";
import ApplicationDetail from "./pages/ApplicationDetail";
import SettingsPage from "./pages/SettingsPage";
import LoginPage from "./pages/LoginPage";
import OAuthCallback from "./pages/OAuthCallback";
import "./App.css";

const NAV_ITEMS = [
  { path: "/", label: "Dashboard", icon: LayoutDashboard },
  { path: "/new", label: "New Application", icon: FilePlus },
  { path: "/settings", label: "Settings", icon: Settings },
];

function AppLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();
  const { user, logout } = useAuth();

  const handleLogout = () => {
    setShowLogoutConfirm(true);
  };

  const confirmLogout = async () => {
    setShowLogoutConfirm(false);
    await logout();
  };

  return (
    <div className="min-h-screen bg-background flex">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-sidebar border-r border-border flex flex-col transition-transform duration-300 ease-in-out lg:translate-x-0 lg:sticky lg:top-0 lg:h-screen lg:z-auto ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="h-16 px-5 flex items-center justify-between border-b border-border/60 shrink-0">
          <Link
            to="/"
            className="flex items-center gap-3 group"
            onClick={() => setSidebarOpen(false)}
          >
            <div className="w-9 h-9 rounded-xl bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center shadow-md shadow-primary-300/30 group-hover:shadow-lg group-hover:shadow-primary-400/40 transition-all duration-300 group-hover:scale-105">
              <Briefcase size={17} className="text-white" />
            </div>
            <div className="flex flex-col">
              <span className="text-[13px] font-bold text-text-primary leading-tight tracking-tight">
                ATS Tracker
              </span>
              <span className="text-[10px] text-text-muted font-medium">
                Job Application Manager
              </span>
            </div>
          </Link>
          {/* Mobile close */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-1.5 rounded-lg hover:bg-gray-100 text-text-muted transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          <p className="px-3 mb-3 text-[10px] font-bold text-text-muted/70 uppercase tracking-[0.12em]">
            Menu
          </p>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-[13px] font-medium transition-all duration-200 group relative ${
                  isActive
                    ? "bg-primary-50 text-primary-700"
                    : "text-text-secondary hover:bg-gray-50/80 hover:text-text-primary"
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary-500 rounded-r-full" />
                )}
                <Icon
                  size={17}
                  className={`transition-colors ${isActive ? "text-primary-600" : "text-text-muted group-hover:text-text-secondary"}`}
                />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Sidebar Footer */}
        <div className="px-4 py-4 border-t border-border/60 shrink-0">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-linear-to-br from-primary-50 to-primary-100/50 flex items-center justify-center text-primary-600 font-semibold text-[11px] shrink-0">
                {user?.fullName?.charAt(0)?.toUpperCase() ||
                  user?.email?.charAt(0)?.toUpperCase() ||
                  "?"}
              </div>
              <div className="flex flex-col min-w-0">
                <span className="text-[11px] font-semibold text-text-secondary leading-tight truncate">
                  {user?.fullName || "User"}
                </span>
                <span className="text-[10px] text-text-muted font-medium truncate">
                  {user?.email}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={toggleTheme}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-primary-700 hover:bg-primary-50 transition-all duration-200"
                title={
                  theme === "dark"
                    ? "Switch to light mode"
                    : "Switch to dark mode"
                }
              >
                {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              </button>
              <button
                onClick={handleLogout}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-red-600 hover:bg-red-50 transition-all duration-200"
                title="Logout"
              >
                <LogOut size={16} />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Mobile top bar */}
        <header className="h-14 px-4 flex items-center border-b border-border/60 bg-white/80 backdrop-blur-sm lg:hidden shrink-0">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 rounded-lg hover:bg-gray-100 text-text-secondary transition-colors"
          >
            <Menu size={20} />
          </button>
          <div className="ml-3 flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-linear-to-br from-primary-500 to-primary-700 flex items-center justify-center">
              <Briefcase size={12} className="text-white" />
            </div>
            <span className="text-sm font-bold text-text-primary tracking-tight">
              ATS Tracker
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-5 lg:p-6 overflow-y-auto">
          <div className="mx-auto">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/new" element={<NewApplication />} />
              <Route path="/applications/:id" element={<ApplicationDetail />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Routes>
          </div>
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

function AppRoutes() {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (location.pathname === "/oauth2/callback") {
    return (
      <Routes>
        <Route path="/oauth2/callback" element={<OAuthCallback />} />
      </Routes>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  return <AppLayout />;
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
