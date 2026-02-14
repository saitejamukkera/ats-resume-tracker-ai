import { useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { tokenStorage } from "../lib/api";

export default function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { refreshUser } = useAuth();

  useEffect(() => {
    const token = searchParams.get("token");
    
    if (token) {
      tokenStorage.set(token);
      refreshUser()
        .then(() => {
          navigate("/", { replace: true });
        })
        .catch((error) => {
          console.error("Failed to refresh user:", error);
          navigate("/login", { replace: true });
        });
    } else {
      console.error("No token in OAuth callback URL");
      navigate("/login", { replace: true });
    }
  }, [navigate, refreshUser, searchParams]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[13px] text-text-muted">Completing sign in...</p>
      </div>
    </div>
  );
}
