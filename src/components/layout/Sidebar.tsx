// src/components/layout/Sidebar.tsx
"use client";

import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Plus,
  Settings,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  MessageSquare,
  Star
} from "lucide-react";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import Link from "next/link";
import { useState } from "react";

interface SidebarProps {
  collapsed: boolean;          // Add this
  onToggle: () => void;        // Add this
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function Sidebar({ user }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  
  const handleVegaClick = () => {
    window.location.href = "/chat";
  };

  if (collapsed) {
    return (
      <div className="fixed left-0 top-0 h-full w-12 bg-gray-950 border-r border-gray-800 flex flex-col items-center py-4 z-40">
      <button
        onClick={handleVegaClick}
        className="w-8 h-8 p-0 mb-4 text-red-500 hover:bg-gray-800 hover:text-red-400 focus:outline-none rounded-lg flex items-center justify-center"
        title="Vega - New Chat"
      >
        <Star className="w-4 h-4 fill-current" />
      </button>

        <Button
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(false)}
          className="w-8 h-8 p-0 mb-4 border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-300 hover:border-gray-600"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </Button>
        
        <Button
          variant="ghost"
          size="sm"
          className="w-8 h-8 p-0 mb-4 hover:bg-gray-800 text-gray-400 hover:text-gray-300"
          onClick={() => window.location.reload()}
        >
          <Plus className="w-4 h-4" />
        </Button>

        <div className="flex-1" />
        
        <Avatar className="w-8 h-8">
          <AvatarImage src={user.picture || ""} alt="User avatar" />
          <AvatarFallback className="bg-gray-700 text-white text-xs">
            {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className="fixed left-0 top-0 h-full w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-40">
      <div className="border-b border-gray-800 relative">
        <div 
          onClick={handleVegaClick}
          className="w-full flex items-center justify-start p-4 cursor-pointer select-none hover:bg-transparent"
        >
          <div className="flex items-center space-x-2">
            <Star className="w-5 h-5 text-red-500 fill-current" />
            <h1 className="text-lg font-semibold text-gray-100">Vega</h1>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setCollapsed(true)}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 w-8 h-8 p-0 border-gray-700 bg-gray-900 hover:bg-gray-800 hover:border-gray-600 text-gray-400 hover:text-gray-300"
        >
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4">
        <Button
          onClick={() => window.location.reload()}
          className="w-full justify-start bg-gray-800 hover:bg-gray-700 text-white h-10 border border-gray-700 hover:border-gray-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          New chat
        </Button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-4 py-8">
        <div className="text-center max-w-48">
          <div className="w-12 h-12 bg-gray-800 rounded-xl flex items-center justify-center mb-4 mx-auto">
            <MessageSquare className="w-6 h-6 text-gray-500" />
          </div>
          <h3 className="text-sm font-medium text-gray-300 mb-2">
            No conversations yet
          </h3>
          <p className="text-xs text-gray-500 leading-relaxed">
            Start chatting with Vega to see your conversation history here.
          </p>
        </div>
      </div>

      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.picture || ""} alt="User avatar" />
              <AvatarFallback className="bg-gray-700 text-white text-sm">
                {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-300 truncate">
                {user.given_name ? `${user.given_name} ${user.family_name || ''}`.trim() : user.email}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-1 ml-2">
            <Link href="/settings">
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 hover:bg-gray-800 text-gray-500 hover:text-gray-300"
              >
                <Settings className="w-4 h-4" />
              </Button>
            </Link>
            <LogoutLink>
              <Button
                variant="ghost"
                size="sm"
                className="w-8 h-8 p-0 hover:bg-gray-800 text-gray-500 hover:text-gray-300"
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