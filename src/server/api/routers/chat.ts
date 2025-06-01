import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";
import { sendClaude } from "@/lib/ai";
import { v4 as uuidv4 } from "uuid";
import { Role } from "@prisma/client";

export const chatRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(
      z.object({
        content: z.string().min(1),
        sessionId: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      console.log("Received message from UI:", input.content);
      let userId = ctx.user.id;
      let session = input.sessionId;

      if (!session) {
        let newSessionId = await ctx.db.chatSession.create({
          data: {
            id: uuidv4(),
            userId,
            title: input.content.slice(0, 50),
          },
        });

        session = newSessionId.id;
      }

      await ctx.db.message.create({
        data: {
          sessionId: session,
          role: Role.USER,
          content: input.content,
        },
      });

      const prompt = `Human: ${input.content}\n\nAssistant: `;
      const responseByVega = await sendClaude(prompt);

      await ctx.db.message.create({
        data: {
          sessionId: session,
          role: Role.ASSISTANT,
          content: responseByVega,
        },
      });

      await ctx.db.chatSession.update({
        where: {
          id: session,
        },

        data: {
          updatedAt: new Date(),
        },
      });

      return {
        message: responseByVega,
        sessionId: session,
      };
    }),

  getSessions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.chatSession.findMany({
      where: { userId: ctx.user.id },
      include: { messages: true },
      orderBy: { updatedAt: "desc" },
    });
  }),

  getSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.db.chatSession.findFirst({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
        },
        include: {
          messages: true,
        },
      });
    }),

  deleteSession: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      await ctx.db.message.deleteMany({
        where: {
          sessionId: input.sessionId,
        },
      });

      await ctx.db.chatSession.delete({
        where: {
          id: input.sessionId,
          userId: ctx.user.id,
        },
      });
      return { success: true };
    }),

  clearAllSessions: protectedProcedure.mutation(async ({ ctx }) => {
    const userId = ctx.user.id;

    await ctx.db.message.deleteMany({
      where: {
        session: { userId },
      },
    });

    await ctx.db.chatSession.deleteMany({
      where: { userId },
    });

    return { success: true };
  }),
});
