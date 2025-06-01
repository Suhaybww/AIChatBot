import { sendClaude } from "@/lib/ai";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc";
import { z } from "zod";

export const knowledgeBaseRouter = createTRPCRouter({
  searchKnowledge: publicProcedure
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
  
  getCategories: publicProcedure.query(async ({ctx}) => {
    const category  = await ctx.db.knowledgeBase.findMany({
      distinct: ["category"],
      where: {
        isActive: true
      },
      select: {
        category: true
      }
    })

    return category.map(x => x.category).filter(Boolean)
  }),

  getAIResponse: publicProcedure.input(z.object({
    query: z.string(),
    category: z.string().optional()
  }))
  .mutation(async ({ctx, input}) => {
    const result = await ctx.db.knowledgeBase.findMany({
      where: {
        OR: [
          {
            title: {
              contains: input.query,
              mode: "insensitive"
            }
          }
        ],
        ...(input.category && {
          category: input.category
        }),
        isActive: true
      },
      orderBy: {
        priority: "desc"
      },
      take: 5
    })

    const text = result.map(r => `Title: ${r.title}\nContent: ${r.content}`).join("\n\n");

    const prompt = `Context:\n${text}\n\nQuestion: ${input.query}\n\nAnswer:`

    const responseByAI = await sendClaude(prompt)


    return {
      answer: responseByAI,
      contextUsed: text
    }

  })
  
});