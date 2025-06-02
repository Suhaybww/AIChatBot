import { Star } from "lucide-react";

function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900">
      <div className="text-center space-y-4">
        {/* Animated Vega Star */}
        <div className="flex items-center justify-center space-x-2 mb-4">
          <Star className="w-6 h-6 text-red-500 fill-current animate-pulse" />
          <h3 className="text-lg font-semibold text-gray-300">Vega</h3>
        </div>
        
        {/* Loading Spinner */}
        <div className="w-8 h-8 animate-spin text-gray-400 mx-auto border-2 border-gray-400 border-t-transparent rounded-full"></div>
        <p className="text-gray-500">Loading...</p>
      </div>
    </div>
  );
}

export default Loading;