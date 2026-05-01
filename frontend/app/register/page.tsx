import { Metadata } from "next";
import AuthPage from "../../src/components/auth/AuthPage";

export const metadata: Metadata = {
  title: "Sign Up - TrackHire AI",
  description: "Create a new account.",
};

export default function RegisterPage() {
  return <AuthPage initialView="signup" />;
}
