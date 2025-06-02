// src/components/chat/ChatInterface.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Send,
  Copy,
  RotateCcw,
  ThumbsUp,
  ThumbsDown,
  MoreHorizontal,
  Star,
  Sparkles,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollElement = scrollAreaRef.current.querySelector(
        "[data-radix-scroll-area-viewport]"
      );
      if (scrollElement) {
        scrollElement.scrollTop = scrollElement.scrollHeight;
      }
    }
  }, [messages]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const ClaudeStreaming = async (
    message: string,
    onChunk: (text: string) => void
  ): Promise<string> => {
    const response = await fetch("/api/streamingAI", {
      method: "POST",
      body: JSON.stringify({ message }),
      headers: { "Content-Type": "application/json" },
    });

    if (!response.body) throw new Error("No response stream");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      fullText += chunk;
      onChunk(chunk);
    }

    return fullText;
  };

  // const { mutateAsync } = api.chat.sendMessage.useMutation()
  const { mutateAsync: getAIResponse } = api.knowledgeBase.getAIResponse.useMutation()



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

    const realTimeMessage: Message = {
      id: "streaming",
      content: "",
      role: "ASSISTANT",
      createdAt: new Date(),
      isTyping: true,
    };

    setMessages((prev) => [...prev, realTimeMessage]);

    try {
      // First, send the message to save in the database
      const responseByAI = await getAIResponse({ query: textToSend })
      const fullResponse = responseByAI.answer

      // Then start streaming the response
      // const fullResponse = await ClaudeStreaming(textToSend, (chunk) => {
      //   setMessages((prev) =>
      //     prev.map((msg) =>
      //       msg.id === "streaming"
      //         ? { ...msg, content: msg.content + chunk }
      //         : msg
      //     )
      //   );
      // });

      const messageByAI: Message = {
        id: (Date.now() + 1).toString(),
        content: fullResponse,
        role: "ASSISTANT",
        createdAt: new Date(),
      };

      setMessages((prev) => [
        ...prev.filter((message) => message.id != "streaming"),
        messageByAI,
      ]);
    } catch (error) {
      console.error("Error in chat:", error);
      // Show error message to user
      setMessages((prev) => [
        ...prev.filter((message) => message.id != "streaming"),
        {
          id: (Date.now() + 1).toString(),
          content: "I apologize, but I encountered an error. Please try again.",
          role: "ASSISTANT",
          createdAt: new Date(),
        },
      ]);
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
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => `<p class="mb-2 last:mb-0">${line}</p>`)
      .join("");
  };

  return (
    <div className="h-screen flex bg-gray-900">
      {/* Sidebar with corrected props */}
      <Sidebar
        user={user}
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Chat Area */}
      <div
        className={`flex-1 flex flex-col transition-all duration-300 ${
          sidebarCollapsed ? "ml-12" : "ml-64"
        }`}
      >
        {/* Chat Messages */}
        <div className="flex-1 relative">
          <ScrollArea className="h-full" ref={scrollAreaRef}>
            <div className="max-w-3xl mx-auto px-4">
              {messages.length === 0 ? (
                /* Welcome Screen */
                <div className="flex flex-col items-center justify-center min-h-[80vh] text-center">
                  {/* Aesthetic Vega Branding */}
                  <div className="mb-8">
                    <div className="flex items-center justify-center space-x-3 mb-6">
                      <Star className="w-8 h-8 text-red-500 fill-current animate-pulse" />
                      <h1 className="text-5xl font-bold bg-gradient-to-r from-red-500 via-red-400 to-orange-400 bg-clip-text text-transparent">
                        Vega
                      </h1>
                      <Star
                        className="w-8 h-8 text-red-500 fill-current animate-pulse"
                        style={{ animationDelay: "0.5s" }}
                      />
                    </div>
                    <div className="flex items-center justify-center space-x-2 text-sm text-gray-500 mb-4">
                      <Sparkles className="w-4 h-4 text-red-400" />
                      <span className="italic font-medium">
                        Your brightest guide to RMIT
                      </span>
                      <Sparkles className="w-4 h-4 text-red-400" />
                    </div>
                  </div>

                  <h2 className="text-2xl font-semibold text-gray-200 mb-3">
                    How can I help you today?
                  </h2>
                  <p className="text-gray-500 mb-8 max-w-md leading-relaxed">
                    Named after the brightest navigation star, I&apos;m here to
                    guide you through courses, policies, services, and
                    everything about your university experience.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full max-w-2xl">
                    {suggestions.map((suggestion, index) => (
                      <button
                        key={index}
                        onClick={() => handleSuggestionClick(suggestion)}
                        className="p-4 text-left border border-gray-700 bg-gray-800 rounded-xl hover:bg-gray-700 hover:border-gray-600 transition-colors group"
                      >
                        <div className="text-sm font-medium text-gray-300 mb-1 group-hover:text-gray-200 transition-colors">
                          {suggestion.split(" ").slice(0, 4).join(" ")}...
                        </div>
                        <div className="text-xs text-gray-500">
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
                            <div className="w-8 h-8 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center">
                              <Star className="w-4 h-4 text-red-500 fill-current" />
                            </div>
                          ) : (
                            <Avatar className="w-8 h-8">
                              <AvatarImage
                                src={user.picture || ""}
                                alt="User avatar"
                              />
                              <AvatarFallback className="bg-gray-700 text-white text-sm">
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
                            <span className="text-sm font-semibold text-gray-300">
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
                            className="prose prose-sm max-w-none text-gray-400 prose-strong:text-gray-300"
                            dangerouslySetInnerHTML={{
                              __html: formatMessage(message.content),
                            }}
                          />

                          {/* Action Buttons */}
                          {message.role === "ASSISTANT" && (
                            <div className="flex items-center space-x-2 mt-3 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyMessage(message.content)}
                                className="h-8 px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800"
                              >
                                <Copy className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800"
                              >
                                <RotateCcw className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800"
                              >
                                <ThumbsUp className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800"
                              >
                                <ThumbsDown className="w-3 h-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 px-2 text-gray-600 hover:text-gray-400 hover:bg-gray-800"
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
                        <div className="w-8 h-8 bg-gray-700 border border-gray-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <Star className="w-4 h-4 text-red-500 fill-current" />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center space-x-2 mb-2">
                            <span className="text-sm font-semibold text-gray-300">
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
                </div>
              )}
            </div>
          </ScrollArea>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-800 bg-gray-900 p-4">
          <div className="max-w-3xl mx-auto">
            <div className="relative">
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Message Vega..."
                className="pr-12 py-3 resize-none border-gray-700 bg-gray-800 text-gray-300 placeholder:text-gray-600 focus:border-gray-600 focus:ring-gray-600 rounded-xl"
                disabled={isLoading}
              />
              <Button
                onClick={() => handleSendMessage()}
                disabled={!input.trim() || isLoading}
                size="sm"
                className="absolute right-2 top-1/2 transform -translate-y-1/2 bg-gray-700 hover:bg-gray-600 text-white w-8 h-8 p-0 disabled:bg-gray-800 disabled:text-gray-600"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>

            <div className="text-xs text-gray-600 text-center mt-2">
              Vega can make mistakes. Consider checking important information.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
