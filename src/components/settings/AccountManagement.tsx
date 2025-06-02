"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Trash2, 
  AlertTriangle,
  Shield,
  RotateCcw,
  CheckCircle,
  Loader2,
  X
} from "lucide-react";
import { api } from "@/lib/trpc";
import { toast } from "sonner";
import { useUserSync } from "@/hooks/useUserSync";

interface AccountManagementProps {
  user: {
    id: string;
    email?: string | null;
    given_name?: string | null;
    family_name?: string | null;
    picture?: string | null;
  };
}

export function AccountManagement({ user }: AccountManagementProps) {
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState("");
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showClearHistoryDialog, setShowClearHistoryDialog] = useState(false);

  // Sync user to database first
  const { isSyncing, syncCompleted } = useUserSync();

  // Get utils for query invalidation
  const utils = api.useUtils();

  // Get account stats - only run after sync is complete
  const { data: profile } = api.auth.getProfile.useQuery(
    undefined,
    { enabled: syncCompleted }
  );
  const { data: accountStats } = api.auth.getAccountStats.useQuery(
    undefined,
    { enabled: syncCompleted }
  );

  const clearHistoryMutation = api.auth.clearChatHistory.useMutation({
    onSuccess: async (data) => {
      toast.success(data.message);
      setShowClearHistoryDialog(false);
      // Invalidate sessions query to update sidebar
      await utils.chat.getSessions.invalidate();
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });

  const deleteAccountMutation = api.auth.deleteAccount.useMutation({
    onSuccess: async () => {
      toast.success("Account deleted successfully. Logging you out...");
      setShowDeleteDialog(false);
      
      // Invalidate all queries before logout
      await utils.invalidate();
      
      // Redirect to Kinde's logout URL - this will log out and redirect to landing page
      setTimeout(() => {
        window.location.href = "/api/auth/logout";
      }, 1500);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to delete account. Please try again.");
    },
  });

  const handleClearHistory = () => {
    clearHistoryMutation.mutate();
  };

  const handleDeleteAccount = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!deleteConfirmEmail.trim()) {
      toast.error("Please enter your email to confirm");
      return;
    }

    if (deleteConfirmEmail !== user.email) {
      toast.error("Email confirmation does not match");
      return;
    }

    deleteAccountMutation.mutate({
      confirmEmail: deleteConfirmEmail,
    });
  };

  // Show loading state while syncing user
  if (isSyncing) {
    return (
      <div className="flex items-center justify-center p-6 sm:p-8">
        <div className="text-center space-y-4 max-w-sm mx-auto">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-gray-400 mx-auto" />
          <div>
            <p className="text-gray-300 font-medium text-sm sm:text-base">Loading account data...</p>
            <p className="text-gray-500 text-xs sm:text-sm">Please wait a moment</p>
          </div>
        </div>
      </div>
    );
  }

  const currentUser = profile || user;

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Account Information */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 mb-6 sm:mb-8">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto sm:mx-0">
            <Shield className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-100">Account Information</h3>
            <p className="text-xs sm:text-sm text-gray-500">Your account details and status</p>
          </div>
        </div>
        
        <div className="bg-gray-700/30 rounded-lg sm:rounded-xl p-4 sm:p-6 border border-gray-600/30">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-blue-400 rounded-full"></div>
                <span className="font-medium text-gray-300 text-sm sm:text-base">User ID</span>
              </div>
              <p className="text-gray-500 font-mono text-xs sm:text-sm bg-gray-800/50 p-2 sm:p-3 rounded-md sm:rounded-lg break-all">
                {currentUser.id}
              </p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="font-medium text-gray-300 text-sm sm:text-base">Account Type</span>
              </div>
              <p className="text-gray-400 text-sm sm:text-base">Student</p>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></div>
                <span className="font-medium text-gray-300 text-sm sm:text-base">Status</span>
              </div>
              <span className="inline-flex items-center px-2 sm:px-3 py-1 rounded-full text-xs sm:text-sm bg-emerald-900/30 text-emerald-300 border border-emerald-700/50">
                <CheckCircle className="w-2 h-2 sm:w-3 sm:h-3 mr-1" />
                Active
              </span>
            </div>
            <div className="space-y-2 sm:space-y-3">
              <div className="flex items-center space-x-2">
                <div className="w-2 h-2 bg-purple-400 rounded-full"></div>
                <span className="font-medium text-gray-300 text-sm sm:text-base">Member Since</span>
              </div>
              <p className="text-gray-400 text-sm sm:text-base">
                {accountStats?.memberSince 
                  ? new Date(accountStats.memberSince).toLocaleDateString()
                  : 'Today'
                }
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Data Management */}
      <div className="bg-gray-800/60 backdrop-blur-sm border border-gray-700/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 mb-6 sm:mb-8">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gray-700 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto sm:mx-0">
            <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-semibold text-gray-100">Data Management</h3>
            <p className="text-xs sm:text-sm text-gray-500">Manage your conversation data</p>
          </div>
        </div>
        
        <div className="bg-gradient-to-r from-orange-900/20 to-red-900/20 border border-orange-700/50 rounded-lg sm:rounded-xl p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-4">
              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-orange-900/50 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto sm:mx-0">
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400" />
              </div>
              <div className="text-center sm:text-left">
                <h4 className="font-semibold text-gray-200 text-sm sm:text-base">Clear Chat History</h4>
                <p className="text-xs sm:text-sm text-gray-400">Permanently delete all your conversations with Vega</p>
                {accountStats?.totalConversations !== undefined && (
                  <p className="text-xs text-orange-400 mt-1">
                    {accountStats.totalConversations} conversation{accountStats.totalConversations !== 1 ? 's' : ''} will be deleted
                  </p>
                )}
              </div>
            </div>
            
            <Dialog open={showClearHistoryDialog} onOpenChange={setShowClearHistoryDialog}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-orange-600/50 bg-orange-900/30 text-orange-300 hover:bg-orange-800/40 hover:border-orange-500 rounded-lg sm:rounded-xl px-4 sm:px-6 w-full sm:w-auto text-sm"
                >
                  Clear History
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-800 border-gray-700 mx-4 sm:mx-0 max-w-md sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-gray-100 text-base sm:text-lg">Clear Chat History</DialogTitle>
                  <DialogDescription className="text-gray-400 text-sm sm:text-base">
                    This will permanently delete all your conversations with Vega. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowClearHistoryDialog(false)}
                    className="border-gray-600 text-gray-400 hover:bg-gray-700 w-full sm:w-auto order-2 sm:order-1"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleClearHistory}
                    disabled={clearHistoryMutation.isPending}
                    className="bg-orange-600 hover:bg-orange-700 text-white w-full sm:w-auto order-1 sm:order-2"
                  >
                    {clearHistoryMutation.isPending ? (
                      <>
                        <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                        Clearing...
                      </>
                    ) : (
                      'Clear History'
                    )}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-gradient-to-br from-red-900/20 to-pink-900/20 backdrop-blur-sm border border-red-800/50 rounded-xl sm:rounded-2xl p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col sm:flex-row sm:items-center space-y-3 sm:space-y-0 sm:space-x-3 mb-6 sm:mb-8">
          <div className="w-8 h-8 sm:w-10 sm:h-10 bg-red-900/50 rounded-lg sm:rounded-xl flex items-center justify-center mx-auto sm:mx-0">
            <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 text-red-400" />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="text-lg sm:text-xl font-semibold text-red-400">Danger Zone</h3>
            <p className="text-xs sm:text-sm text-red-300/80">Irreversible actions - proceed with caution</p>
          </div>
        </div>
        
        <div className="bg-red-950/30 border border-red-800/50 rounded-lg sm:rounded-xl p-4 sm:p-6">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
            <div className="text-center lg:text-left">
              <h4 className="font-semibold text-red-300 mb-1 flex items-center justify-center lg:justify-start text-sm sm:text-base">
                <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                Delete Account
              </h4>
              <p className="text-xs sm:text-sm text-red-400/80">Permanently delete your account and all data</p>
            </div>
            
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
              <DialogTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="border-red-600/50 text-red-400 hover:bg-red-950/50 hover:border-red-500 rounded-lg sm:rounded-xl px-4 sm:px-6 w-full lg:w-auto text-sm"
                >
                  <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                  Delete
                </Button>
              </DialogTrigger>
              <DialogContent className="bg-gray-800 border-gray-700 mx-4 sm:mx-0 max-w-md sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle className="text-red-400 flex items-center text-base sm:text-lg">
                    <AlertTriangle className="w-4 h-4 sm:w-5 sm:h-5 mr-2" />
                    Delete Account
                  </DialogTitle>
                  <DialogDescription className="text-gray-400 text-sm sm:text-base">
                    This will permanently delete your account and all associated data including:
                    <ul className="list-disc list-inside mt-2 space-y-1 text-xs sm:text-sm">
                      <li>Your profile information</li>
                      <li>All conversation history</li>
                      <li>Account preferences and settings</li>
                    </ul>
                    <strong className="text-red-400 block mt-3">This action cannot be undone.</strong>
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleDeleteAccount} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="confirmEmail" className="text-gray-300 text-sm sm:text-base">
                      Type your email address to confirm:
                    </Label>
                    <Input
                      id="confirmEmail"
                      type="email"
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      placeholder={user.email || "Enter your email"}
                      className="bg-gray-700 border-gray-600 text-gray-200 text-sm sm:text-base h-10 sm:h-12"
                      required
                    />
                  </div>
                  
                  <DialogFooter className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        setShowDeleteDialog(false);
                        setDeleteConfirmEmail("");
                      }}
                      className="border-gray-600 text-gray-400 hover:bg-gray-700 w-full sm:w-auto order-2 sm:order-1"
                    >
                      <X className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                      Cancel
                    </Button>
                    <Button
                      type="submit"
                      disabled={deleteAccountMutation.isPending || deleteConfirmEmail !== user.email}
                      className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 w-full sm:w-auto order-1 sm:order-2"
                    >
                      {deleteAccountMutation.isPending ? (
                        <>
                          <Loader2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2 animate-spin" />
                          Deleting...
                        </>
                      ) : (
                        <>
                          <Trash2 className="w-3 h-3 sm:w-4 sm:h-4 mr-2" />
                          Delete Account
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </div>
    </div>
  );
}