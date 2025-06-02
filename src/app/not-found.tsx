"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Home, ArrowLeft, Star } from "lucide-react";

function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center space-y-6 max-w-md">
        <div className="space-y-4">
          <div className="flex items-center justify-center space-x-2 mb-6">
            <Star className="w-8 h-8 text-red-500 fill-current" />
            <h3 className="text-2xl font-bold text-gray-300">Vega</h3>
          </div>
          
          <h1 className="text-6xl font-bold text-red-500">404</h1>
          <h2 className="text-2xl font-semibold text-gray-200">
            Page Not Found
          </h2>
          <p className="text-gray-500 leading-relaxed">
            Sorry, we couldn&apos;t find the page you&apos;re looking for.
          </p>
        </div>
        
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/">
            <Button className="bg-gray-700 hover:bg-gray-600 text-white">
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </Link>
          <Button 
            variant="outline" 
            onClick={() => window.history.back()} 
            className="border-gray-600 bg-gray-800 text-gray-300 hover:bg-gray-700"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </Button>
        </div>
      </div>
    </div>
  );
}

export default NotFound;