import { createTRPCRouter, protectedProcedure } from "@/server/api/trpc";
import { z } from "zod";

export const chatRouter = createTRPCRouter({
  sendMessage: protectedProcedure
    .input(z.object({
      content: z.string().min(1),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // TODO: Implement AI response logic
      // For now, return a simple response
      return { 
        message: `You said: "${input.content}". This is a placeholder response.`,
        sessionId: input.sessionId || "temp-session"
      };
    }),

  getSessions: protectedProcedure.query(async ({ ctx }) => {
    return ctx.db.chatSession.findMany({
      where: { userId: ctx.user.id },
      include: { messages: true },
      orderBy: { updatedAt: "desc" },
    });
  }),
});