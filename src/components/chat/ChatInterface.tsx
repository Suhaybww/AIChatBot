// src/components/chat/ChatInterface.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { 
  Send, 
  Bot,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

interface Message {
  id: string;
  content: string;
  role: "USER" | "ASSISTANT";
  createdAt: Date;
  isTyping?: boolean;
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

const suggestions = [
  "What are the prerequisites for Computer Science courses?",
  "How do I access the RMIT library resources?",
  "Tell me about the course enrollment process",
  "What student support services are available?",
  "How do I contact academic advisors?"
];

export function ChatInterface({ user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: textToSend,
      role: "USER",
      createdAt: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Add a mock AI response after a delay
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        content: `Thanks for your question about "${textToSend}". I'm here to help you with RMIT-related queries. This is a placeholder response - in the real application, this would be connected to your AI backend to provide helpful information about courses, policies, services, and campus life.`,
        role: "ASSISTANT",
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  const copyMessage = (content: string) => {
    navigator.clipboard.writeText(content);
  };

  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0)
      .map(line => `<p class="mb-2 last:mb-0">${line}</p>`)
      .join('');
  };

  return (
    <div className="h-screen flex bg-white dark:bg-gray-950">
      {/* Sidebar */}
      <Sidebar 
        collapsed={sidebarCollapsed} 
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        user={user}
      />
      
      {/* Main Chat Area */}
      <div className={`flex-1 flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'ml-12' : 'ml-64'}`}>
        
        {/* Chat Messages */}
        <div className="flex-1 relative">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="max-w-3xl mx-auto px-4">
              {messages.length === 0 ? (
                /* Welcome Screen */
                <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
                  <div className="w-12 h-12 bg-red-600 rounded-xl flex items-center justify-center mb-6">
                    <Bot className="w-6 h-6 text-white" />
                  </div>
                  <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
                    How can I help you today?
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-md">
                    I&apos;m your RMIT AI assistant. Ask me about courses, policies, services, or anything else related to your university experience.
                  </p>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="p-4 text-left border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                      >
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100 mb-1">
                          {suggestion.split(' ').slice(0, 4).join(' ')}...
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          {suggestion}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Messages */
                <div className="py-8 space-y-8">
                  {messages.map((message) => (
                    <div key={message.id} className="group">
                      <div className="flex space-x-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {message.role === "ASSISTANT" ? (
                            <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center">
                              <Bot className="w-4 h-4 text-white" />
                            </div>
                          ) : (
                            <Avatar className="w-8 h-8">
                              <AvatarImage src={user.picture || ""} alt="User avatar" />
                              <AvatarFallback className="bg-blue-600 text-white text-sm">
                                {user.given_name?.[0] || user.email?.[0]?.toUpperCase() || 'U'}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {message.role === "ASSISTANT" ? "RMIT AI" : (user.given_name || "You")}
                            </span>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {message.createdAt.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>
                          
                          <div 
                            className="prose prose-sm max-w-none text-gray-900 dark:text-gray-100 dark:prose-invert"
                            dangerouslySetInnerHTML={{ 
                              __html: formatMessage(message.content)
                            }}
                          />

                          {/* Action Buttons */}
                          {message.role === "ASSISTANT" && (
                            <div className="flex items-center space-x-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyMessage(message.content)}
                                className="h-8 px-2 text-gray-500"
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-500"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-500"
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-500"
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-500"
                              >
                                <MoreHorizontal className="w-3 h-3" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator */}
                  {isLoading && (
                    <div className="group">
                      <div className="flex space-x-4">
                        <div className="w-8 h-8 bg-red-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">RMIT AI</span>
                          </div>
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                            <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-950 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message RMIT AI..."
                className="pr-12 py-3 resize-none border-gray-300 dark:border-gray-700 focus:border-red-500 focus:ring-red-500 rounded-xl"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-red-600 hover:bg-red-700 text-white w-8 h-8 p-0"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="text-xs text-gray-500 dark:text-gray-400 text-center mt-2">
              RMIT AI can make mistakes. Consider checking important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}