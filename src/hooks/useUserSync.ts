// src/hooks/useUserSync.ts
import { useEffect, useState } from 'react';
import { useKindeBrowserClient } from '@kinde-oss/kinde-auth-nextjs';
import { api } from '@/lib/trpc';

export function useUserSync() {
  const { user, isAuthenticated, isLoading } = useKindeBrowserClient();
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncCompleted, setSyncCompleted] = useState(false);

  const syncUserMutation = api.auth.syncUserFromKinde.useMutation({
    onSuccess: (data) => {
      console.log(`User ${data.isNewUser ? 'created' : 'updated'} successfully`);
      setSyncCompleted(true);
      setIsSyncing(false);
    },
    onError: (error) => {
      console.error('Failed to sync user:', error.message);
      setIsSyncing(false);
    },
  });

  useEffect(() => {
    // Only sync if user is authenticated, loaded, exists, and we haven't synced yet
    if (isAuthenticated && !isLoading && user && !syncCompleted && !isSyncing) {
      console.log('Syncing user to database:', user.id);
      setIsSyncing(true);
      
      syncUserMutation.mutate({
        id: user.id,
        email: user.email || '',
        given_name: user.given_name || null,
        family_name: user.family_name || null,
        picture: user.picture || null,
      });
    }
  }, [user, isAuthenticated, isLoading, syncCompleted, isSyncing, syncUserMutation]);

  return {
    isSyncing,
    syncCompleted,
    isReady: !isLoading && isAuthenticated && syncCompleted
  };
}