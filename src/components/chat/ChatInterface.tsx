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
  Loader2,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api } from "@/lib/trpc";
import { useRouter } from "next/navigation";

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
  sessionId?: string; // Optional sessionId prop for loading existing conversations
}

const suggestions = [
  "What are the entry requirements for RMIT's Computer Science degree?",
  "How do I access Canvas and other RMIT online systems?",
  "Tell me about RMIT's course enrollment deadlines",
  "What mental health and wellbeing services does RMIT offer?",
];

export function ChatInterface({ user, sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); // Start collapsed on mobile
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [hasRedirected, setHasRedirected] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  // API hooks
  const { mutateAsync: sendMessage } = api.chat.sendMessage.useMutation();
  const { data: sessionData, isLoading: sessionLoading, error: sessionError } = api.chat.getSession.useQuery(
    { sessionId: sessionId! },
    { 
      enabled: !!sessionId,
      retry: false,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: false,
    }
  );

  // Get utils for query invalidation
  const utils = api.useUtils();

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

  // Reset messages when sessionId changes (new session clicked) or when transitioning to a new chat
  useEffect(() => {
    // Clear messages when:
    // 1. Transitioning between different sessions
    // 2. Going from a session to a new chat (sessionId becomes undefined)
    // 3. Going from a new chat to a session
    if (sessionId !== currentSessionId) {
      console.log('Clearing messages for transition from', currentSessionId, 'to', sessionId || 'new chat');
      setMessages([]);
      setCurrentSessionId(sessionId || null);
    }
  }, [sessionId, currentSessionId]);

  // Load existing session data
  useEffect(() => {
    // Only load session data if we have sessionId from props (existing session)
    // Don't interfere with new sessions created during chat
    if (sessionData && sessionData.messages && sessionId) {
      // Only update if we haven't loaded this session's messages yet
      const hasMatchingMessages = messages.length > 0 && 
        messages[0] && sessionData.messages[0] && 
        messages[0].id === sessionData.messages[0].id;
        
      if (!hasMatchingMessages) {
        console.log('Loading session messages:', sessionData.messages.length, 'messages for session:', sessionData.id);
        const formattedMessages: Message[] = sessionData.messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          createdAt: new Date(msg.createdAt),
        }));
        setMessages(formattedMessages);
        setCurrentSessionId(sessionData.id);
        
        // Scroll to bottom after loading messages
        setTimeout(() => {
          scrollToBottom(true);
        }, 100);
      }
    }
  }, [sessionData, scrollToBottom, messages, sessionId]);

  // Handle session loading error
  useEffect(() => {
    if (sessionError && sessionId && !hasRedirected) {
      console.error("Failed to load session:", sessionError);
      // Only redirect if we're actually trying to load a specific session
      // and we're not already on the main chat page
      if (window.location.pathname !== '/chat') {
        setHasRedirected(true);
        router.replace("/chat");
      }
    }
  }, [sessionError, sessionId, router, hasRedirected]);

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
    if (!sessionLoading) {
      inputRef.current?.focus();
    }
  }, [sessionLoading]);

  const handleSendMessage = async (messageText?: string) => {
    const textToSend = messageText || input;
    if (!textToSend.trim() || isLoading) return;

    console.log('Sending message:', textToSend, 'Current session ID:', currentSessionId);

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

      console.log('Received response:', response);

      // If this is a new session, store the session ID
      if (!currentSessionId) {
        console.log('Setting new session ID:', response.sessionId);
        setCurrentSessionId(response.sessionId);
        // Note: We're not updating the URL here to avoid page reloads
        // The URL will be correct when user refreshes or navigates
      }

      // Invalidate sessions query to update sidebar
      await utils.chat.getSessions.invalidate();

      const messageByAI: Message = {
        id: (Date.now() + 1).toString(),
        content: response.message,
        role: "ASSISTANT",
        createdAt: new Date(),
      };

      console.log('Adding AI message:', messageByAI);
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
    if (!isLoading && !sessionLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, sessionLoading]);

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

      // Invalidate sessions query to update sidebar
      await utils.chat.getSessions.invalidate();

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

  // Show loading state while session is loading
  if (sessionLoading) {
    return (
      <div className="h-screen flex bg-gray-900 overflow-hidden">
        <Sidebar
          user={user}
          collapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
        
        <div className={`flex-1 flex flex-col transition-all duration-300 bg-gray-900 h-screen ${
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-64"
        } ml-0`}>
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <Loader2 className="w-8 h-8 text-red-500 animate-spin mx-auto mb-4" />
              <p className="text-gray-400">Loading conversation...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex bg-gray-900 overflow-hidden">
      {/* Sidebar with corrected props */}
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Mobile Menu Button - Only show when sidebar is collapsed */}
      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="fixed top-4 left-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {/* Mobile Sidebar Overlay */}
      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {/* Mobile close button when sidebar is open */}
      {!sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="fixed top-4 right-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      )}

      {/* Main Chat Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 bg-gray-900 h-screen ${
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-64"
        } ml-0 ${!sidebarCollapsed ? 'hidden lg:flex' : 'flex'}`}
      >
        {/* Chat Messages */}
        <div className="flex-1 relative bg-gray-900 overflow-hidden min-h-0">
          <ScrollArea className="h-full bg-gray-900" ref={scrollAreaRef}>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 bg-gray-900 pb-4 min-h-full flex flex-col">
              {messages.length === 0 ? (
                /* Welcome Screen */
                <div className="flex flex-col items-center justify-center flex-1 text-center px-4 py-8">
                  {/* Aesthetic Vega Branding */}
                  <div className="mb-12">
                    <div className="flex items-center justify-center space-x-4 mb-8">
                      <div className="relative">
                        <Star className="w-8 h-8 sm:w-10 sm:h-10 text-red-500 fill-current animate-pulse drop-shadow-lg" />
                        <div className="absolute inset-0 w-8 h-8 sm:w-10 sm:h-10 bg-red-500/20 rounded-full blur-xl animate-pulse"></div>
                      </div>
                      <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold bg-gradient-to-r from-red-500 via-red-400 to-orange-400 bg-clip-text text-transparent drop-shadow-2xl">
                        Vega
                      </h1>
                      <div className="relative">
                        <Star
                          className="w-8 h-8 sm:w-10 sm:h-10 text-red-500 fill-current animate-pulse drop-shadow-lg"
                          style={{ animationDelay: "0.5s" }}
                        />
                        <div 
                          className="absolute inset-0 w-8 h-8 sm:w-10 sm:h-10 bg-red-500/20 rounded-full blur-xl animate-pulse"
                          style={{ animationDelay: "0.5s" }}
                        ></div>
                      </div>
                    </div>
                    
                    <div className="flex items-center justify-center space-x-3 mb-8">
                      <Sparkles className="w-5 h-5 text-red-400 animate-pulse" />
                      <span className="text-sm sm:text-base text-gray-400 font-medium italic tracking-wide">
                        Your brightest guide to RMIT
                      </span>
                      <Sparkles className="w-5 h-5 text-red-400 animate-pulse" />
                    </div>
                  </div>

                  <div className="max-w-3xl mx-auto mb-12">
                    <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-100 mb-6 leading-tight">
                      How can I help you today?
                    </h2>
                    <p className="text-gray-400 text-base sm:text-lg leading-relaxed max-w-2xl mx-auto">
                      Named after the brightest navigation star, I&apos;m here to guide you through courses, 
                      policies, services, and everything about your university experience at RMIT.
                    </p>
                  </div>

                  <div className="w-full max-w-4xl mx-auto">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
                      {suggestions.map((suggestion, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestionClick(suggestion)}
                          disabled={isLoading}
                          className="group p-4 sm:p-6 text-left border border-gray-700/50 bg-gray-800/50 backdrop-blur-sm rounded-2xl hover:bg-gray-700/50 hover:border-gray-600/50 transition-all duration-300 disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg hover:shadow-red-500/10"
                        >
                          <div className="flex items-start space-x-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-br from-red-500/20 to-orange-500/20 rounded-xl flex items-center justify-center group-hover:from-red-500/30 group-hover:to-orange-500/30 transition-colors duration-300">
                              <Sparkles className="w-5 h-5 text-red-400 group-hover:text-red-300 transition-colors duration-300" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h3 className="text-sm sm:text-base font-semibold text-gray-200 mb-2 group-hover:text-gray-100 transition-colors duration-300 line-clamp-2">
                                {suggestion.split("?")[0]}?
                              </h3>
                              <p className="text-xs sm:text-sm text-gray-500 group-hover:text-gray-400 transition-colors duration-300 line-clamp-2">
                                Click to ask this question
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Subtle bottom decoration */}
                  <div className="mt-16 flex items-center justify-center space-x-2 opacity-40">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <div className="w-1 h-1 bg-red-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
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