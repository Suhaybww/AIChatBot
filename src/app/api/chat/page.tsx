// src/app/chat/page.tsx
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";
import { ChatInterface } from "@/components/chat/ChatInterface";

export default async function ChatPage() {
  const { getUser } = getKindeServerSession();
  const user = await getUser();

  // Redirect to home if not authenticated
  if (!user) {
    redirect("/");
  }

  return (
    <div className="h-screen flex flex-col">
      <ChatInterface user={user} />
    </div>
  );
}