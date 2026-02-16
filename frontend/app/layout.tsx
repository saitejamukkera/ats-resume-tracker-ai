import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";
import { Providers } from "../src/components/Providers";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ATS Job Tracker - Smart Resume & Application Management",
  description:
    "Track your job applications, optimize your resume for ATS, and land your dream job faster with our privacy-focused, secure job tracking tool.",
  keywords:
    "ATS, Resume Tracker, Job Application, Career Management, Privacy, Security",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Inline script to apply dark class before paint, preventing flash
  const themeScript = `(function(){try{var t=localStorage.getItem('ats-theme');if(t==='dark'||(t!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`${inter.variable} ${jetbrainsMono.variable} antialiased font-sans bg-background text-text-primary`}
      >
        <Providers>{children}</Providers>
        <SpeedInsights />
      </body>
    </html>
  );
}
