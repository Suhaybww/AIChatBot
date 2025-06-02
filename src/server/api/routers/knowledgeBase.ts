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

    const prompt = `You are Vega, RMIT University's AI assistant. You are an expert in all RMIT policies, courses, and services. You help students navigate academic life at RMIT University.

Based on the RMIT University information below, provide a helpful and natural response to the student's question.

RMIT Knowledge Base:
${formattedResults}

Student Question: ${input.query}

Guidelines for your response:
- Answer naturally and conversationally, as if you're a knowledgeable RMIT student advisor
- Don't introduce yourself or explain who you are in your response
- Focus directly on answering the question
- Always provide RMIT-specific answers based on official RMIT policies and information

When discussing courses or units:
- Include course codes when available
- Specify credit point requirements
- Mention prerequisites if relevant
- Include intake dates and campus information
- Specify fees and duration information

For academic policies:
- Cite specific RMIT policy numbers/references
- Mention any recent updates or changes
- Include relevant deadlines or dates

If information is not in the context:
- Direct users to specific RMIT resources:
  * Course guides: https://www.rmit.edu.au/study-with-us/course-guides
  * Student policies: https://www.rmit.edu.au/about/governance-and-management/policies
  * Academic calendar: https://www.rmit.edu.au/students/my-course/important-dates

Always include:
- Relevant RMIT-specific terminology
- Campus-specific information when applicable
- Links to relevant RMIT services
- Contact information for relevant RMIT staff/departments

For program-specific queries:
- Specify which campus/mode of study the information applies to
- Note any variations between different study modes
- Include relevant school/department contact details

Keep responses concise but comprehensive and use a friendly, helpful tone.

Response:`

    const responseByAI = await sendClaude(prompt)

    return {
      answer: responseByAI,
      contextUsed: formattedResults
    }

  })
  
});