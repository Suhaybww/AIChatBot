// src/app/chat/page.tsx
import { requireAuth } from "@/lib/auth";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { redirect } from "next/navigation";
import { db } from "@/server/db";

export default async function ChatPage() {
  // This will automatically redirect if not authenticated
  const kindeUser = await requireAuth();

  // Check if user exists in our database
  const dbUser = await db.user.findUnique({
    where: { id: kindeUser.id }
  });

  // If user doesn't exist in our DB, redirect to auth callback for syncing
  if (!dbUser) {
    redirect("/auth-callback");
  }

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950">
      <ChatInterface user={{
        id: kindeUser.id,
        email: kindeUser.email,
        given_name: kindeUser.given_name,
        family_name: kindeUser.family_name,
        picture: kindeUser.picture,
      }} />
    </div>
  );
}