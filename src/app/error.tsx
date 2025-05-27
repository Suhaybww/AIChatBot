// src/app/error.tsx
"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { RefreshCw, Home, Star } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f0f0f' }}>
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-4">
          {/* Vega Logo */}
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Star className="w-8 h-8 text-red-500 fill-current" />
            <h3 className="text-2xl font-bold text-gray-200">Vega</h3>
          </div>
          
          <h1 className="text-6xl font-bold text-red-500">Oops!</h1>
          <h2 className="text-2xl font-semibold text-gray-200">
            Something went wrong
          </h2>
          <p className="text-gray-400 leading-relaxed">
            We encountered an unexpected error. Don't worry, our team has been notified and we're working to fix it.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} className="bg-red-600 hover:bg-red-700 text-white">
            <RefreshCw className="w-4 h-4 mr-2" />
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline" className="border-gray-700 text-gray-300 hover:bg-gray-900">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}