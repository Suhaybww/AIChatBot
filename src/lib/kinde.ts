// src/lib/kinde.ts
import { getKindeServerSession } from "@kinde-oss/kinde-auth-nextjs/server";

export type KindeUser = {
  id: string;
  email?: string | null;
  given_name?: string | null;
  family_name?: string | null;
  picture?: string | null;
};

// Helper function to get user session
export async function getUser() {
  const { getUser } = getKindeServerSession();
  return await getUser();
}

// Helper function to check if user is authenticated
export async function isAuthenticated() {
  const { isAuthenticated } = getKindeServerSession();
  return await isAuthenticated();
}
