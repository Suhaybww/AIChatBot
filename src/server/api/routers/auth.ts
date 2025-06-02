// src/server/api/routers/auth.ts
import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

// Input validation schemas
const updateProfileSchema = z.object({
  given_name: z.string().min(1, "First name is required").max(50, "First name too long").optional(),
  family_name: z.string().min(1, "Last name is required").max(50, "Last name too long").optional(),
  email: z.string().email("Invalid email address").optional(),
});

const syncUserSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  given_name: z.string().nullable().optional(),
  family_name: z.string().nullable().optional(),  
  picture: z.string().url().nullable().optional(),
});

const deleteAccountSchema = z.object({
  confirmEmail: z.string().email("Please enter your email to confirm"),
});

const checkEmailSchema = z.object({ 
  email: z.string().email() 
});

export const authRouter = createTRPCRouter({
  // Get current session/user
  getSession: publicProcedure.query(({ ctx }) => {
    return ctx.user;
  }),

  // Sync user data from Kinde (PUBLIC for auth callback)
  syncUserFromKinde: publicProcedure
    .input(syncUserSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if user exists
        const existingUser = await ctx.db.user.findUnique({
          where: { id: input.id },
        });

        let user;

        if (existingUser) {
          // Update existing user with latest data from Kinde
          user = await ctx.db.user.update({
            where: { id: input.id },
            data: {
              email: input.email,
              given_name: input.given_name,
              family_name: input.family_name,
              picture: input.picture,
              updatedAt: new Date(),
            },
            select: {
              id: true,
              email: true,
              given_name: true,
              family_name: true,
              picture: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          return {
            success: true,
            user,
            isNewUser: false,
            message: "User data synchronized successfully",
          };
        } else {
          // Create new user
          user = await ctx.db.user.create({
            data: {
              id: input.id,
              email: input.email,
              given_name: input.given_name,
              family_name: input.family_name,
              picture: input.picture,
            },
            select: {
              id: true,
              email: true,
              given_name: true,
              family_name: true,
              picture: true,
              createdAt: true,
              updatedAt: true,
            },
          });

          return {
            success: true,
            user,
            isNewUser: true,
            message: "User created successfully",
          };
        }
      } catch (error) {
        console.error("Error syncing user from Kinde:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to sync user data",
        });
      }
    }),

  // Get full user profile with detailed information
  getProfile: protectedProcedure.query(async ({ ctx }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          id: true,
          email: true,
          given_name: true,
          family_name: true,
          picture: true,
          createdAt: true,
          updatedAt: true,
          _count: {
            select: {
              sessions: true,
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return user;
    } catch (error) {
      console.error("Error fetching user profile:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch user profile",
      });
    }
  }),

  // Update user profile information
  updateProfile: protectedProcedure
    .input(updateProfileSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Check if email is being updated and if it's already taken
        if (input.email) {
          const existingUser = await ctx.db.user.findFirst({
            where: {
              email: input.email,
              NOT: { id: ctx.user.id },
            },
          });

          if (existingUser) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Email address is already in use",
            });
          }
        }

        // Update the user
        const updatedUser = await ctx.db.user.update({
          where: { id: ctx.user.id },
          data: {
            ...input,
            updatedAt: new Date(),
          },
          select: {
            id: true,
            email: true,
            given_name: true,
            family_name: true,
            picture: true,
            updatedAt: true,
          },
        });

        return {
          success: true,
          user: updatedUser,
          message: "Profile updated successfully",
        };
      } catch (error) {
        console.error("Error updating user profile:", error);
        
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update profile",
        });
      }
    }),

  // Clear user's chat history
  clearChatHistory: protectedProcedure.mutation(async ({ ctx }) => {
    try {
      // Delete all chat sessions and messages for this user
      await ctx.db.$transaction(async (tx) => {
        // Delete all messages in user's chat sessions
        await tx.message.deleteMany({
          where: {
            session: {
              userId: ctx.user.id,
            },
          },
        });

        // Delete all chat sessions for this user
        await tx.chatSession.deleteMany({
          where: { userId: ctx.user.id },
        });
      });

      return {
        success: true,
        message: "Chat history cleared successfully",
      };
    } catch (error) {
      console.error("Error clearing chat history:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to clear chat history",
      });
    }
  }),

  // Delete user account (with all related data)
  deleteAccount: protectedProcedure
    .input(deleteAccountSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        // Get user to verify email
        const user = await ctx.db.user.findUnique({
          where: { id: ctx.user.id },
          select: { email: true },
        });

        if (!user) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "User not found",
          });
        }

        // Verify email confirmation
        if (user.email !== input.confirmEmail) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Email confirmation does not match",
          });
        }

        // Delete all user data in a transaction
        await ctx.db.$transaction(async (tx) => {
          // Delete user's chat messages
          await tx.message.deleteMany({
            where: {
              session: {
                userId: ctx.user.id,
              },
            },
          });

          // Delete user's chat sessions
          await tx.chatSession.deleteMany({
            where: { userId: ctx.user.id },
          });

          // Finally, delete the user
          await tx.user.delete({
            where: { id: ctx.user.id },
          });
        });

        return {
          success: true,
          message: "Account deleted successfully",
        };
      } catch (error) {
        console.error("Error deleting user account:", error);
        
        if (error instanceof TRPCError) {
          throw error;
        }

        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete account",
        });
      }
    }),

  // Get account statistics (for settings dashboard)
  getAccountStats: protectedProcedure.query(async ({ ctx }) => {
    try {
      const user = await ctx.db.user.findUnique({
        where: { id: ctx.user.id },
        select: {
          createdAt: true,
          _count: {
            select: {
              sessions: true, // Count of chat sessions
            },
          },
        },
      });

      if (!user) {
        throw new TRPCError({  
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      return {
        memberSince: user.createdAt,
        totalConversations: user._count.sessions,
      };
    } catch (error) {
      console.error("Error fetching account stats:", error);
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to fetch account statistics",
      });
    }
  }),

  // Check if email is available (for real-time validation)
  checkEmailAvailability: protectedProcedure
    .input(checkEmailSchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const existingUser = await ctx.db.user.findFirst({
          where: {
            email: input.email,
            NOT: { id: ctx.user.id },
          },
        });

        return {
          available: !existingUser,
          message: existingUser ? "Email is already in use" : "Email is available",
        };
      } catch (error) {
        console.error("Error checking email availability:", error);
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to check email availability",
        });
      }
    }),
});