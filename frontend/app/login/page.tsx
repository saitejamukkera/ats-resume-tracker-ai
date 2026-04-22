import { Metadata } from "next";
import AuthPage from "../../src/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Sign In - TrackHire AI",
  description: "Sign in to your account.",
};

export default function LoginPage() {
  return <AuthPage initialView="login" />;
}
