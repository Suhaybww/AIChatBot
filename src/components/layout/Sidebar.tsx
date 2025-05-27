
"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare
} from "lucide-react";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function Sidebar({ collapsed, onToggle, user }: SidebarProps) {
  if (collapsed) {
    return (
      <div className="fixed left-0 top-0 h-full w-12 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col items-center py-4 z-40">
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="w-8 h-8 p-0 mb-4 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="w-8 h-8 p-0 mb-4 hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400"
          onClick={() => window.location.reload()}
        >
          <Plus className="w-4 h-4" />
        </Button>

        <div className="flex-1" />
        
        <Avatar className="w-8 h-8">
          <AvatarImage src={user.picture || ""} alt="User avatar" />
          <AvatarFallback className="bg-red-600 text-white text-xs">
            {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-gray-50 dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col z-40">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
        <h1 className="text-lg font-semibold text-gray-900 dark:text-gray-100">RMIT AI</h1>
        <Button
          variant="outline"
          size="sm"
          onClick={onToggle}
          className="w-8 h-8 p-0 border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 hover:border-gray-400 dark:hover:border-gray-500 text-gray-600 dark:text-gray-400"
        >
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>

      {/* New Chat Button */}
      <div className="p-4">
        <Button
          onClick={() => window.location.reload()}
          className="w-full justify-start bg-red-600 hover:bg-red-700 text-white h-10"
        >
          <Plus className="w-4 h-4 mr-2" />
          New chat
        </Button>
      </div>

      {/* Empty State */}
      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center max-w-48">
          <div className="w-12 h-12 bg-gray-200 dark:bg-gray-800 rounded-xl flex items-center justify-center mb-4 mx-auto">
            <MessageSquare className="w-6 h-6 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
            No conversations yet
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
            Start a new conversation to see your chat history here.
          </p>
        </div>
      </div>

      {/* User Profile */}
      <div className="border-t border-gray-200 dark:border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.picture || ""} alt="User avatar" />
              <AvatarFallback className="bg-red-600 text-white text-sm">
                {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                {user.given_name ? `${user.given_name} ${user.family_name || ''}`.trim() : user.email}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1 ml-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-8 h-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
            >
              <Settings className="w-4 h-4" />
            </Button>
            <LogoutLink>
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 hover:bg-gray-200 dark:hover:bg-gray-800 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <LogOut className="w-4 h-4" />
              </Button>
            </LogoutLink>
          </div>
        </div>
      </div>
    </div>
  );
}