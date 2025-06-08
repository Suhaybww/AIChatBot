// src/app/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserProfile } from "@/components/settings/UserProfile";
import { AccountManagement } from "@/components/settings/AccountManagement";
import { MemoryManagement } from "@/components/settings/MemoryManagement";
import { 
  ArrowLeft, 
  User,
  Shield,
  Brain,
  Star,
  AlertCircle,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen
} from "lucide-react";
import Link from "next/link";
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { useRouter } from "next/navigation";

function SettingsContent() {
  const { user, isAuthenticated, isLoading } = useKindeBrowserClient();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Start collapsed on mobile

  // Handle mobile sidebar initial state
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarCollapsed(false); // Expand on desktop
      } else {
        setSidebarCollapsed(true); // Collapse on mobile
      }
    };
    
    handleResize(); // Set initial state
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="text-center space-y-4 max-w-sm mx-auto">
          <div className="w-12 h-12 sm:w-16 sm:h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto">
            <Star className="w-6 h-6 sm:w-8 sm:h-8 text-white fill-white" />
          </div>
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-red-400 mx-auto mb-4" />
          <p className="text-gray-500 text-sm sm:text-base">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 px-4">
        <div className="text-center space-y-4 max-w-md mx-auto">
          <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-400 mx-auto" />
          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-gray-100 mb-2">Authentication Required</h2>
            <p className="text-gray-400 mb-4 text-sm sm:text-base">Please sign in to access your settings.</p>
            <Link href="/">
              <Button className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto">
                Go Home
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-900 overflow-hidden">
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        user={{
          id: user.id,
          email: user.email,
          given_name: user.given_name,
          family_name: user.family_name,
          picture: user.picture,
        }}
      />

      {/* Mobile Menu Button - Only show when sidebar is collapsed */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="fixed top-4 left-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Mobile close button when sidebar is open */}
      {!sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="fixed top-4 right-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      )}
      
      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 flex flex-col min-h-screen ${
        sidebarCollapsed ? 'lg:ml-12' : 'lg:ml-64'
      } ml-0 ${!sidebarCollapsed ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-900 px-4 sm:px-6 lg:px-8 py-4 sm:py-6 flex-shrink-0">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <Link href="/chat">
              <Button variant="ghost" size="sm" className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center space-x-3 min-w-0 flex-1">
              <div className="w-6 h-6 sm:w-8 sm:h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-md sm:rounded-lg flex items-center justify-center flex-shrink-0">
                <Star className="w-3 h-3 sm:w-4 sm:h-4 text-white fill-white" />
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-100 truncate">Settings</h1>
                <p className="text-xs sm:text-sm text-gray-500 hidden sm:block">Manage your account and preferences</p>
              </div>
            </div>
            {/* Mobile back to chat button */}
            <Link href="/chat" className="lg:hidden">
              <Button 
                variant="outline" 
                size="sm" 
                className="border-gray-600 text-gray-400 hover:bg-gray-700 hover:border-gray-500 px-3 py-2 text-xs"
              >
                Back to Chat
              </Button>
            </Link>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
              
              <Tabs defaultValue="profile" className="space-y-6 sm:space-y-8">
                <TabsList className="grid w-full grid-cols-3 bg-gray-800/50 border border-gray-700/50 rounded-xl p-1 h-auto">
                  <TabsTrigger 
                    value="profile" 
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-gray-100 data-[state=active]:shadow-sm text-gray-400 rounded-lg transition-all duration-200 text-sm sm:text-base py-3 sm:py-3 px-4 font-medium tracking-normal"
                  >
                    <User className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span>Profile</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="memory" 
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-gray-100 data-[state=active]:shadow-sm text-gray-400 rounded-lg transition-all duration-200 text-sm sm:text-base py-3 sm:py-3 px-4 font-medium tracking-normal"
                  >
                    <Brain className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span>Memory</span>
                  </TabsTrigger>
                  <TabsTrigger 
                    value="account" 
                    className="data-[state=active]:bg-gray-700 data-[state=active]:text-gray-100 data-[state=active]:shadow-sm text-gray-400 rounded-lg transition-all duration-200 text-sm sm:text-base py-3 sm:py-3 px-4 font-medium tracking-normal"
                  >
                    <Shield className="w-4 h-4 mr-2 flex-shrink-0" />
                    <span>Account</span>
                  </TabsTrigger>
                </TabsList>

                {/* Profile Tab */}
                <TabsContent value="profile" className="focus:outline-none">
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <UserProfile user={{
                      id: user.id,
                      email: user.email,
                      given_name: user.given_name,
                      family_name: user.family_name,
                      picture: user.picture,
                    }} />
                  </ErrorBoundary>
                </TabsContent>

                {/* Memory Tab */}
                <TabsContent value="memory" className="focus:outline-none">
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <MemoryManagement userId={user.id} />
                  </ErrorBoundary>
                </TabsContent>

                {/* Account Tab */}
                <TabsContent value="account" className="focus:outline-none">
                  <ErrorBoundary fallback={<ErrorFallback />}>
                    <AccountManagement user={{
                      id: user.id,
                      email: user.email,
                      given_name: user.given_name,
                      family_name: user.family_name,
                      picture: user.picture,
                    }} />
                  </ErrorBoundary>
                </TabsContent>
              </Tabs>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Error Boundary Component
function ErrorBoundary({ children, fallback }: { children: React.ReactNode, fallback: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);

  useEffect(() => {
    setHasError(false);
  }, [children]);

  if (hasError) {
    return fallback;
  }

  return (
    <div onError={() => setHasError(true)}>
      {children}
    </div>
  );
}

// Error Fallback Component
function ErrorFallback() {
  return (
    <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl sm:rounded-2xl p-6 sm:p-8 text-center">
      <AlertCircle className="w-10 h-10 sm:w-12 sm:h-12 text-red-400 mx-auto mb-4" />
      <h3 className="text-base sm:text-lg font-semibold text-gray-100 mb-2">Something went wrong</h3>
      <p className="text-gray-400 mb-4 text-sm sm:text-base">We&apos;re having trouble loading this section. Please try refreshing the page.</p>
      <Button 
        onClick={() => window.location.reload()} 
        className="bg-red-600 hover:bg-red-700 text-white w-full sm:w-auto"
      >
        Refresh Page
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  return <SettingsContent />;
}