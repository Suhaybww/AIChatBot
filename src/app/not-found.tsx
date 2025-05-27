// src/app/not-found.tsx
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Star } from "lucide-react";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f0f0f' }}>
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-4">
          {/* Vega Logo */}
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Star className="w-8 h-8 text-red-500 fill-current" />
            <h3 className="text-2xl font-bold text-gray-200">Vega</h3>
          </div>
          
          <h1 className="text-6xl font-bold text-red-500">404</h1>
          <h2 className="text-2xl font-semibold text-gray-200">
            Page Not Found
          </h2>
          <p className="text-gray-400 leading-relaxed">
            Sorry, we couldn't find the page you're looking for. It might have been moved or deleted.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button className="bg-red-600 hover:bg-red-700 text-white">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
          <Button variant="outline" onClick={() => window.history.back()} className="border-gray-700 text-gray-300 hover:bg-gray-900">
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}