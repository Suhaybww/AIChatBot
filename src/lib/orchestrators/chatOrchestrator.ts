import { AIOrchestrator } from "./aiOrchestrator";
import { db } from "@/server/db/db";
import { Role } from "@prisma/client";
import type { SearchResponse } from "../services/search.service";

export interface ChatMessage {
  id: string;
  content: string;
  role: Role;
  sessionId: string;
  createdAt: Date;
}

export interface ChatSession {
  id: string;
  userId: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChatResponse {
  message: ChatMessage;
  searchResults?: SearchResponse | null;
  contextUsed?: boolean;
}

export class ChatOrchestrator {
  private aiOrchestrator: AIOrchestrator;

  constructor() {
    this.aiOrchestrator = new AIOrchestrator();
  }

  /**
   * Process a complete chat interaction
   */
  async processChat(
    userMessage: string,
    sessionId: string,
    userId: string,
    forceSearch: boolean = false
  ): Promise<ChatResponse> {
    // Save user message to database
    await db.message.create({
      data: {
        content: userMessage,
        role: Role.USER,
        sessionId
      }
    });

    // Generate AI response using orchestrator
    const aiResponse = await this.aiOrchestrator.generateResponse(userMessage, {
      forceSearch,
      includeContext: true,
      sessionId,
      userId
    });

    // Save AI response to database
    const aiDbMessage = await db.message.create({
      data: {
        content: aiResponse.response,
        role: Role.ASSISTANT,
        sessionId
      }
    });

    // Update session timestamp
    await this.updateSessionTimestamp(sessionId);

    return {
      message: aiDbMessage,
      searchResults: aiResponse.searchResults,
      contextUsed: aiResponse.contextUsed
    };
  }

  /**
   * Create a new chat session
   */
  async createSession(userId: string, title?: string): Promise<ChatSession> {
    return await db.chatSession.create({
      data: {
        userId,
        title: title || `Chat ${new Date().toLocaleDateString()}`
      }
    });
  }

  /**
   * Get user's chat sessions
   */
  async getUserSessions(userId: string, limit: number = 20): Promise<ChatSession[]> {
    return await db.chatSession.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      take: limit
    });
  }

  /**
   * Get messages for a session
   */
  async getSessionMessages(
    sessionId: string, 
    limit: number = 50
  ): Promise<ChatMessage[]> {
    return await db.message.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'asc' },
      take: limit
    });
  }

  /**
   * Delete a chat session and all its messages
   */
  async deleteSession(sessionId: string, userId: string): Promise<void> {
    // Verify ownership
    const session = await db.chatSession.findFirst({
      where: { id: sessionId, userId }
    });

    if (!session) {
      throw new Error('Session not found or access denied');
    }

    // Delete messages first (due to foreign key constraints)
    await db.message.deleteMany({
      where: { sessionId }
    });

    // Delete session
    await db.chatSession.delete({
      where: { id: sessionId }
    });
  }

  /**
   * Update session title
   */
  async updateSessionTitle(
    sessionId: string, 
    userId: string, 
    title: string
  ): Promise<ChatSession> {
    const session = await db.chatSession.findFirst({
      where: { id: sessionId, userId }
    });
    
    if (!session) {
      throw new Error('Session not found or access denied');
    }

    return await db.chatSession.update({
      where: { id: sessionId },
      data: { title }
    });
  }

  /**
   * Get session by ID with ownership check
   */
  async getSession(sessionId: string, userId: string): Promise<ChatSession | null> {
    return await db.chatSession.findFirst({
      where: { id: sessionId, userId }
    });
  }

  /**
   * Update session timestamp
   */
  private async updateSessionTimestamp(sessionId: string): Promise<void> {
    await db.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() }
    });
  }

  /**
   * Generate session title from first message
   */
  async generateSessionTitle(sessionId: string): Promise<string> {
    const firstMessage = await db.message.findFirst({
      where: { 
        sessionId,
        role: Role.USER
      },
      orderBy: { createdAt: 'asc' }
    });

    if (!firstMessage) {
      return `Chat ${new Date().toLocaleDateString()}`;
    }

    // Extract meaningful title from first message
    const content = firstMessage.content;
    let title = content.slice(0, 50);
    
    // Try to find a sentence ending
    const sentenceEnd = title.match(/[.!?]/);
    if (sentenceEnd && sentenceEnd.index && sentenceEnd.index > 20) {
      title = title.slice(0, sentenceEnd.index);
    }
    
    // Clean up and add ellipsis if truncated
    title = title.trim();
    if (content.length > title.length) {
      title += '...';
    }

    return title;
  }

  /**
   * Clean up old sessions and context
   */
  async cleanupOldData(userId: string, daysOld: number = 30): Promise<void> {
    await this.aiOrchestrator.cleanupContext(userId, daysOld);
  }
}

// Export singleton instance
export const chatOrchestrator = new ChatOrchestrator();