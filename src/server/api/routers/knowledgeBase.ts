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
          },
          {
            content: {
              contains: input.query,
              mode: "insensitive"
            }
          }
        ],
        AND: [
          {
            OR: [
              {
                structuredData: {
                  path: ["course_code"],
                  string_contains: ""
                }
              },
              {
                structuredData: {
                  path: ["prerequisites"],
                  string_contains: ""
                }
              },
              {
                structuredData: {
                  path: ["credit_points"],
                  string_contains: ""
                }
              },
              {
                structuredData: {
                  path: ["duration"],
                  string_contains: ""
                }
              },
              {
                structuredData: {
                  path: ["fees"],
                  string_contains: ""
                }
              },
              {
                structuredData: {
                  path: ["campus"],
                  string_contains: ""
                }
              },
              {
                structuredData: {
                  path: ["intake"],
                  string_contains: ""
                }
              }
            ]
          }
        ],
        ...(input.category && {
          category: input.category
        }),
        isActive: true
      },
      orderBy: [
        {
          priority: "desc"
        },
        {
          updatedAt: "desc"
        }
      ],
      take: 10
    })

    const formattedResults = result.map(r => {
      const structuredData = r.structuredData as Record<string, unknown>;
      const structuredInfo = Object.entries(structuredData)
        .filter(([, value]) => value !== null && value !== undefined)
        .map(([key, value]) => `${key.replace(/_/g, ' ')}: ${value}`)
        .join('\n');

      return `Title: ${r.title}
Category: ${r.category}
${structuredInfo}
Content: ${r.content}`;
    }).join('\n\n---\n\n');

    const prompt = `You are Vega, RMIT University's AI assistant. You are an expert in all RMIT policies, courses, and services.

Based on the RMIT University information below, provide a direct and helpful response to the student's question.

RMIT Knowledge Base:
${formattedResults}

Student Question: ${input.query}

CRITICAL RESPONSE GUIDELINES:
- NEVER introduce yourself, mention your name, or explain who you are
- NEVER say phrases like "I'm Vega" or "As an RMIT assistant" or "I'm here to help"
- Jump straight into answering the question with relevant information
- Be concise yet comprehensive - provide all necessary details without unnecessary fluff
- Answer as if you're responding to a colleague who already knows who you are

Content Requirements:
- Provide RMIT-specific answers based only on official RMIT information
- Include specific details: course codes, credit points, prerequisites, fees, dates, campus locations
- Cite policy numbers/references when discussing academic policies
- Include relevant deadlines, contact information, and links to RMIT resources

Format Guidelines:
- Use clear, structured responses with bullet points or numbered lists when helpful
- Start responses with the most important information first
- End with relevant next steps or additional resources if applicable

If information is missing from the knowledge base:
- State what information is available
- Direct to specific RMIT resources:
  * Course guides: https://www.rmit.edu.au/study-with-us/course-guides
  * Student policies: https://www.rmit.edu.au/about/governance-and-management/policies
  * Academic calendar: https://www.rmit.edu.au/students/my-course/important-dates

Response:`

    const responseByAI = await sendClaude(prompt)

    return {
      answer: responseByAI,
      contextUsed: formattedResults
    }

  })
  
});