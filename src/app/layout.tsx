import "./globals.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Providers } from "./providers";
import { TRPCProvider } from "@/components/providers/TRPCProvider";
import { Toaster } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

import "font-awesome/css/font-awesome.min.css";
import "./globals.css";

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
        <TRPCProvider>
          <body className={cn('h-full font-sans antialiased grainy', inter.className)}>
            {children}
            <Toaster 
              position="top-right"
              toastOptions={{
                style: {
                  background: 'rgb(31 41 55)', // gray-800
                  color: 'rgb(243 244 246)',   // gray-100  
                  border: '1px solid rgb(75 85 99)', // gray-600
                },
              }}
            />
          </body>
        </TRPCProvider>
      </Providers>
    </html>
  );
}