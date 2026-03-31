"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "../../../src/context/AuthContext";
import { tokenStorage } from "../../../src/lib/api";

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
      tokenStorage.set(token);
      refreshUser().then((success) => {
        router.replace(success ? "/dashboard" : "/login");
      });
    } else {
      router.replace("/login");
    }
  }, [router, refreshUser, searchParams]);

  return (
    <div className="text-center">
      <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-4" />
      <p className="text-[13px] text-gray-500">Completing sign in...</p>
    </div>
  );
}

export default function OAuthCallbackPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Suspense
        fallback={
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-primary-500/30 border-t-primary-500 rounded-full animate-spin mx-auto mb-4" />
            <p className="text-[13px] text-gray-500">Loading...</p>
          </div>
        }
      >
        <OAuthCallbackContent />
      </Suspense>
    </div>
  );
}
