import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc/trpc";
import { z } from "zod";
import { aiOrchestrator } from "@/lib/orchestrators";
import { SearchService } from "@/lib/services";
import { v4 as uuidv4 } from "uuid";
import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";

// Input validation schemas - merged version with both search and image support
const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  enableSearch: z.boolean().optional().default(true), // Enable smart search by default
  imageUrl: z.string().optional() // Support image uploads
});

const sendMessageWithSearchSchema = z.object({
  content: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  forceSearch: z.boolean().default(false),
  searchOptions: z.object({
    includeWeb: z.boolean().default(true),
    includeKnowledgeBase: z.boolean().default(true),
  }).optional(),
});

const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const updateSessionTitleSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().min(1).max(100),
});

const searchQuerySchema = z.object({
  query: z.string().min(1).max(500),
  includeWeb: z.boolean().default(true),
  includeKnowledgeBase: z.boolean().default(true),
});

export const chatRouter = createTRPCRouter({
  // Send a message and get AI response with smart search and image support
  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        let sessionId = input.sessionId;
        let isNewSession = false;

        // Validate image if provided
        if(input.imageUrl) {
          const isBase64 = /^data:image\/(png|jpeg|jpg|gif);base64,/.test(input.imageUrl);
          const isUrl = input.imageUrl.startsWith("http");

          if(!isBase64 && !isUrl) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Unsupported Image Format"
            });
          }

          if (isBase64 && input.imageUrl.length > 1000000) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Image is too large. Please use a smaller image."
            });
          }
        }

        // PHASE 1: Save user message and create/update session
        const sessionInfo = await ctx.db.$transaction(async (tx) => {
          if (!sessionId) {
            // Create new session with a descriptive title
            const sessionTitle = input.content.length > 50 
              ? input.content.slice(0, 47) + "..." 
              : input.content;
              
            const newSession = await tx.chatSession.create({
              data: {
                id: uuidv4(),
                userId,
                title: sessionTitle,
              },
            });
            sessionId = newSession.id;
            isNewSession = true;
          } else {
            // Verify session ownership
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
              imageUrl: input.imageUrl || null
            },
          });

          // Update session timestamp
          await tx.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });

          return { sessionId, isNewSession };
        }, {
          timeout: 10000, 
          maxWait: 5000, 
        });

        // PHASE 2: Generate AI response
        console.log(`🤖 Processing message for session ${sessionInfo.sessionId}`);
        
        let aiResponse;
        if (input.imageUrl) {
          // Handle image analysis using modular orchestrator
          aiResponse = await aiOrchestrator.processImageWithAI(
            input.content,
            input.imageUrl,
            {
              maxTokens: 1000,
              temperature: 0.7
            }
          );
        } else {
          // Use orchestrator for text-only messages with search capabilities
          aiResponse = await aiOrchestrator.generateResponse(input.content, {
            allowAutoSearch: input.enableSearch,
            includeContext: true,
            sessionId: sessionInfo.sessionId,
            userId,
            maxTokens: 1000,
            temperature: 0.7
          });

          if (!aiResponse.response) {
            // Try fallback response
            const fallbackResponse = await aiOrchestrator.generateFallbackResponse(input.content);
            aiResponse.response = fallbackResponse.response;
          }
        }

        // PHASE 3: Save AI response and prepare result
        const result = await ctx.db.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: {
              sessionId: sessionInfo.sessionId,
              role: Role.ASSISTANT,
              content: aiResponse.response,
              imageUrl: null
            },
          });

          // Update session timestamp
          await tx.chatSession.update({
            where: { id: sessionInfo.sessionId },
            data: { updatedAt: new Date() },
          });

          return {
            message: aiResponse.response,
            sessionId: sessionInfo.sessionId,
            isNewSession: sessionInfo.isNewSession,
            messageId: assistantMessage.id,
            searchResults: aiResponse.searchResults,
            searchPerformed: aiResponse.searchPerformed,
            responseMetadata: aiResponse.responseMetadata,
          };
        }, {
          timeout: 10000, 
          maxWait: 5000,  
        });

        console.log(`✅ Response generated with${result.searchPerformed ? '' : 'out'} search`);
        return result;
        
      } catch (error) {
        console.error("Error in sendMessage:", error);
        
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process message. Please try again.",
        });
      }
    }),

  // Send message with explicit search control
  sendMessageWithSearch: protectedProcedure
    .input(sendMessageWithSearchSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        let sessionId = input.sessionId;

        // PHASE 1: Save user message
        console.log(`💾 Saving user message for session ${sessionId || 'new'}`);
        
        const sessionInfo = await ctx.db.$transaction(async (tx) => {
          if (!sessionId) {
            const newSession = await tx.chatSession.create({
              data: {
                id: uuidv4(),
                userId,
                title: `Search: ${input.content.slice(0, 50)}${input.content.length > 50 ? '...' : ''}`,
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

          await tx.message.create({
            data: {
              sessionId: sessionId!,
              role: Role.USER,
              content: input.content,
            },
          });

          await tx.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });

          return { sessionId, isNewSession: !input.sessionId };
        }, {
          timeout: 10000,
        });

        // PHASE 2: Generate AI response with search
        console.log(`🔍 Starting search-enabled response generation for session ${sessionInfo.sessionId}`);
        
        let aiResponse;
        try {
          aiResponse = await Promise.race([
            aiOrchestrator.generateResponse(input.content, {
              forceSearch: input.forceSearch,
              allowAutoSearch: true,
              includeContext: true,
              sessionId: sessionInfo.sessionId,
              userId,
              searchOptions: input.searchOptions
            }),
            new Promise((_, reject) => 
              setTimeout(() => reject(new Error('AI response timeout')), 45000)
            )
          ]) as Awaited<ReturnType<typeof aiOrchestrator.generateResponse>>;

          if (!aiResponse.response) {
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Failed to generate response",
            });
          }
        } catch (error) {
          console.error("AI response generation failed:", error);
          
          // Generate fallback response
          try {
            console.log('🔄 Attempting fallback response...');
            aiResponse = await aiOrchestrator.generateFallbackResponse(input.content);
          } catch (fallbackError) {
            console.error("Fallback response also failed:", fallbackError);
            throw new TRPCError({
              code: "INTERNAL_SERVER_ERROR",
              message: "Search request timed out. Please try a simpler query or try again later.",
            });
          }
        }

        // PHASE 3: Save response
        console.log(`💾 Saving AI response to session ${sessionInfo.sessionId}`);
        
        const result = await ctx.db.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: {
              sessionId: sessionInfo.sessionId,
              role: Role.ASSISTANT,
              content: aiResponse.response,
            },
          });

          await tx.chatSession.update({
            where: { id: sessionInfo.sessionId },
            data: { updatedAt: new Date() },
          });

          return {
            message: aiResponse.response,
            sessionId: sessionInfo.sessionId,
            isNewSession: sessionInfo.isNewSession,
            messageId: assistantMessage.id,
            searchResults: aiResponse.searchResults,
            searchPerformed: true,
            responseMetadata: aiResponse.responseMetadata,
          };
        }, {
          timeout: 10000,
        });

        return result;
        
      } catch (error) {
        console.error("Error in sendMessageWithSearch:", error);
        
        if (error instanceof TRPCError) throw error;
        
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to process message with search",
        });
      }
    }),

  // Perform standalone search
  performSearch: protectedProcedure
    .input(searchQuerySchema)
    .mutation(async ({ input }) => {
      try {
        console.log(`🔍 Performing standalone search: ${input.query}`);
        
        const searchService = new SearchService();
        const searchResults = await searchService.performSearch(
          input.query,
          input.includeWeb,
          input.includeKnowledgeBase
        );

        // Log search quality
        const highQualityResults = searchResults.results.filter(r => r.relevanceScore > 0.7).length;
        console.log(`✅ Search complete: ${searchResults.results.length} results (${highQualityResults} high quality)`);

        return {
          ...searchResults,
          searchQuality: highQualityResults >= 3 ? 'good' : highQualityResults >= 1 ? 'medium' : 'poor'
        };
        
      } catch (error) {
        console.error("Error performing search:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Search failed. Please try again.",
        });
      }
    }),

  // Get all chat sessions with enhanced metadata
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
            messages: {
              select: {
                id: true,
                role: true,
                content: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 2
            },
            _count: {
              select: { messages: true },
            },
          },
          orderBy: { updatedAt: "desc" },
          take: 50,
        });

        return sessions.map(session => {
          // Determine if session involved search
          const hasSearch = session.messages.some(m => 
            m.role === Role.ASSISTANT && m.content.includes('rmit.edu.au')
          );
          
          return {
            id: session.id,
            title: session.title,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            messageCount: session._count.messages,
            lastMessage: session.messages[0]?.content.slice(0, 100) || '',
            hasSearch,
          };
        });
        
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
                imageUrl: true
              },
            },
          },
        });

        if (!session) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Session not found",
          });
        }

        return session;
        
      } catch (error) {
        if (error instanceof TRPCError) throw error;
        
        console.error("Error fetching session:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch session",
        });
      }
    }),

  // Check session access
  checkSessionAccess: protectedProcedure
    .input(sessionIdSchema)
    .query(async ({ input, ctx }) => {
      try {
        const session = await ctx.db.chatSession.findFirst({
          where: {
            id: input.sessionId,
            userId: ctx.user.id,
          },
          select: { id: true, title: true },
        });

        return {
          hasAccess: !!session,
          session,
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
          data: { title: input.title },
        });

        return session;
      } catch (error) {
        console.error("Error updating session title:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update session title",
        });
      }
    }),

  // Delete session
  deleteSession: protectedProcedure
    .input(sessionIdSchema)
    .mutation(async ({ input, ctx }) => {
      try {
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

          // Delete messages first
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
        if (error instanceof TRPCError) throw error;
        
        console.error("Error deleting session:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete session",
        });
      }
    }),

  // Clear all sessions
  clearAllSessions: protectedProcedure
    .mutation(async ({ ctx }) => {
      try {
        const userId = ctx.user.id;

        const result = await ctx.db.$transaction(async (tx) => {
          const sessionCount = await tx.chatSession.count({
            where: { userId },
          });

          if (sessionCount === 0) {
            return { success: true, deletedCount: 0 };
          }

          // Delete all messages
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

  // Get recent messages
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
            session: { userId: ctx.user.id }
          },
          orderBy: { createdAt: "desc" },
          take: input.limit,
          select: {
            id: true,
            content: true,
            role: true,
            createdAt: true,
            imageUrl: true
          },
        });

        return messages.reverse(); 
      } catch (error) {
        console.error("Error fetching recent messages:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch recent messages",
        });
      }
    }),

  // Rename chat session
  renameChatSession: protectedProcedure.input(z.object({sessionId: z.string(), newTitle: z.string().min(1)}))
    .mutation(async ({input, ctx}) => {
      return ctx.db.chatSession.update({
        where: {
          id: input.sessionId,
          userId: ctx.user.id
        },
        data: {
          title: input.newTitle
        }
      })
    })
});