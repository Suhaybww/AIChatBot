import { createCallerFactory, createTRPCRouter } from "@/server/api/trpc";
import { authRouter } from "@/server/api/routers/auth";
import { chatRouter } from "@/server/api/routers/chat";
import { knowledgeBaseRouter } from "@/server/api/routers/knowledgeBase";

export const appRouter = createTRPCRouter({
  auth: authRouter,
  chat: chatRouter,
  knowledgeBase: knowledgeBaseRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);