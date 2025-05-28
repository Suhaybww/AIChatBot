// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Vega - Your RMIT AI Companion",
  description: "Meet Vega, your intelligent RMIT guide. Named after the brightest navigation star, Vega helps you navigate courses, policies, and university life with AI-powered assistance.",
  keywords: ["Vega", "RMIT", "AI assistant", "student support", "university", "academic guidance", "navigation"],
  authors: [{ name: "RMIT Vega Team" }],
  creator: "RMIT Vega",
  openGraph: {
    title: "Vega - Your RMIT AI Companion",
    description: "AI-powered guidance for RMIT students. Navigate your university journey with Vega.",
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "Vega - RMIT AI Assistant",
    description: "Your intelligent guide to RMIT university life",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="h-full">
      <Providers>
        <body className={cn('h-full font-sans antialiased grainy', inter.className)}>
          {children}
        </body>
      </Providers>
    </html>
  );
}