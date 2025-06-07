import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { sendClaude } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";
import { Role } from "@prisma/client";
import { TRPCError } from "@trpc/server";

const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000), 
  sessionId: z.string().uuid().optional(),
  imageUrl: z.string().optional() 
});

const sessionIdSchema = z.object({
  sessionId: z.string().uuid(),
});

const updateSessionTitleSchema = z.object({
  sessionId: z.string().uuid(),
  title: z.string().min(1).max(100),
});

export const chatRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(sendMessageSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        const userId = ctx.user.id;
        let sessionId = input.sessionId;
        let isNewSession = false;

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

          // const userMessage = await tx.message.create({
          //   data: {
          //     sessionId: sessionId!,
          //     role: Role.USER,
          //     content: input.content,
          //     imageUrl: input.imageUrl || null
          //   },
          // });

          await tx.chatSession.update({
            where: { id: sessionId },
            data: { updatedAt: new Date() },
          });

          return { sessionId, isNewSession };
        }, {
          timeout: 10000, 
          maxWait: 5000, 
        });

        if (!sessionInfo || !sessionInfo.sessionId) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to create or retrieve session",
          });
        }

        
        let prompt = `Human: ${input.content}`;
        if (input.imageUrl) {
          if (input.imageUrl.startsWith("data:image/")) {
            prompt = JSON.stringify({
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "base64",
                    media_type: "image/jpeg",
                    data: input.imageUrl.split(",")[1]
                  }
                },
                {
                  type: "text",
                  text: `Please analyze this image and provide the specific information shown. If the image contains:

- Steps or instructions: List them out exactly as written
- Formulas or equations: Write them exactly as shown
- Algorithms or processes: Detail each step in order
- Technical content: Provide the exact technical details

Focus on the actual content and information rather than just describing the image. If there's text or steps visible, write them out precisely.

For diagrams or technical content:
1. First state what the content is about
2. Then list out all the specific steps/information shown
3. Include any variables, equations, or special notations exactly as written
4. Maintain the same ordering and numbering as shown

Please provide the actual content and information from the image, preserving the exact details and steps shown.

User's question: ${input.content || "What information is shown in this image?"}`
                }
              ]
            });
          } else if (input.imageUrl.startsWith("http")) {
            prompt = JSON.stringify({
              role: "user",
              content: [
                {
                  type: "image",
                  source: {
                    type: "url",
                    url: input.imageUrl
                  }
                },
                {
                  type: "text",
                  text: `Please analyze this image and provide the specific information shown. If the image contains:

- Steps or instructions: List them out exactly as written
- Formulas or equations: Write them exactly as shown
- Algorithms or processes: Detail each step in order
- Technical content: Provide the exact technical details

Focus on the actual content and information rather than just describing the image. If there's text or steps visible, write them out precisely.

For diagrams or technical content:
1. First state what the content is about
2. Then list out all the specific steps/information shown
3. Include any variables, equations, or special notations exactly as written
4. Maintain the same ordering and numbering as shown

Please provide the actual content and information from the image, preserving the exact details and steps shown.

User's question: ${input.content || "What information is shown in this image?"}`
                }
              ]
            });
          }
        }

        const aiResponse = await sendClaude(prompt);

        if (!aiResponse) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to generate AI response",
          });
        }

        const result = await ctx.db.$transaction(async (tx) => {
          const assistantMessage = await tx.message.create({
            data: {
              sessionId: sessionInfo.sessionId,
              role: Role.ASSISTANT,
              content: aiResponse,
              imageUrl: null
            },
          });

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
        }, {
          timeout: 10000, 
          maxWait: 5000,  
        });

        if (!result) {
          throw new TRPCError({
            code: "INTERNAL_SERVER_ERROR",
            message: "Failed to save AI response",
          });
        }

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
          take: 50, 
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

  deleteSession: protectedProcedure
    .input(sessionIdSchema)
    .mutation(async ({ input, ctx }) => {
      try {
        await ctx.db.$transaction(async (tx) => {
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

          await tx.message.deleteMany({
            where: { sessionId: input.sessionId },
          });

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

          await tx.message.deleteMany({
            where: {
              session: { userId },
            },
          });

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