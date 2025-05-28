// src/components/settings/AccountManagement.tsx
"use client";

import { Button } from "@/components/ui/button";
import { 
  Trash2, 
  AlertTriangle,
  Shield,
  RotateCcw,
  CheckCircle
} from "lucide-react";

interface AccountManagementProps {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function AccountManagement({ user }: AccountManagementProps) {
  return (
    <div className="space-y-8">
      {/* Account Information */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center">
            <Shield className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-100">Account Information</h3>
            <p className="text-sm text-gray-500">Your account details and status</p>
          </div>
        </div>
        
        <div className="bg-gray-700/30 rounded-xl p-6 border border-gray-600/30">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="font-medium text-gray-300">User ID</span>
              </div>
              <p className="text-gray-500 font-mono text-sm bg-gray-800/50 p-3 rounded-lg break-all">
                {user.id}
              </p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="font-medium text-gray-300">Account Type</span>
              </div>
              <p className="text-gray-400">Student</p>
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="font-medium text-gray-300">Status</span>
              </div>
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-emerald-900/30 text-emerald-300 border border-emerald-700/50">
                <CheckCircle className="w-3 h-3 mr-1" />
                Active
              </span>
            </div>
            <div className="space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span className="font-medium text-gray-300">Member Since</span>
              </div>
              <p className="text-gray-400">Today</p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-2xl p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-gray-700 rounded-xl flex items-center justify-center">
            <RotateCcw className="w-5 h-5 text-gray-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-gray-100">Data Management</h3>
            <p className="text-sm text-gray-500">Manage your conversation data</p>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-700/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="w-12 h-12 bg-orange-900/50 rounded-xl flex items-center justify-center">
                <RotateCcw className="w-6 h-6 text-orange-400" />
              </div>
              <div>
                <h4 className="font-semibold text-gray-200">Clear Chat History</h4>
                <p className="text-sm text-gray-400">Permanently delete all your conversations with Vega</p>
              </div>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="border-orange-600/50 bg-orange-900/30 text-orange-300 hover:bg-orange-800/40 hover:border-orange-500 rounded-xl px-6"
            >
              Clear History
            </Button>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-gradient-to-br from-red-900/20 to-pink-900/20 backdrop-blur-sm border border-red-800/50 rounded-2xl p-8">
        <div className="flex items-center space-x-3 mb-8">
          <div className="w-10 h-10 bg-red-900/50 rounded-xl flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-xl font-semibold text-red-400">Danger Zone</h3>
            <p className="text-sm text-red-300/80">Irreversible actions - proceed with caution</p>
          </div>
        </div>
        
        <div className="bg-red-950/30 border border-red-800/50 rounded-xl p-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-semibold text-red-300 mb-1 flex items-center">
                <Trash2 className="w-4 h-4 mr-2" />
                Delete Account
              </h4>
              <p className="text-sm text-red-400/80">Permanently delete your account and all data</p>
            </div>
            <Button 
              variant="outline" 
              size="sm" 
              className="border-red-600/50 text-red-400 hover:bg-red-950/50 hover:border-red-500 rounded-xl px-6"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}