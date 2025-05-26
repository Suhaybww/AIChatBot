// src/components/chat/ChatInterface.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar } from "@/components/ui/avatar";
import { LogoutLink } from "@kinde-oss/kinde-auth-nextjs/components";
import { 
  Send, 
  GraduationCap, 
  // MessageCircle, 
  LogOut, 
  User,
  Bot,
  Sparkles
} from "lucide-react";

interface Message {
  id: string;
  content: string;
  role: "USER" | "ASSISTANT";
  createdAt: Date;
}

interface ChatInterfaceProps {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function ChatInterface({ user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      content: `Hi ${user.given_name || 'there'}! 👋 I'm your RMIT AI Support assistant. I can help you with:\n\n• Course information and requirements\n• Academic policies and procedures\n• Campus resources and services\n• Assessment guidelines\n• Enrollment and timetable questions\n\nWhat would you like to know about?`,
      role: "ASSISTANT",
      createdAt: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      scrollAreaRef.current.scrollTop = scrollAreaRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input,
      role: "USER",
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // Simulate AI response (replace with actual API call)
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: `Thanks for your question about "${input}". I'm currently in beta mode, but I'm designed to help RMIT students with academic support. Here's what I can assist with:\n\n• **Course Information**: Details about specific courses, prerequisites, and learning outcomes\n• **Academic Policies**: University regulations, assessment policies, and academic integrity\n• **Student Services**: Library resources, IT support, counseling, and career services\n• **Campus Life**: Facilities, clubs, events, and student resources\n\nWhat specific area would you like me to help you with?`,
        role: "ASSISTANT",
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b border-gray-200/50 bg-white/80 backdrop-blur-xl">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-red-600 to-red-700 rounded-xl flex items-center justify-center shadow-lg">
              <GraduationCap className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">RMIT AI Support</h1>
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs text-gray-600">Online & Ready</span>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Avatar className="w-8 h-8">
                {user.picture ? (
                  <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" />
                ) : (
                  <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-gray-600" />
                  </div>
                )}
              </Avatar>
              <span className="text-sm font-medium text-gray-700">
                {user.given_name || user.email}
              </span>
            </div>
            
            <LogoutLink>
              <Button variant="ghost" size="sm" className="text-gray-600 hover:text-red-600">
                <LogOut className="w-4 h-4" />
              </Button>
            </LogoutLink>
          </div>
        </div>
      </header>

      {/* Chat Messages */}
      <ScrollArea className="flex-1 px-6 py-4" ref={scrollAreaRef}>
        <div className="space-y-6 max-w-4xl mx-auto">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex space-x-4 ${
                message.role === "USER" ? "justify-end" : "justify-start"
              }`}
            >
              {message.role === "ASSISTANT" && (
                <div className="w-8 h-8 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center">
                  <Bot className="w-4 h-4 text-red-600" />
                </div>
              )}
              
              <div
                className={`max-w-3xl px-4 py-3 rounded-2xl ${
                  message.role === "USER"
                    ? "bg-red-600 text-white"
                    : "bg-white border border-gray-200 text-gray-900"
                }`}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {message.content}
                </div>
                <div
                  className={`text-xs mt-2 ${
                    message.role === "USER" ? "text-red-100" : "text-gray-500"
                  }`}
                >
                  {message.createdAt.toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              {message.role === "USER" && (
                <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                  {user.picture ? (
                    <img src={user.picture} alt="User" className="w-8 h-8 rounded-full" />
                  ) : (
                    <User className="w-4 h-4 text-gray-600" />
                  )}
                </div>
              )}
            </div>
          ))}
          
          {isLoading && (
            <div className="flex space-x-4 justify-start">
              <div className="w-8 h-8 bg-gradient-to-br from-red-100 to-red-200 rounded-full flex items-center justify-center">
                <Bot className="w-4 h-4 text-red-600" />
              </div>
              <div className="bg-white border border-gray-200 px-4 py-3 rounded-2xl">
                <div className="flex items-center space-x-2">
                  <div className="flex space-x-1">
                    <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: "0.1s" }}></div>
                    <div className="w-2 h-2 bg-red-400 rounded-full animate-bounce" style={{ animationDelay: "0.2s" }}></div>
                  </div>
                  <span className="text-sm text-gray-600">Thinking...</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input Area */}
      <div className="border-t border-gray-200/50 bg-white/80 backdrop-blur-xl p-6">
        <div className="max-w-4xl mx-auto">
          <div className="flex space-x-4">
            <div className="flex-1 relative">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ask me about RMIT courses, policies, services, or campus life..."
                className="pr-12 py-3 text-base border-gray-300 focus:border-red-500 focus:ring-red-500"
                disabled={isLoading}
              />
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                <Sparkles className="w-4 h-4 text-red-400" />
              </div>
            </div>
            <Button
              onClick={handleSendMessage}
              disabled={!input.trim() || isLoading}
              className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white px-6 py-3"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          
          <div className="flex items-center justify-center mt-3">
            <p className="text-xs text-gray-500 text-center">
              💡 Try asking: "What are the prerequisites for Computer Science?" or "How do I access the library?"
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}