// src/components/settings/UserProfile.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Save, 
  User,
  Sparkles,
  Mail,
  Calendar,
  CheckCircle,
  Shield
} from "lucide-react";

interface UserProfileProps {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function UserProfile({ user }: UserProfileProps) {
  return (
    <div className="space-y-8">
      {/* Profile Header Card */}
      <div className="bg-gradient-to-r from-gray-800/80 to-gray-700/80 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center space-x-6">
          <div className="relative">
            <Avatar className="w-24 h-24 ring-4 ring-gray-600/50">
              <AvatarImage src={user.picture || ""} alt="Profile picture" />
              <AvatarFallback className="bg-gradient-to-br from-red-500 to-orange-500 text-white text-2xl font-bold">
                {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-green-500 border-2 border-gray-800 rounded-full flex items-center justify-center">
              <CheckCircle className="w-3 h-3 text-white" />
            </div>
          </div>
          <div className="flex-1">
            <div className="flex items-center space-x-2 mb-2">
              <h2 className="text-2xl font-bold text-gray-100">
                {user.given_name ? `${user.given_name} ${user.family_name || ''}`.trim() : 'Welcome'}
              </h2>
              <Sparkles className="w-5 h-5 text-yellow-400" />
            </div>
            <p className="text-gray-400 flex items-center space-x-2">
              <Mail className="w-4 h-4" />
              <span>{user.email}</span>
            </p>
            <p className="text-sm text-gray-500 mt-2 flex items-center space-x-2">
              <Calendar className="w-4 h-4" />
              <span>Student • Member since today</span>                      
            </p>
          </div>
        </div>
      </div>

      {/* Profile Information Card */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center">
            <User className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-100">Profile Information</h3>
            <p className="text-sm text-gray-500">Update your personal details</p>
          </div>
        </div>
        
        <div className="space-y-6">
          {/* Personal Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <Label htmlFor="firstName" className="text-gray-300 font-medium">First Name</Label>
              <Input
                id="firstName"
                defaultValue={user.given_name || ""}
                placeholder="Enter your first name"
                className="bg-gray-700/50 border-gray-600/50 text-gray-200 placeholder:text-gray-500 rounded-xl h-12 focus:bg-gray-700 transition-colors duration-200"
              />
            </div>
            <div className="space-y-3">
              <Label htmlFor="lastName" className="text-gray-300 font-medium">Last Name</Label>
              <Input
                id="lastName"
                defaultValue={user.family_name || ""}
                placeholder="Enter your last name"
                className="bg-gray-700/50 border-gray-600/50 text-gray-200 placeholder:text-gray-500 rounded-xl h-12 focus:bg-gray-700 transition-colors duration-200"
              />
            </div>
          </div>

          <div className="space-y-3">
            <Label htmlFor="email" className="text-gray-300 font-medium">Email Address</Label>
            <Input
              id="email"
              type="email"
              defaultValue={user.email || ""}
              placeholder="Enter your email"
              className="bg-gray-700/50 border-gray-600/50 text-gray-200 placeholder:text-gray-500 rounded-xl h-12 focus:bg-gray-700 transition-colors duration-200"
            />
            <p className="text-xs text-gray-500 flex items-center space-x-1">
              <Shield className="w-3 h-3" />
              <span>This email is used for your account access</span>
            </p>
          </div>

          <Button className="bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white shadow-lg hover:shadow-xl transition-all duration-200 rounded-xl h-12 px-8">
            <Save className="w-4 h-4 mr-2" />
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
}