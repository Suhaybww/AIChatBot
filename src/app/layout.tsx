// src/app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "RMIT AI Support - Your Academic Companion",
  description: "Intelligent academic support for RMIT students. Get instant help with courses, policies, and university resources through our AI-powered assistant.",
  keywords: ["RMIT", "student support", "AI", "chatbot", "university", "academic assistance"],
  authors: [{ name: "RMIT AI Support Team" }],
  creator: "RMIT AI Support",
  openGraph: {
    title: "RMIT AI Support - Your Academic Companion",
    description: "Get instant help with RMIT courses, policies, and resources",
    type: "website",
    locale: "en_AU",
  },
  twitter: {
    card: "summary_large_image",
    title: "RMIT AI Support",
    description: "AI-powered academic support for RMIT students",
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