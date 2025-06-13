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
  Globe,
  Square,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { Sidebar } from "@/components/layout/Sidebar";
import { api } from "@/lib/trpc";
import { useRouter } from "next/navigation";

interface SerializedSearchResults {
  results: Array<{
    id: string;
    title: string;
    content: string;
    url: string;
    source: 'web' | 'knowledge_base' | 'rmit_official';
    relevanceScore: number;
    searchQuery: string;
    timestamp: string;
  }>;
  query: string;
  totalResults: number;
  searchTime: number;
  sources: {
    web: number;
    knowledge_base: number;
    rmit_official: number;
  };
}

interface Message {
  id: string;
  content: string;
  role: "USER" | "ASSISTANT";
  createdAt: Date;
  isTyping?: boolean;
  searchResults?: SerializedSearchResults | null;
  searchQuery?: string;
  imageUrl?: string | null;
  imageUrls?: string[];
}

interface ChatInterfaceProps {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
  sessionId?: string;
}

const suggestions = [
  "What are the entry requirements for RMIT's Computer Science degree?",
  "How do I access Canvas and other RMIT online systems?",
  "Tell me about RMIT's course enrollment deadlines",
  "What mental health and wellbeing services does RMIT offer?",
];

const compressImage = (base64: string, maxWidth: number = 800): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = base64;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;
      
      if (width > maxWidth) {
        height = Math.round((height * maxWidth) / width);
        width = maxWidth;
      }
      
      canvas.width = width;
      canvas.height = height;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Could not get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7)); 
    };
    img.onerror = () => reject(new Error('Failed to load image'));
  });
};

export function ChatInterface({ user, sessionId }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true); 
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [retryingMessageId, setRetryingMessageId] = useState<string | null>(null);
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(sessionId || null);
  const [hasRedirected, setHasRedirected] = useState(false);
  const [searchMode, setSearchMode] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [abortController, setAbortController] = useState<AbortController | null>(null);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [imagePreviews, setImagePreviews] = useState<string[]>([]);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

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

  const utils = api.useUtils();

  const scrollToBottom = useCallback((force = false) => {
    if (!autoScroll && !force) return;
    
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: 'smooth',
        block: 'end'
      });
    }
  }, [autoScroll]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 1024) {
        setSidebarCollapsed(false); 
      } else {
        setSidebarCollapsed(true); 
      }
    };
    
    handleResize(); 
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (sessionId && sessionId !== currentSessionId && currentSessionId !== null) {
      console.log('Clearing messages for session transition from', currentSessionId, 'to', sessionId);
      setMessages([]);
      setCurrentSessionId(sessionId || null);
    }
  }, [sessionId, currentSessionId]);

  useEffect(() => {
    if (sessionData && sessionId) {
      const hasMatchingMessages = messages.length > 0 && 
        messages[0] && sessionData.messages?.[0] && 
        messages[0].id === sessionData.messages[0].id;
        
      if (!hasMatchingMessages && sessionData.messages) {
        console.log('Loading session messages:', sessionData.messages.length, 'messages for session:', sessionData.id);
        const formattedMessages: Message[] = sessionData.messages.map(msg => ({
          id: msg.id,
          content: msg.content,
          role: msg.role,
          createdAt: new Date(msg.createdAt),
          imageUrl: msg.imageUrl,
          searchResults: null,
          searchQuery: undefined
        }));
        setMessages(formattedMessages);
        setCurrentSessionId(sessionData.id);
        
        setTimeout(() => {
          scrollToBottom(true);
        }, 100);
      }
    }
  }, [sessionData, scrollToBottom, messages, sessionId]);

  useEffect(() => {
    if (sessionError && sessionId && !hasRedirected) {
      console.error("Failed to load session:", sessionError);
      if (window.location.pathname !== '/chat') {
        setHasRedirected(true);
        router.replace("/chat");
      }
    }
  }, [sessionError, sessionId, router, hasRedirected]);

  useEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom();
    }, 100); 

    return () => clearTimeout(timer);
  }, [messages, isLoading, scrollToBottom]);

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

  useEffect(() => {
    if (!sessionLoading) {
      inputRef.current?.focus();
    }
  }, [sessionLoading]);

  const handleSendMessage = async (messageText?: string, imageUrl?: string) => {
    const textToSend = messageText || input;
    const imagesToSend = imageUrl ? [imageUrl] : uploadedImages;
    if ((!textToSend.trim() && imagesToSend.length === 0) || isLoading) return;

    const willSearch = searchMode;
    console.log('Sending message:', textToSend, 'Current session ID:', currentSessionId, 'Search mode:', willSearch);

    const userMessage: Message = {
      id: Date.now().toString(),
      content: textToSend || (imagesToSend.length > 1 ? `${imagesToSend.length} images uploaded` : "Image uploaded"),
      role: "USER",
      createdAt: new Date(),
      imageUrl: imagesToSend[0] || null,
      imageUrls: imagesToSend.length > 0 ? imagesToSend : undefined
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setUploadedImages([]);
    setImagePreviews([]);
    setIsLoading(true);
    setIsGenerating(true);
    setAutoScroll(true);
    
    // Create abort controller for this request
    const controller = new AbortController();
    setAbortController(controller);
    
    // Keep search mode on - user controls when to turn it off

    setTimeout(() => scrollToBottom(true), 50);

    try {
      // Always use the regular sendMessage endpoint - it supports both images and smart search decisions
      const response = await sendMessage({ 
        content: textToSend || "Please analyze this image", 
        sessionId: currentSessionId || undefined,
        imageUrl: imagesToSend[0] || undefined,
        enableSearch: willSearch  // Let orchestrator make intelligent decisions
      });

      // Check if request was aborted
      if (controller.signal.aborted) {
        console.log('Request was aborted');
        return;
      }

      console.log('Received response:', response);

      if (!currentSessionId) {
        console.log('Setting new session ID:', response.sessionId);
        setCurrentSessionId(response.sessionId);
      }

      await utils.chat.getSessions.invalidate();

      const messageByAI: Message = {
        id: (Date.now() + 1).toString(),
        content: response.message,
        role: "ASSISTANT",
        createdAt: new Date(),
        searchResults: willSearch && response.searchResults ? response.searchResults : null,
        searchQuery: willSearch ? textToSend : undefined,
        imageUrl: null
      };

      console.log('Adding AI message:', messageByAI);
      setMessages((prev) => [...prev, messageByAI]);
      
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {
      console.error("Error in chat:", error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "I apologize, but I encountered an error. Please try again.",
        role: "ASSISTANT",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      setIsGenerating(false);
      setAbortController(null);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleStopGeneration = () => {
    if (abortController) {
      console.log('Stopping AI generation...');
      abortController.abort();
      setIsGenerating(false);
      setIsLoading(false);
      setAbortController(null);
      
      // Add a message indicating the generation was stopped
      const stopMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Generation stopped by user.",
        role: "ASSISTANT",
        createdAt: new Date(),
      };
      setMessages((prev) => [...prev, stopMessage]);
    }
  };

  // Auto-focus input after sending message
  useEffect(() => {
    if (!isLoading && !sessionLoading && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isLoading, sessionLoading]);

  const handleSuggestionClick = (suggestion: string) => {
    setAutoScroll(true); 
    handleSendMessage(suggestion);
  };

  const copyMessage = async (content: string, messageId: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageId(messageId);
      setTimeout(() => setCopiedMessageId(null), 2000);
    } catch (err) {
      console.error('Failed to copy message:', err);
      const textArea = document.createElement('textarea');
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
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

    const messageIndex = messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return;

    const userMessage = messages[messageIndex - 1];
    if (!userMessage || userMessage.role !== "USER") return;

    setRetryingMessageId(messageId);
    setAutoScroll(true);

    setTimeout(() => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId));
      setIsLoading(true);
    }, 300);

    try {
      const response = await sendMessage({ 
        content: userMessage.content, 
        sessionId: currentSessionId || undefined 
      });

      await utils.chat.getSessions.invalidate();

      const newMessageByAI: Message = {
        id: Date.now().toString(),
        content: response.message,
        role: "ASSISTANT",
        createdAt: new Date(),
      };

      setMessages(prev => [...prev, newMessageByAI]);
      
      setTimeout(() => scrollToBottom(true), 100);
    } catch (error) {
      console.error("Error in retry:", error);
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
      .replace(/\[([^\]]+)\]\((https?:\/\/[^\s]+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline">$1</a>')
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        // Check if line is a standalone URL
        if (line.match(/^https?:\/\/[^\s]+$/)) {
          return `<p class="mb-2 last:mb-0"><a href="${line}" target="_blank" rel="noopener noreferrer" class="text-blue-400 hover:text-blue-300 underline break-all text-sm">${line}</a></p>`;
        }
        return `<p class="mb-2 last:mb-0">${line}</p>`;
      })
      .join("");
  };

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
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="fixed top-4 left-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
        >
          <PanelLeftOpen className="w-5 h-5" />
        </button>
      )}

      {!sidebarCollapsed && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-30 lg:hidden"
          onClick={() => setSidebarCollapsed(true)}
        />
      )}

      {!sidebarCollapsed && (
        <button
          onClick={() => setSidebarCollapsed(true)}
          className="fixed top-4 right-4 z-50 lg:hidden bg-gray-800 hover:bg-gray-700 text-white p-2 rounded-lg border border-gray-700"
        >
          <PanelLeftClose className="w-5 h-5" />
        </button>
      )}

      <div
        className={`flex-1 flex flex-col transition-all duration-300 bg-gray-900 h-screen ${
          sidebarCollapsed ? "lg:ml-12" : "lg:ml-64"
        } ml-0 ${!sidebarCollapsed ? 'hidden lg:flex' : 'flex'}`}
      >
        <div className="flex-1 relative bg-gray-900 overflow-hidden min-h-0">
          <ScrollArea className="h-full bg-gray-900" ref={scrollAreaRef}>
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 bg-gray-900 pb-4 min-h-full flex flex-col">

              
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center flex-1 text-center px-4 py-8">
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

                  <div className="mt-16 flex items-center justify-center space-x-2 opacity-40">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                    <div className="w-1 h-1 bg-red-400 rounded-full animate-pulse" style={{ animationDelay: "0.2s" }}></div>
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" style={{ animationDelay: "0.4s" }}></div>
                  </div>
                </div>
              ) : (
                <div className="py-4 sm:py-6 space-y-6 sm:space-y-8 bg-gray-900 flex-1">
                  {messages.map((message, index) => (
                    <div 
                      key={message.id} 
                      className="group animate-in fade-in-0 slide-in-from-bottom-4 duration-500"
                      style={{ animationDelay: `${index * 50}ms` }}
                    >
                      <div className="flex space-x-3 sm:space-x-4">
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

                          {(message.imageUrls || (message.imageUrl ? [message.imageUrl] : [])).length > 0 && (
                            <div className="mb-2">
                              <div className="flex flex-wrap gap-2">
                                {(message.imageUrls || [message.imageUrl!]).map((url, index) => (
                                  url && (
                                    <div key={index} className="relative">
                                      {/* eslint-disable-next-line @next/next/no-img-element */}
                                      <img 
                                        src={url} 
                                        alt={`Uploaded content ${index + 1}`}
                                        className="max-w-sm max-h-64 rounded-lg shadow-lg border border-gray-700 object-cover"
                                      />
                                    </div>
                                  )
                                ))}
                              </div>
                            </div>
                          )}

                          <div
                            className="prose prose-sm max-w-none text-gray-400 prose-strong:text-gray-300 text-sm sm:text-base leading-relaxed selection:bg-blue-500 selection:text-white"
                            dangerouslySetInnerHTML={{
                              __html: formatMessage(message.content),
                            }}
                          />

                          {/* Subtle Search References - Only show if search was actually used and contributed */}
                          {message.role === "ASSISTANT" && message.searchResults && message.searchResults.totalResults > 0 && (
                            <details className="mt-3 group">
                              <summary className="cursor-pointer text-xs text-gray-500 hover:text-gray-400 flex items-center space-x-1">
                                <Globe className="w-3 h-3" />
                                <span>Sources ({message.searchResults.totalResults} found)</span>
                                <svg className="w-3 h-3 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </summary>
                              
                              <div className="mt-2 space-y-1 max-h-96 overflow-y-auto">
                                {message.searchResults.results.map((result) => (
                                  <div key={result.id} className="text-xs border border-gray-700/20 rounded p-2 bg-gray-800/20">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1 min-w-0">
                                        <div className="font-medium text-gray-300 mb-1">
                                          {result.title}
                                        </div>
                                        <div className="text-gray-500 line-clamp-2 text-xs mb-2">
                                          {result.content.slice(0, 120)}...
                                        </div>
                                        {result.url && result.url !== '' && !result.url.startsWith('#') && (
                                          <a
                                            href={result.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="text-blue-400 hover:text-blue-300 underline break-all text-xs"
                                            title={result.url}
                                          >
                                            {result.url}
                                          </a>
                                        )}
                                      </div>
                                      {result.url && result.url !== '' && !result.url.startsWith('#') && (
                                        <a
                                          href={result.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="ml-2 text-blue-400 hover:text-blue-300 flex-shrink-0"
                                          title="Open in new tab"
                                        >
                                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                          </svg>
                                        </a>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </details>
                          )}

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

                  <div ref={messagesEndRef} className="h-4" />
                </div>
              )}
            </div>
          </ScrollArea>

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

        <div className="flex-shrink-0 border-t border-gray-700 bg-gray-900 p-3 sm:p-4 relative z-20">
          <div className="max-w-4xl mx-auto">
            {/* Image Previews */}
            {imagePreviews.length > 0 && (
              <div className="mb-3 p-3 bg-gray-800 rounded-lg border border-gray-700">
                <div className="flex items-start space-x-3">
                  <div className="flex space-x-2 flex-wrap">
                    {imagePreviews.map((preview, index) => (
                      <div key={index} className="relative">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img 
                          src={preview} 
                          alt={`Preview ${index + 1}`} 
                          className="w-16 h-16 sm:w-20 sm:h-20 object-cover rounded-lg border border-gray-600"
                        />
                        <Button
                          onClick={() => {
                            setUploadedImages(prev => prev.filter((_, i) => i !== index));
                            setImagePreviews(prev => prev.filter((_, i) => i !== index));
                          }}
                          variant="ghost"
                          size="sm"
                          className="absolute -top-2 -right-2 w-6 h-6 p-0 text-gray-400 hover:text-gray-200 bg-gray-900 hover:bg-gray-700 rounded-full border border-gray-600"
                          title="Remove image"
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-300">
                          {imagePreviews.length === 1 ? 'Image ready to send' : `${imagePreviews.length} images ready to send`}
                        </p>
                        <p className="text-xs text-gray-500">Add a message or send as-is</p>
                      </div>
                      <Button
                        onClick={() => {
                          setUploadedImages([]);
                          setImagePreviews([]);
                        }}
                        variant="ghost"
                        size="sm"
                        className="w-8 h-8 p-0 text-gray-400 hover:text-gray-200 hover:bg-gray-700 rounded-full"
                        title="Remove all images"
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <div className="relative flex">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder={isLoading ? "Vega is thinking..." : "Message Vega..."}
                className="pr-32 py-3 sm:py-4 resize-none border-gray-600 bg-gray-750 text-gray-100 placeholder:text-gray-400 focus:border-red-500 focus:ring-red-500/30 focus:ring-2 rounded-xl text-sm sm:text-base transition-all duration-200 w-full min-h-[52px] shadow-lg"
                style={{ backgroundColor: '#374151' }}
                disabled={isLoading}
                autoComplete="off"
                spellCheck="false"
              />
              <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center space-x-1">
                {/* Search Mode Toggle */}
                <Button
                  onClick={() => setSearchMode(!searchMode)}
                  size="sm"
                  variant={searchMode ? "default" : "ghost"}
                  className={`w-8 h-8 sm:w-9 sm:h-9 p-0 transition-all duration-200 hover:scale-105 rounded-lg shadow-sm ${
                    searchMode 
                      ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white'
                  }`}
                  title={searchMode ? "Search mode enabled" : "Enable search mode"}
                >
                  <Globe className={`w-3 h-3 sm:w-4 sm:h-4 ${searchMode ? 'text-white' : ''}`} />
                </Button>
                
                {/* Image Upload Button */}
                <div className="relative">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      const input = document.getElementById('image-upload-input') as HTMLInputElement;
                      input?.click();
                    }}
                    className={`w-8 h-8 sm:w-9 sm:h-9 p-0 transition-all duration-200 hover:scale-105 rounded-lg ${
                      uploadedImages.length > 0 
                        ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                        : 'bg-gray-700 hover:bg-gray-600 text-gray-400 hover:text-white'
                    }`}
                    title={uploadedImages.length > 0 ? `${uploadedImages.length} image${uploadedImages.length > 1 ? 's' : ''} ready` : "Upload image"}
                    disabled={uploadedImages.length >= 3}
                  >
                    <ImageIcon className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                  <input 
                    id="image-upload-input"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      
                      // Check if we already have 3 images
                      if (uploadedImages.length >= 3) {
                        console.warn('Maximum 3 images allowed');
                        return;
                      }

                      try {
                        const reader = new FileReader();
                        reader.onload = async () => {
                          const base64 = reader.result as string;
                          try {
                            const compressedImage = await compressImage(base64);
                            setUploadedImages(prev => [...prev, compressedImage]);
                            setImagePreviews(prev => [...prev, compressedImage]);
                          } catch (error) {
                            console.error('Failed to compress image:', error);
                          }
                        };
                        reader.readAsDataURL(file);
                        e.target.value = "";
                      } catch (error) {
                        console.error('Failed to read file:', error);
                      }
                    }}
                  />
                </div>
                
                {/* Send/Stop Button */}
                {isGenerating ? (
                  <Button
                    onClick={handleStopGeneration}
                    size="sm"
                    className="bg-orange-600 hover:bg-orange-700 text-white w-8 h-8 sm:w-9 sm:h-9 p-0 transition-all duration-200 hover:scale-105 rounded-lg shadow-lg"
                    title="Stop generation"
                  >
                    <Square className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                ) : (
                  <Button
                    onClick={() => handleSendMessage()}
                    disabled={(!input.trim() && uploadedImages.length === 0) || isLoading}
                    size="sm"
                    className="bg-red-600 hover:bg-red-700 disabled:bg-gray-700 disabled:text-gray-500 text-white w-8 h-8 sm:w-9 sm:h-9 p-0 transition-all duration-200 hover:scale-105 disabled:hover:scale-100 rounded-lg shadow-lg"
                    title="Send message"
                  >
                    <Send className="w-3 h-3 sm:w-4 sm:h-4" />
                  </Button>
                )}
              </div>
            </div>

            <div className="text-xs text-gray-500 text-center mt-3 px-2">
              <span>Toggle </span>
              <span className="text-blue-400">🌐 search mode</span>
              <span> for current information</span>
              {searchMode && (
                <span className="text-blue-400 ml-2">• Search mode active</span>
              )}
              {uploadedImages.length > 0 && (
                <span className="text-green-400 ml-2">• {uploadedImages.length} image{uploadedImages.length > 1 ? 's' : ''} ready to send</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}