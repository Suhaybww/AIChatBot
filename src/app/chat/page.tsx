import { requireAuth } from "@/lib/auth";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ErrorBoundary } from "@/components/error/ErrorBoundary";
import { redirect } from "next/navigation";
import { db } from "@/server/db/db";

// Force dynamic rendering for this page
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export default async function ChatPage() {
  try {
    // This will automatically redirect if not authenticated
    const kindeUser = await requireAuth();

    // Check if user exists in our database
    const dbUser = await db.user.findUnique({
      where: { id: kindeUser.id },
      select: { id: true } // Only select what we need to check existence
    });

    // If user doesn't exist in our DB, redirect to auth callback for syncing
    if (!dbUser) {
      redirect("/auth-callback");
    }

    return (
      <div className="h-screen bg-gray-50 dark:bg-gray-950">
        <ErrorBoundary>
          <ChatInterface 
            user={{
              id: kindeUser.id,
              email: kindeUser.email,
              given_name: kindeUser.given_name,
              family_name: kindeUser.family_name,
              picture: kindeUser.picture,
            }}
            // No sessionId prop means this is a new chat
          />
        </ErrorBoundary>
      </div>
    );
  } catch (error) {
    console.error("Error in ChatPage:", error);
    // If any error occurs during user lookup, redirect to auth callback
    if (error instanceof Error && error.message.includes('NEXT_REDIRECT')) {
      throw error; // Re-throw redirect errors
    }
    redirect("/auth-callback");
  }
}