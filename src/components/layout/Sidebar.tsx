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
  Star,
  Loader2,
} from "lucide-react";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";

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

export function Sidebar({ user, collapsed, onToggle }: SidebarProps) {
  const { data: sessions, isLoading } = api.chat.getSessions.useQuery(undefined, {
    refetchOnWindowFocus: false,
    refetchOnMount: true, // Allow refetch on mount
    refetchOnReconnect: false,
    staleTime: 1000 * 30, // Reduced to 30 seconds for more frequent updates
  });
  const router = useRouter();
  const pathname = usePathname();
  const [isCreatingNewChat, setIsCreatingNewChat] = useState(false);

  const handleVegaClick = () => {
    router.push("/chat");
  };

  const handleNewChat = async () => {
    setIsCreatingNewChat(true);
    // Small delay to show loading state
    setTimeout(() => {
      router.push("/chat");
      setIsCreatingNewChat(false);
    }, 200);
  };

  const handleSessionClick = (sessionId: string) => {
    router.push(`/chat/${sessionId}`);
  };

  // Get current session ID from URL
  const currentSessionId = pathname.startsWith('/chat/') ? pathname.split('/')[2] : null;

  if (collapsed) {
    return (
      <div className="fixed left-0 top-0 h-full w-12 bg-gray-950 border-r border-gray-800 z-40 py-4 hidden lg:flex lg:flex-col lg:items-center">
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
          onClick={onToggle}
          className="w-8 h-8 p-0 mb-4 border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-gray-300 hover:border-gray-600"
        >
          <PanelLeftOpen className="w-4 h-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          className="w-8 h-8 p-0 mb-4 hover:bg-gray-800 text-gray-400 hover:text-gray-300"
          onClick={handleNewChat}
          disabled={isCreatingNewChat}
        >
          {isCreatingNewChat ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Plus className="w-4 h-4" />
          )}
        </Button>

        <div className="flex-1" />

        <Avatar className="w-8 h-8">
          <AvatarImage src={user.picture || ""} alt="User avatar" />
          <AvatarFallback className="bg-gray-700 text-white text-xs">
            {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || "U"}
          </AvatarFallback>
        </Avatar>
      </div>
    );
  }

  return (
    <div className={`fixed left-0 top-0 h-full w-64 bg-gray-950 border-r border-gray-800 flex flex-col z-40 ${
      collapsed ? 'translate-x-[-100%]' : 'translate-x-0'
    } lg:translate-x-0 transition-transform duration-300`}>
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
          onClick={onToggle}
          className="absolute right-4 top-1/2 transform -translate-y-1/2 w-8 h-8 p-0 border-gray-700 bg-gray-900 hover:bg-gray-800 hover:border-gray-600 text-gray-400 hover:text-gray-300 hidden lg:flex"
        >
          <PanelLeftClose className="w-4 h-4" />
        </Button>
      </div>

      <div className="p-4">
        <Button
          onClick={handleNewChat}
          disabled={isCreatingNewChat}
          className="w-full justify-start bg-gray-800 hover:bg-gray-700 text-white h-10 border border-gray-700 hover:border-gray-600 disabled:opacity-50"
        >
          {isCreatingNewChat ? (
            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
          ) : (
            <Plus className="w-4 h-4 mr-2" />
          )}
          New chat
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto w-full px-4 py-2 sidebar-scroll flex flex-col">
        {isLoading ? (
          <div className="text-gray-500 text-sm text-center py-8">
            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            Loading chats...
          </div>
        ) : sessions && sessions.length > 0 ? (
          <div className="space-y-1">
            {sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSessionClick(session.id)}
                className={`w-full text-left px-3 py-3 hover:bg-gray-800 transition-colors rounded-lg border border-transparent ${
                  currentSessionId === session.id 
                    ? 'bg-gray-800 border-gray-700' 
                    : 'hover:border-gray-800'
                }`}
              >
                <div className="text-sm font-medium text-gray-200 truncate">
                  {session.title || "Untitled Chat"}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {new Date(session.updatedAt).toLocaleDateString()} • {session.messageCount} messages
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center max-w-48 mx-auto">
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
        )}
      </div>

      <div className="border-t border-gray-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <Avatar className="w-8 h-8">
              <AvatarImage src={user.picture || ""} alt="User avatar" />
              <AvatarFallback className="bg-gray-700 text-white text-sm">
                {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-300 truncate">
                {user.given_name
                  ? `${user.given_name} ${user.family_name || ""}`.trim()
                  : user.email}
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