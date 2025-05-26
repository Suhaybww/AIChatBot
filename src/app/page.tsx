// src/app/page.tsx
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import { LoginLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { Button } from "@/components/ui/button";
import { GraduationCap, ArrowRight } from "lucide-react";

export default async function HomePage() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  // If user is authenticated, redirect to chat
  if (user) {
    redirect("/chat");
  }

  // If not authenticated, show sign in page
  return (
    <div className="min-h-screen flex items-center justify-center">
      {/* Background Decorations */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80"
      >
        <div
          style={{
            clipPath:
              "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
          }}
          className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] bg-gradient-to-tr from-[#E61E2A] to-[#FF6B35] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]"
        />
      </div>

      <div className="max-w-md w-full mx-auto px-6">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl">
            <GraduationCap className="w-8 h-8 text-white" />
          </div>
          
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to <span className="text-red-600">RMIT AI Support</span>
          </h1>
          
          <p className="text-lg text-gray-700 mb-8 leading-relaxed">
            Your intelligent academic companion. Get instant help with courses, policies, and university resources.
          </p>
          
          <div className="p-4 backdrop-blur-sm rounded-xl border border-red-200/30 bg-red-50/20 mb-8">
            <p className="text-red-800 font-semibold text-sm">🚀 Beta Version</p>
            <p className="text-red-700 text-sm">Help us shape the future of student support</p>
          </div>
        </div>

        <LoginLink>
          <Button size="lg" className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white py-6 text-lg shadow-xl hover:shadow-red-500/25 transition-all duration-300 transform hover:-translate-y-1">
            Sign In to Get Started
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
        </LoginLink>

        <p className="text-center text-sm text-gray-600 mt-6">
          Sign in with your RMIT credentials to access personalized academic support
        </p>
      </div>
    </div>
  );
}