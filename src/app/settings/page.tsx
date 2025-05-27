// src/app/settings/page.tsx
"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sidebar } from "@/components/layout/Sidebar";
import { 
  ArrowLeft, 
  Camera, 
  Save, 
  Trash2, 
  AlertTriangle,
  User,
  Shield,
  Download,
  RotateCcw
} from "lucide-react";
import Link from "next/link";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { useKindeBrowserClient } from "@kinde-oss/kinde-auth-nextjs";
import { useRouter } from "next/navigation";

function SettingsPage() {
  const { user, isAuthenticated, isLoading } = useKindeBrowserClient();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push("/");
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#0f0f0f' }}>
        <div className="text-center space-y-4">
          <div className="w-8 h-8 animate-spin text-red-600 mx-auto border-2 border-red-600 border-t-transparent rounded-full"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  return (
    <div className="h-screen flex" style={{ backgroundColor: '#0f0f0f' }}>
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} 
        user={user}
      />
      
      {/* Main Content */}
      <div className={`flex-1 transition-all duration-300 ${sidebarCollapsed ? 'ml-12' : 'ml-64'}`}>
        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-4" style={{ backgroundColor: '#0f0f0f' }}>
          <div className="flex items-center space-x-4">
            <Link href="/chat">
              <Button variant="ghost" size="sm" className="p-2 text-gray-400 hover:text-gray-200 hover:bg-gray-900">
                <ArrowLeft className="w-4 h-4" />
              </Button>
            </Link>
            <div>
              <h1 className="text-xl font-semibold text-gray-100">Settings</h1>
              <p className="text-sm text-gray-400">Manage your Vega account and preferences</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="max-w-4xl mx-auto">
            
            <Tabs defaultValue="profile" className="space-y-6">
              <TabsList className="grid w-full grid-cols-2 bg-gray-900 border border-gray-800">
                <TabsTrigger 
                  value="profile" 
                  className="data-[state=active]:bg-gray-800 data-[state=active]:text-gray-100 text-gray-400"
                >
                  Profile
                </TabsTrigger>
                <TabsTrigger 
                  value="account" 
                  className="data-[state=active]:bg-gray-800 data-[state=active]:text-gray-100 text-gray-400"
                >
                  Account
                </TabsTrigger>
              </TabsList>

              {/* Profile Tab */}
              <TabsContent value="profile" className="space-y-6">
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                  <div className="flex items-center space-x-2 mb-6">
                    <User className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-100">Profile Information</h2>
                  </div>
                  
                  <div className="space-y-6">
                    {/* Profile Picture */}
                    <div className="flex items-center space-x-6">
                      <div className="relative">
                        <Avatar className="w-20 h-20">
                          <AvatarImage src={user.picture || ""} alt="Profile picture" />
                          <AvatarFallback className="bg-red-600 text-white text-lg font-semibold">
                            {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                          </AvatarFallback>
                        </Avatar>
                        <Button
                          size="sm"
                          className="absolute -bottom-2 -right-2 w-8 h-8 p-0 rounded-full bg-red-600 hover:bg-red-700"
                        >
                          <Camera className="w-4 h-4" />
                        </Button>
                      </div>
                      <div>
                        <h3 className="font-medium text-gray-100">Profile Picture</h3>
                        <p className="text-sm text-gray-400">
                          Click the camera icon to upload a new picture
                        </p>
                      </div>
                    </div>

                    {/* Personal Information */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName" className="text-gray-300">First Name</Label>
                        <Input
                          id="firstName"
                          defaultValue={user.given_name || ""}
                          placeholder="Enter your first name"
                          className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName" className="text-gray-300">Last Name</Label>
                        <Input
                          id="lastName"
                          defaultValue={user.family_name || ""}
                          placeholder="Enter your last name"
                          className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="email" className="text-gray-300">Email Address</Label>
                      <Input
                        id="email"
                        type="email"
                        defaultValue={user.email || ""}
                        placeholder="Enter your email"
                        className="bg-gray-800 border-gray-700 text-gray-100 placeholder:text-gray-500"
                      />
                      <p className="text-xs text-gray-500">
                        This email is used for your RMIT account access
                      </p>
                    </div>

                    <Button className="bg-red-600 hover:bg-red-700 text-white">
                      <Save className="w-4 h-4 mr-2" />
                      Save Changes
                    </Button>
                  </div>
                </div>
              </TabsContent>

              {/* Account Tab */}
              <TabsContent value="account" className="space-y-6">
                {/* Account Info */}
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                  <div className="flex items-center space-x-2 mb-6">
                    <Shield className="w-5 h-5 text-gray-400" />
                    <h2 className="text-lg font-semibold text-gray-100">Account Information</h2>
                  </div>
                  
                  <div className="bg-gray-800 rounded-lg p-4 mb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="font-medium text-gray-300">User ID:</span>
                        <p className="text-gray-400 font-mono text-xs mt-1 break-all">{user.id}</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-300">Account Type:</span>
                        <p className="text-gray-400 mt-1">RMIT Student</p>
                      </div>
                      <div>
                        <span className="font-medium text-gray-300">Account Status:</span>
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-900 text-green-200 mt-1">
                          Active
                        </span>
                      </div>
                      <div>
                        <span className="font-medium text-gray-300">Member Since:</span>
                        <p className="text-gray-400 mt-1">Today</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Data Management */}
                <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-gray-100 mb-4">Data Management</h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <Download className="w-4 h-4 text-gray-400" />
                        <div>
                          <h4 className="font-medium text-gray-100">Export Data</h4>
                          <p className="text-sm text-gray-400">Download your conversation history</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:bg-gray-700">
                        Export
                      </Button>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-gray-800 rounded-lg">
                      <div className="flex items-center space-x-3">
                        <RotateCcw className="w-4 h-4 text-orange-400" />
                        <div>
                          <h4 className="font-medium text-gray-100">Clear Chat History</h4>
                          <p className="text-sm text-gray-400">Permanently delete all conversations</p>
                        </div>
                      </div>
                      <Button variant="outline" size="sm" className="border-orange-600 text-orange-400 hover:bg-orange-950/20">
                        Clear
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Danger Zone */}
                <div className="bg-gray-900 border border-red-800 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-red-400 mb-4 flex items-center">
                    <AlertTriangle className="w-5 h-5 mr-2" />
                    Danger Zone
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 bg-red-950/20 border border-red-800 rounded-lg">
                      <div>
                        <h4 className="font-medium text-red-400">Sign Out</h4>
                        <p className="text-sm text-red-300">Sign out of your Vega account</p>
                      </div>
                      <LogoutLink>
                        <Button variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-950/20">
                          Sign Out
                        </Button>
                      </LogoutLink>
                    </div>

                    <div className="flex items-center justify-between p-3 bg-red-950/20 border border-red-800 rounded-lg">
                      <div>
                        <h4 className="font-medium text-red-400 flex items-center">
                          <Trash2 className="w-4 h-4 mr-2" />
                          Delete Account
                        </h4>
                        <p className="text-sm text-red-300">Permanently delete your account and all data</p>
                      </div>
                      <Button variant="outline" size="sm" className="border-red-600 text-red-400 hover:bg-red-950/20">
                        <Trash2 className="w-4 h-4 mr-2" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>
            </Tabs>

          </div>
        </div>
      </div>
    </div>
  );
}

export default SettingsPage;