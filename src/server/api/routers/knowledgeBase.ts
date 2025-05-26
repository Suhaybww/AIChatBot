import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { z } from "zod";

export const knowledgeBaseRouter = createTRPCRouter({
  search: publicProcedure
    .input(z.object({
      query: z.string(),
      category: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.db.knowledgeBase.findMany({
        where: {
          OR: [
            { title: { contains: input.query, mode: "insensitive" } },
            { content: { contains: input.query, mode: "insensitive" } },
          ],
          ...(input.category && { category: input.category }),
          isActive: true,
        },
        orderBy: { priority: "desc" },
        take: 10,
      });
    }),
});