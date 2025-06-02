// src/app/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sidebar } from "@/components/layout/Sidebar";
import { UserProfile } from "@/components/settings/UserProfile";
import { AccountManagement } from "@/components/settings/AccountManagement";
import { 
  ArrowLeft, 
  User,
  Shield,
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
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-orange-500 rounded-2xl flex items-center justify-center mx-auto">
            <Star className="w-8 h-8 text-white fill-white" />
          </div>
          <Loader2 className="w-8 h-8 animate-spin text-red-400 mx-auto mb-4" />
          <p className="text-gray-500">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center space-y-4">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <div>
            <h2 className="text-xl font-semibold text-gray-100 mb-2">Authentication Required</h2>
            <p className="text-gray-400 mb-4">Please sign in to access your settings.</p>
            <Link href="/">
              <Button className="bg-red-600 hover:bg-red-700 text-white">
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

      {/* Mobile Menu Button */}
      <button
        onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
        className="fixed top-4 left-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="w-5 h-5" />
        ) : (
          <PanelLeftClose className="w-5 h-5" />
        )}
      </button>

      {/* Mobile Sidebar Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}
      
      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${
        sidebarCollapsed ? 'lg:ml-12' : 'lg:ml-64'
      } ml-0`}>
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-900 px-4 sm:px-8 py-6">
          <div className="flex items-center space-x-4">
            <Link href="/chat">
              <Button variant="ghost" size="sm" className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gradient-to-br from-red-500 to-orange-500 rounded-lg flex items-center justify-center">
                <Star className="w-4 h-4 text-white fill-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-100">Settings</h1>
                <p className="text-sm text-gray-500 hidden sm:block">Manage your account and preferences</p>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-4 sm:p-8 max-h-[calc(100vh-120px)] overflow-y-auto">
          <div className="max-w-4xl mx-auto">
            
            <Tabs defaultValue="profile" className="space-y-8">
              <TabsList className="grid w-full grid-cols-2 bg-gray-800/50 border border-gray-700/50 rounded-xl p-1">
                <TabsTrigger 
                  value="profile" 
                  className="data-[state=active]:bg-gray-700 data-[state=active]:text-gray-100 data-[state=active]:shadow-sm text-gray-400 rounded-lg transition-all duration-200 text-sm sm:text-base"
                >
                  <User className="w-4 h-4 mr-2" />
                  <span className="hidden sm:inline">Profile</span>
                  <span className="sm:hidden">User</span>
                </TabsTrigger>
                <TabsTrigger 
                  value="account" 
                  className="data-[state=active]:bg-gray-700 data-[state=active]:text-gray-100 data-[state=active]:shadow-sm text-gray-400 rounded-lg transition-all duration-200 text-sm sm:text-base"
                >
                  <Shield className="w-4 h-4 mr-2" />
                  Account
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile">
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

              {/* Account Tab */}
              <TabsContent value="account">
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
    <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8 text-center">
      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
      <h3 className="text-lg font-semibold text-gray-100 mb-2">Something went wrong</h3>
      <p className="text-gray-400 mb-4">We&apos;re having trouble loading this section. Please try refreshing the page.</p>
      <Button 
        onClick={() => window.location.reload()} 
        className="bg-red-600 hover:bg-red-700 text-white"
      >
        Refresh Page
      </Button>
    </div>
  );
}

export default function SettingsPage() {
  return <SettingsContent />;
}