// src/app/loading.tsx
import { Star } from "lucide-react";

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f0f0f' }}>
      <div className="text-center space-y-4">
        {/* Animated Vega Star */}
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Star className="w-6 h-6 text-red-500 fill-current animate-pulse" />
          <h3 className="text-lg font-semibold text-gray-200">Vega</h3>
        </div>
        
        {/* Loading Spinner */}
        <div className="w-8 h-8 animate-spin text-red-500 mx-auto border-2 border-red-500 border-t-transparent rounded-full"></div>
        <p className="text-gray-400">Loading...</p>
      </div>
    </div>
  );
}