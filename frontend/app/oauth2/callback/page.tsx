"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";

function OAuthCallbackContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { refreshUser } = useAuth();
  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;
    const token = searchParams.get("token");

    if (typeof window !== "undefined" && token) {
      window.history.replaceState({}, "", "/oauth2/callback");
    }

    if (token) {
      handledRef.current = true;
      refreshUser().then((success) => {
        router.replace(success ? "/dashboard" : "/login");
      });
    } else {
      router.replace("/login");
    }
  }, [router, refreshUser, searchParams]);

  return (
    <div className="route-loading" role="status" aria-live="polite">
      <div className="loading-spinner" aria-hidden="true" />
      <span>Completing sign in…</span>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Suspense
        fallback={
          <div className="route-loading" role="status" aria-live="polite">
            <div className="loading-spinner" aria-hidden="true" />
            <span>Loading…</span>
          </div>
        }
      >
        <OAuthCallbackContent />
      </Suspense>
    </div>
  );
}
