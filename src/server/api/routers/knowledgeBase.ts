import { aiOrchestrator } from "@/lib/orchestrators/aiOrchestrator";
import { KnowledgeBaseService } from "@/lib/services/knowledgeBase.service";
import { createTRPCRouter, publicProcedure } from "@/server/api/trpc/trpc";
import { z } from "zod";

const knowledgeBaseService = new KnowledgeBaseService();

export const knowledgeBaseRouter = createTRPCRouter({
  searchKnowledge: publicProcedure
    .input(z.object({
      query: z.string(),
      category: z.string().optional(),
    }))
    .query(async ({ input }) => {
      return await knowledgeBaseService.searchKnowledge(input.query, {
        category: input.category,
        limit: 10
      });
    }),
  
  getCategories: publicProcedure.query(async () => {
    return await knowledgeBaseService.getCategories();
  }),

  getAIResponse: publicProcedure
    .input(z.object({
      query: z.string(),
      category: z.string().optional()
    }))
    .mutation(async ({ input }) => {
      return await aiOrchestrator.generateKnowledgeResponse(
        input.query, 
        input.category
      );
    })
});