import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc/trpc";
import { z } from "zod";
import { aiOrchestrator } from "@/lib/orchestrators";
import { SearchService } from "@/lib/services";
import { v4 as uuidv4 } from "uuid";
import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";

// Input validation schemas
const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000),
  sessionId: z.string().uuid().optional(),
  enableSearch: z.boolean().optional().default(true), // Enable smart search by default
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
  // Send a message and get AI response with smart search
  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        let sessionId = input.sessionId;
        let isNewSession = false;

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
            },
          });

          // Update session timestamp
          await tx.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });

          return { sessionId, isNewSession };
        });

        // PHASE 2: Generate AI response with smart search enabled
        console.log(`🤖 Processing message for session ${sessionInfo.sessionId}`);
        
        const aiResponse = await aiOrchestrator.generateResponse(input.content, {
          allowAutoSearch: input.enableSearch, // Use the input flag
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

        // PHASE 3: Save AI response and prepare result
        const result = await ctx.db.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: {
              sessionId: sessionInfo.sessionId,
              role: Role.ASSISTANT,
              content: aiResponse.response,
            },
          });

          // Update session timestamp
          await tx.chatSession.update({
            where: { id: sessionInfo.sessionId },
            data: { updatedAt: new Date() },
          });

          // Update session title if it's a new session and we have better context
          if (sessionInfo.isNewSession && aiResponse.searchResults && aiResponse.searchResults.results.length > 0) {
            const topResult = aiResponse.searchResults.results[0];
            const betterTitle = `${input.content.split(' ').slice(0, 5).join(' ')} - ${topResult.title}`.slice(0, 100);
            
            await tx.chatSession.update({
              where: { id: sessionInfo.sessionId },
              data: { title: betterTitle },
            });
          }

          return {
            message: aiResponse.response,
            sessionId: sessionInfo.sessionId,
            isNewSession: sessionInfo.isNewSession,
            messageId: assistantMessage.id,
            searchResults: aiResponse.searchResults,
            searchPerformed: aiResponse.searchPerformed,
            responseMetadata: aiResponse.responseMetadata,
          };
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
          timeout: 10000, // 10 second timeout for saving user message
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
              setTimeout(() => reject(new Error('AI response timeout')), 45000) // 45 second timeout
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
          timeout: 10000, // 10 second timeout for saving response
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

  // Get AI-powered search suggestions
  getSearchSuggestions: protectedProcedure
    .input(z.object({
      partialQuery: z.string().min(2).max(100),
      sessionId: z.string().uuid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const suggestions: string[] = [];
        
        // Get common RMIT search patterns
        const commonSearches = [
          "Bachelor of Computer Science",
          "Master of Business Administration",
          "How to apply for RMIT",
          "RMIT enrollment dates",
          "International student requirements",
          "RMIT fees and scholarships",
          "Campus locations",
          "Course prerequisites",
          "Credit transfer",
          "Student support services"
        ];
        
        // Filter based on partial query
        const queryLower = input.partialQuery.toLowerCase();
        const matchingSuggestions = commonSearches.filter(s => 
          s.toLowerCase().includes(queryLower)
        );
        
        suggestions.push(...matchingSuggestions);
        
        // Add context-based suggestions if session exists
        if (input.sessionId) {
          const recentMessages = await ctx.db.message.findMany({
            where: {
              sessionId: input.sessionId,
              session: { userId: ctx.user.id }
            },
            orderBy: { createdAt: 'desc' },
            take: 5,
            select: { content: true }
          });
          
          // Extract entities from recent messages
          const entities = recentMessages.flatMap(m => {
            const courseMatches = m.content.match(/\b[A-Z]{2,4}\d{3,5}\b/g) || [];
            return courseMatches;
          });
          
          if (entities.length > 0) {
            suggestions.push(`${input.partialQuery} ${entities[0]}`);
          }
        }
        
        return suggestions.slice(0, 5);
        
      } catch (error) {
        console.error("Error getting search suggestions:", error);
        return [];
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

        // Extract search queries from conversation
        const searchQueries = session.messages
          .filter(m => m.role === Role.USER)
          .filter(m => {
            const lower = m.content.toLowerCase();
            return lower.includes('find') || lower.includes('search') || 
                   lower.includes('link') || lower.includes('where');
          })
          .map(m => m.content.slice(0, 100));

        return {
          ...session,
          metadata: {
            searchQueries,
            totalSearches: searchQueries.length
          }
        };
        
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

        return messages.reverse();
        
      } catch (error) {
        console.error("Error fetching recent messages:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch recent messages",
        });
      }
    }),

  // Get conversation context with search analysis
  getConversationContext: protectedProcedure
    .input(z.object({
      sessionId: z.string().uuid(),
      message: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      try {
        const contextService = new (await import("@/lib/services")).ContextService();
        const context = await contextService.buildContext(
          input.sessionId,
          input.message || "",
          ctx.user.id
        );

        // Analyze if search would be beneficial
        const searchAnalysis = contextService.analyzeInformationNeed(context);

        return {
          messageCount: context.recentMessages.length,
          topics: context.sessionTopics,
          entities: context.sessionEntities,
          relevantKnowledgeCount: context.relevantKnowledge.length,
          contextTokens: context.contextWindow.tokenCount,
          sessionSummary: context.sessionSummary,
          searchHistory: context.searchHistory,
          searchAnalysis
        };
        
      } catch (error) {
        console.error("Error getting conversation context:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get conversation context",
        });
      }
    }),

  // Get user insights
  getUserInsights: protectedProcedure
    .query(async ({ ctx }) => {
      try {
        const [totalSessions, totalMessages, recentSessions] = await Promise.all([
          ctx.db.chatSession.count({
            where: { userId: ctx.user.id },
          }),
          ctx.db.message.count({
            where: {
              session: { userId: ctx.user.id },
            },
          }),
          ctx.db.chatSession.findMany({
            where: { userId: ctx.user.id },
            orderBy: { updatedAt: 'desc' },
            take: 10,
            include: {
              messages: {
                where: { role: Role.USER },
                select: { content: true }
              }
            }
          })
        ]);

        // Extract common topics from recent sessions
        const allMessages = recentSessions.flatMap(s => s.messages.map(m => m.content));
        const topics = new Map<string, number>();
        
        // Common RMIT topic patterns
        const topicPatterns = {
          'Programs & Courses': /bachelor|master|diploma|course|program|degree/i,
          'Enrollment & Applications': /apply|enrol|admission|application|requirement/i,
          'Fees & Financial': /fee|cost|scholarship|payment|hecs/i,
          'Dates & Deadlines': /date|deadline|when|semester|intake/i,
          'Student Support': /help|support|service|contact/i,
        };
        
        for (const [topic, pattern] of Object.entries(topicPatterns)) {
          const count = allMessages.filter(m => pattern.test(m)).length;
          if (count > 0) topics.set(topic, count);
        }

        const topTopics = Array.from(topics.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([topic]) => topic);

        return {
          totalSessions,
          totalMessages,
          averageMessagesPerSession: totalSessions > 0 ? Math.round(totalMessages / totalSessions) : 0,
          topTopics,
          searchUsageRate: 0, // Would need to track this separately
        };
        
      } catch (error) {
        console.error("Error getting user insights:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to get user insights",
        });
      }
    }),

  // Cleanup old context
  cleanupOldContext: protectedProcedure
    .input(z.object({
      daysOld: z.number().min(1).max(365).default(30),
    }))
    .mutation(async ({ input, ctx }) => {
      try {
        const contextService = new (await import("@/lib/services")).ContextService();
        await contextService.cleanupOldContext(ctx.user.id, input.daysOld);
        
        return { 
          success: true, 
          message: `Cleaned up conversations older than ${input.daysOld} days` 
        };
        
      } catch (error) {
        console.error("Error cleaning up context:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to cleanup old context",
        });
      }
    }),
});