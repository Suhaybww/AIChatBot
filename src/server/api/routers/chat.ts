import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { sendClaudeWithContext, sendClaudeWithSearch } from "@/lib/ai";
import { contextManager } from "@/lib/context";
import { searchEngine } from "@/lib/search";
import { v4 as uuidv4 } from "uuid";
import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";

// Input validation schemas
const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000), // Add max length for safety
  sessionId: z.string().uuid().optional(),
});

const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const updateSessionTitleSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().min(1).max(100),
});

export const chatRouter = createTRPCRouter({
  // Send a message and get AI response
  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        let sessionId = input.sessionId;
        let isNewSession = false;

        // PHASE 1: Save user message and create session (quick transaction)
        const sessionInfo = await ctx.db.$transaction(async (tx) => {
          if (!sessionId) {
            const newSession = await tx.chatSession.create({
              data: {
                id: uuidv4(),
                userId,
                title: input.content.slice(0, 50) + (input.content.length > 50 ? "..." : ""),
              },
            });
            sessionId = newSession.id;
            isNewSession = true;
          } else {
            const session = await tx.chatSession.findFirst({
              where: { id: sessionId, userId },
            });
            if (!session) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Session not found or access denied",
              });
            }
          }

          // Save user message
          await tx.message.create({
            data: {
              sessionId: sessionId!,
              role: Role.USER,
              content: input.content,
            },
          });

          // Update session timestamp
          await tx.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });

          return { sessionId, isNewSession };
        });

        // PHASE 2: Generate AI response with context (outside transaction)
        const aiResponse = await sendClaudeWithContext(
          input.content,
          sessionInfo.sessionId,
          userId
        );

        if (!aiResponse) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate AI response",
          });
        }

        // PHASE 3: Save AI response (quick transaction)
        const result = await ctx.db.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: {
              sessionId: sessionInfo.sessionId,
              role: Role.ASSISTANT,
              content: aiResponse,
            },
          });

          // Update session timestamp again
          await tx.chatSession.update({
            where: { id: sessionInfo.sessionId },
            data: { updatedAt: new Date() },
          });

          return {
            message: aiResponse,
            sessionId: sessionInfo.sessionId,
            isNewSession: sessionInfo.isNewSession,
            messageId: assistantMessage.id,
          };
        });

        return result;
      } catch (error) {
        console.error("Error in sendMessage:", error);
        
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process message",
        });
      }
    }),

  // Get all chat sessions for the user
  getSessions: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const sessions = await ctx.db.chatSession.findMany({
          where: { userId: ctx.user.id },
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            _count: {
              select: { messages: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 50, // Limit to recent 50 sessions for performance
        });

        return sessions.map(session => ({
          ...session,
          messageCount: session._count.messages,
          _count: undefined,
        }));
      } catch (error) {
        console.error("Error fetching sessions:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch chat sessions",
        });
      }
    }),

  // Get a specific session with messages
  getSession: protectedProcedure
    .input(sessionIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        const session = await ctx.db.chatSession.findFirst({
          where: {
            id: input.sessionId,
            userId: ctx.user.id,
          },
          include: {
            messages: {
              orderBy: { createdAt: "asc" },
              select: {
                id: true,
                content: true,
                role: true,
                createdAt: true,
              },
            },
          },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found or you don't have permission to access it",
          });
        }

        return session;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error("Error fetching session:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch session",
        });
      }
    }),

  // Check if user has access to a session (lightweight check)
  checkSessionAccess: protectedProcedure
    .input(sessionIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        const session = await ctx.db.chatSession.findFirst({
          where: {
            id: input.sessionId,
            userId: ctx.user.id,
          },
          select: {
            id: true,
            title: true,
          },
        });

        return {
          hasAccess: !!session,
          session: session || null,
        };
      } catch (error) {
        console.error("Error checking session access:", error);
        return {
          hasAccess: false,
          session: null,
        };
      }
    }),

  // Update session title
  updateSessionTitle: protectedProcedure
    .input(updateSessionTitleSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const session = await ctx.db.chatSession.update({
          where: {
            id: input.sessionId,
            userId: ctx.user.id,
          },
          data: {
            title: input.title,
            updatedAt: new Date(),
          },
        });

        return { success: true, session };
      } catch (error) {
        console.error("Error updating session title:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update session title",
        });
      }
    }),

  // Delete a specific session
  deleteSession: protectedProcedure
    .input(sessionIdSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        // Use transaction to ensure both messages and session are deleted
        await ctx.db.$transaction(async (tx) => {
          // Verify ownership
          const session = await tx.chatSession.findFirst({
            where: {
              id: input.sessionId,
              userId: ctx.user.id,
            },
          });

          if (!session) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Session not found",
            });
          }

          // Delete messages first (due to foreign key constraint)
          await tx.message.deleteMany({
            where: { sessionId: input.sessionId },
          });

          // Delete session
          await tx.chatSession.delete({
            where: { id: input.sessionId },
          });
        });

        return { success: true, deletedSessionId: input.sessionId };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }

        console.error("Error deleting session:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete session",
        });
      }
    }),

  // Clear all sessions for the user
  clearAllSessions: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const userId = ctx.user.id;

        // Use transaction for consistency
        const result = await ctx.db.$transaction(async (tx) => {
          // Get count before deletion for feedback
          const sessionCount = await tx.chatSession.count({
            where: { userId },
          });

          if (sessionCount === 0) {
            return { success: true, deletedCount: 0 };
          }

          // Delete all messages for user's sessions
          await tx.message.deleteMany({
            where: {
              session: { userId },
            },
          });

          // Delete all sessions
          await tx.chatSession.deleteMany({
            where: { userId },
          });

          return { success: true, deletedCount: sessionCount };
        });

        return result;
      } catch (error) {
        console.error("Error clearing sessions:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to clear chat history",
        });
      }
    }),

  // Get recent messages for continuation (useful for context)
  getRecentMessages: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const messages = await ctx.db.message.findMany({
          where: {
            sessionId: input.sessionId,
            session: {
              userId: ctx.user.id,
            },
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            content: true,
            role: true,
            createdAt: true,
          },
        });

        return messages.reverse(); // Return in chronological order
      } catch (error) {
        console.error("Error fetching recent messages:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch recent messages",
        });
      }
    }),

  // Get conversation context for a session
  getConversationContext: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      message: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const context = await contextManager.buildContext(
          input.sessionId,
          input.message || "",
          ctx.user.id
        );

        return {
          messageCount: context.recentMessages.length,
          topics: context.sessionTopics,
          entities: context.sessionEntities,
          relevantKnowledgeCount: context.relevantKnowledge.length,
          contextTokens: context.contextWindow.tokenCount,
          sessionSummary: context.sessionSummary,
        };
      } catch (error) {
        console.error("Error getting conversation context:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get conversation context",
        });
      }
    }),

  // Clean up old conversation data
  cleanupOldContext: protectedProcedure
    .input(z.object({
      daysOld: z.number().min(1).max(365).default(30),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        await contextManager.cleanupOldContext(ctx.user.id, input.daysOld);
        return { success: true, message: `Cleaned up conversations older than ${input.daysOld} days` };
      } catch (error) {
        console.error("Error cleaning up context:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cleanup old context",
        });
      }
    }),

  // Get user session statistics (simplified - no cross-session analysis)
  getUserInsights: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        // Get basic user session statistics
        const totalSessions = await ctx.db.chatSession.count({
          where: { userId: ctx.user.id },
        });

        const totalMessages = await ctx.db.message.count({
          where: {
            session: { userId: ctx.user.id },
          },
        });

        return {
          totalSessions,
          totalMessages,
          // Note: Topics and entities are now session-specific only
          note: "Context awareness is now limited to individual conversations",
        };
      } catch (error) {
        console.error("Error getting user insights:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get user insights",
        });
      }
    }),

  // Perform real-time search
  performSearch: protectedProcedure
    .input(z.object({
      query: z.string().min(1).max(500),
      includeWeb: z.boolean().default(true),
      includeKnowledgeBase: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      try {
        const searchResults = await searchEngine.performSearch(
          input.query,
          input.includeWeb,
          input.includeKnowledgeBase
        );

        return searchResults;
      } catch (error) {
        console.error("Error performing search:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to perform search",
        });
      }
    }),

  // Send message with forced search
  sendMessageWithSearch: protectedProcedure
    .input(z.object({
      content: z.string().min(1).max(4000),
      sessionId: z.string().uuid().optional(),
      forceSearch: z.boolean().default(false),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        let sessionId = input.sessionId;

        // PHASE 1: Save user message and create session (quick transaction)
        const sessionInfo = await ctx.db.$transaction(async (tx) => {
          if (!sessionId) {
            const newSession = await tx.chatSession.create({
              data: {
                id: uuidv4(),
                userId,
                title: input.content.slice(0, 50) + (input.content.length > 50 ? "..." : ""),
              },
            });
            sessionId = newSession.id;
          } else {
            const session = await tx.chatSession.findFirst({
              where: { id: sessionId, userId },
            });
            if (!session) {
              throw new TRPCError({
                code: "FORBIDDEN",
                message: "Session not found or access denied",
              });
            }
          }

          // Save user message
          await tx.message.create({
            data: {
              sessionId: sessionId!,
              role: Role.USER,
              content: input.content,
            },
          });

          // Update session timestamp
          await tx.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });

          return { sessionId, isNewSession: !input.sessionId };
        });

        // PHASE 2: Generate AI response with search (outside transaction)
        let aiResponse: string;
        let searchResults = null;

        if (input.forceSearch) {
          const searchResponse = await sendClaudeWithSearch(
            input.content, 
            true, 
            sessionInfo.sessionId, 
            userId
          );
          aiResponse = searchResponse.response;
          searchResults = searchResponse.searchResults;
        } else {
          aiResponse = await sendClaudeWithContext(
            input.content,
            sessionInfo.sessionId,
            userId
          );
        }

        if (!aiResponse) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate AI response",
          });
        }

        // PHASE 3: Save AI response (quick transaction)
        const result = await ctx.db.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: {
              sessionId: sessionInfo.sessionId,
              role: Role.ASSISTANT,
              content: aiResponse,
            },
          });

          // Update session timestamp again
          await tx.chatSession.update({
            where: { id: sessionInfo.sessionId },
            data: { updatedAt: new Date() },
          });

          return {
            message: aiResponse,
            sessionId: sessionInfo.sessionId,
            isNewSession: sessionInfo.isNewSession,
            messageId: assistantMessage.id,
            searchResults,
          };
        });

        return result;
      } catch (error) {
        console.error("Error in sendMessageWithSearch:", error);
        
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process message",
        });
      }
    }),
});