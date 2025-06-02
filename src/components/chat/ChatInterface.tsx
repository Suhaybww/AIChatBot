// src/components/chat/ChatInterface.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Send,
  Copy,
  RotateCcw,
  Star,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Check,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";

import { api } from "@/lib/trpc";

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
  "What are the entry requirements for RMIT's Computer Science degree?",
  "How do I access Canvas and other RMIT online systems?",
  "Tell me about RMIT's course enrollment deadlines",
  "What mental health and wellbeing services does RMIT offer?",
  "How can I contact my RMIT program manager?",
];

export function ChatInterface({ user }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Start collapsed on mobile
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

  // Smooth scroll to bottom function
  const scrollToBottom = useCallback((force = false) => {
    if (!autoScroll && !force) return;
    
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [autoScroll]);

  // Auto-scroll when messages change
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100); // Small delay to ensure DOM is updated

    return () => clearTimeout(timer);
  }, [messages, isLoading, scrollToBottom]);

  // Handle scroll detection to show/hide scroll button
  useEffect(() => {
    const scrollElement = scrollAreaRef.current?.querySelector(
      "[data-radix-scroll-area-viewport]"
    ) as HTMLElement;

    if (!scrollElement) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = scrollElement;
      const isNearBottom = scrollTop + clientHeight >= scrollHeight - 100;
      
      setShowScrollButton(!isNearBottom && messages.length > 0);
      setAutoScroll(isNearBottom);
    };

    scrollElement.addEventListener('scroll', handleScroll);
    return () => scrollElement.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { mutateAsync: sendMessage } = api.chat.sendMessage.useMutation();

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: textToSend,
      role: "USER",
      createdAt: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setAutoScroll(true); // Enable auto-scroll for new conversation

    // Scroll to user message immediately
    setTimeout(() => scrollToBottom(true), 50);

    try {
      // Send message to database and get AI response
      const response = await sendMessage({ 
        content: textToSend, 
        sessionId: currentSessionId || undefined 
      });

      // If this is a new session, store the session ID
      if (!currentSessionId) {
        setCurrentSessionId(response.sessionId);
      }

      const messageByAI: Message = {
        id: (Date.now() + 1).toString(),
        content: response.message,
        role: "ASSISTANT",
        createdAt: new Date(),
      };

      setMessages((prev) => [...prev, messageByAI]);
      
      // Scroll to AI response after it's added
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {
      console.error("Error in chat:", error);
      // Show error message to user
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I apologize, but I encountered an error. Please try again.",
        role: "ASSISTANT",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
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

  // Auto-focus input after sending message
  useEffect(() => {
    if (!isLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading]);

  const handleSuggestionClick = (suggestion: string) => {
    setAutoScroll(true); // Enable auto-scroll for new conversation
    handleSendMessage(suggestion);
  };

  const copyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      // Show visual feedback
      setCopiedMessageId(messageId);
      // Hide feedback after 2 seconds
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        // Show visual feedback for fallback too
        setCopiedMessageId(messageId);
        setTimeout(() => setCopiedMessageId(null), 2000);
      } catch (fallbackErr) {
        console.error('Fallback copy failed:', fallbackErr);
      }
      document.body.removeChild(textArea);
    }
  };

  const retryMessage = async (messageId: string) => {
    if (isLoading || retryingMessageId) return;

    // Find the current AI message and the user message that prompted it
    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    // Find the user message that prompted this AI response
    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== "USER") return;

    // Set retry state for this specific message
    setRetryingMessageId(messageId);
    setAutoScroll(true);

    // Remove the current AI response after a brief delay to show the retry action
    setTimeout(() => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setIsLoading(true);
    }, 300);

    try {
      // Send the same user message again using the chat router
      const response = await sendMessage({ 
        content: userMessage.content, 
        sessionId: currentSessionId || undefined 
      });

      const newMessageByAI: Message = {
        id: Date.now().toString(),
        content: response.message,
        role: "ASSISTANT",
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, newMessageByAI]);
      
      // Scroll to new AI response
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {
      console.error("Error in retry:", error);
      // Show error message
      const errorMessage: Message = {
        id: Date.now().toString(),
        content: "I apologize, but I encountered an error while retrying. Please try again.",
        role: "ASSISTANT",
        createdAt: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setRetryingMessageId(null);
    }
  };

  const formatMessage = (content: string) => {
    return content
      .replace(/\*\*(.*?)\*\*/g, '<strong class="font-semibold">$1</strong>')
      .replace(/\*(.*?)\*/g, '<em class="italic">$1</em>')
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `<p class="mb-2 last:mb-0">${line}</p>`)
      .join("");
  };

  return (
    <div className="h-screen flex bg-gray-900 overflow-hidden">
      {/* Sidebar with corrected props */}
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
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

      {/* Main Chat Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 bg-gray-900 h-screen ${
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-64"
        } ml-0`}
      >
        {/* Chat Messages */}
        <div className="flex-1 relative bg-gray-900 overflow-hidden min-h-0">
          <ScrollArea className="h-full bg-gray-900" ref={scrollAreaRef}>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 bg-gray-900 pb-4 min-h-full flex flex-col">
              {messages.length === 0 ? (
                /* Welcome Screen */
                <div className="flex flex-col items-center justify-center flex-1 text-center px-4">
                  {/* Aesthetic Vega Branding */}
                  <div className="mb-8">
                    <div className="flex items-center justify-center space-x-3 mb-6">
                      <Star className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 fill-current animate-pulse" />
                      <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold bg-gradient-to-r from-red-500 via-red-400 to-orange-400 bg-clip-text text-transparent">
                        Vega
                      </h1>
                      <Star
                        className="w-6 h-6 sm:w-8 sm:h-8 text-red-500 fill-current animate-pulse"
                        style={{ animationDelay: "0.5s" }}
                      />
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-xs sm:text-sm text-gray-500 mb-4">
                      <Sparkles className="w-4 h-4 text-red-400" />
                      <span className="italic font-medium">
                        Your brightest guide to RMIT
                      </span>
                      <Sparkles className="w-4 h-4 text-red-400" />
                    </div>
                  </div>

                  <h2 className="text-xl sm:text-2xl font-semibold text-gray-200 mb-3">
                    How can I help you today?
                  </h2>
                  <p className="text-gray-500 mb-8 max-w-md leading-relaxed text-sm sm:text-base">
                    Named after the brightest navigation star, I&apos;m here to
                    guide you through courses, policies, services, and
                    everything about your university experience.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        disabled={isLoading}
                        className="p-3 sm:p-4 text-left border border-gray-700 bg-gray-800 rounded-xl hover:bg-gray-700 hover:border-gray-600 transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <div className="text-xs sm:text-sm font-medium text-gray-300 mb-1 group-hover:text-gray-200 transition-colors">
                          {suggestion.split(" ").slice(0, 4).join(" ")}...
                        </div>
                        <div className="text-xs text-gray-500 line-clamp-2">
                          {suggestion}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* Messages */
                <div className="py-4 sm:py-6 space-y-6 sm:space-y-8 bg-gray-900 flex-1">
                  {messages.map((message, index) => (
                    <div 
                      key={message.id} 
                      className="group animate-in fade-in-0 slide-in-from-bottom-4 duration-500"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex space-x-3 sm:space-x-4">
                        {/* Avatar */}
                        <div className="flex-shrink-0">
                          {message.role === "ASSISTANT" ? (
                            <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                              <Star className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 fill-current" />
                            </div>
                          ) : (
                            <Avatar className="w-7 h-7 sm:w-8 sm:h-8">
                              <AvatarImage
                                src={user.picture || ""}
                                alt="User avatar"
                              />
                              <AvatarFallback className="bg-gray-700 text-white text-xs sm:text-sm">
                                {user.given_name?.[0] ||
                                  user.email?.[0]?.toUpperCase() ||
                                  "U"}
                              </AvatarFallback>
                            </Avatar>
                          )}
                        </div>

                        {/* Content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-xs sm:text-sm font-semibold text-gray-300">
                              {message.role === "ASSISTANT"
                                ? "Vega"
                                : user.given_name || "You"}
                            </span>
                            <span className="text-xs text-gray-600">
                              {message.createdAt.toLocaleTimeString([], {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                          </div>

                          <div
                            className="prose prose-sm max-w-none text-gray-400 prose-strong:text-gray-300 text-sm sm:text-base leading-relaxed"
                            dangerouslySetInnerHTML={{
                              __html: formatMessage(message.content),
                            }}
                          />

                          {/* Action Buttons */}
                          {message.role === "ASSISTANT" && (
                            <div className="flex items-center space-x-1 sm:space-x-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyMessage(message.content, message.id)}
                                className={`h-7 sm:h-8 px-1 sm:px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800 rounded-md transition-colors ${
                                  copiedMessageId === message.id ? 'text-green-500 hover:text-green-400' : ''
                                }`}
                                title={copiedMessageId === message.id ? "Copied!" : "Copy message"}
                              >
                                {copiedMessageId === message.id ? (
                                  <Check className="w-3 h-3" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => retryMessage(message.id)}
                                disabled={isLoading || retryingMessageId === message.id}
                                className="h-7 sm:h-8 px-1 sm:px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                title="Retry response"
                              >
                                <RotateCcw className={`w-3 h-3 ${retryingMessageId === message.id ? 'animate-spin' : ''}`} />
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Loading indicator - Only show when actually loading */}
                  {isLoading && (
                    <div className="group animate-in fade-in-0 duration-300">
                      <div className="flex space-x-3 sm:space-x-4">
                        <div className="w-7 h-7 sm:w-8 sm:h-8 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Star className="w-3 h-3 sm:w-4 sm:h-4 text-red-500 fill-current" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-xs sm:text-sm font-semibold text-gray-300">
                              Vega
                            </span>
                          </div>
                          <div className="flex space-x-1">
                            <div className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"></div>
                            <div
                              className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
                              style={{ animationDelay: "0.1s" }}
                            ></div>
                            <div
                              className="w-2 h-2 bg-gray-600 rounded-full animate-bounce"
                              style={{ animationDelay: "0.2s" }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Invisible element for scrolling target */}
                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Scroll to bottom button */}
          {showScrollButton && (
            <div className="absolute bottom-24 sm:bottom-28 right-4 z-10">
              <Button
                onClick={() => scrollToBottom(true)}
                size="sm"
                className="bg-gray-700 hover:bg-gray-600 text-white rounded-full w-10 h-10 p-0 shadow-lg border border-gray-600 hover:scale-105 transition-all duration-200"
              >
                <ChevronDown className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* Input Area - Enhanced visibility */}
        <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 p-3 sm:p-4 relative z-20">
          <div className="max-w-4xl mx-auto">
            <div className="relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isLoading ? "Vega is thinking..." : "Message Vega..."}
                className="pr-12 py-3 sm:py-4 resize-none border-gray-600 bg-gray-750 text-gray-100 placeholder:text-gray-400 focus:border-red-500 focus:ring-red-500/30 focus:ring-2 rounded-xl text-sm sm:text-base transition-all duration-200 w-full min-h-[52px] shadow-lg"
                style={{ backgroundColor: '#374151' }}
                disabled={isLoading}
                autoComplete="off"
                spellCheck="false"
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white w-9 h-9 sm:w-10 sm:h-10 p-0 transition-all duration-200 hover:scale-105 disabled:hover:scale-100 rounded-lg shadow-lg"
              >
                <Send className="w-4 h-4 sm:w-5 sm:h-5" />
              </Button>
            </div>

            <div className="text-xs text-gray-500 text-center mt-3 px-2">
              Vega can make mistakes. Consider checking important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}