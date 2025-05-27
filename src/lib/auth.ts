// src/lib/auth.ts
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";
import { redirect } from "next/navigation";

export type AuthUser = {
  id: string;
  email?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
};

export async function requireAuth(): Promise<AuthUser> {
  const { getUser, isAuthenticated } = getKindeServerSession();
  
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    redirect("/");
  }

  const user = await getUser();
  if (!user) {
    redirect("/");
  }

  return user as AuthUser;
}

export async function getAuthUser(): Promise<AuthUser | null> {
  const { getUser, isAuthenticated } = getKindeServerSession();
  
  const authenticated = await isAuthenticated();
  if (!authenticated) {
    return null;
  }

  const user = await getUser();
  return user as AuthUser | null;
}