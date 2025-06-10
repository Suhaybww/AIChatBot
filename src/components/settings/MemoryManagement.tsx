"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Brain,
  Trash2,
  RefreshCw,
  Calendar,
  MessageSquare,
  TrendingUp,
  Sparkles,
  Settings,
  AlertTriangle,
} from "lucide-react";
import { api } from "@/lib/trpc";

interface MemoryManagementProps {
  userId: string;
}

export function MemoryManagement({}: MemoryManagementProps) {
  const [daysToClean, setDaysToClean] = useState(30);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  // Cleanup mutation
  const cleanupMutation = api.chat.clearAllSessions.useMutation({
    onSuccess: () => {
      setIsCleaningUp(false);
    },
    onError: (error) => {
      console.error("Cleanup failed:", error);
      setIsCleaningUp(false);
    },
  });

  const handleCleanup = async () => {
    setIsCleaningUp(true);
    try {
      await cleanupMutation.mutateAsync();
    } catch (error) {
      console.error("Error during cleanup:", error);
    }
  };

  if (false) {
    return (
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-200 flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-400" />
            <span>Memory Management</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 text-gray-400 animate-spin" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Memory Overview */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-200 flex items-center space-x-2">
            <Brain className="w-5 h-5 text-blue-400" />
            <span>Conversation Memory</span>
          </CardTitle>
          <p className="text-sm text-gray-400">
            Vega remembers context within each conversation session for better responses.
          </p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <MessageSquare className="w-4 h-4 text-green-400" />
                <span className="text-sm font-medium text-gray-300">Total Sessions</span>
              </div>
              <div className="text-2xl font-bold text-white">-</div>
              <div className="text-xs text-gray-400">Conversation threads</div>
            </div>

            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium text-gray-300">Total Messages</span>
              </div>
              <div className="text-2xl font-bold text-white">-</div>
              <div className="text-xs text-gray-400">Messages exchanged</div>
            </div>

            <div className="bg-gray-700/30 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-2">
                <Sparkles className="w-4 h-4 text-purple-400" />
                <span className="text-sm font-medium text-gray-300">Context Mode</span>
              </div>
              <div className="text-xl font-bold text-white">Session Only</div>
              <div className="text-xs text-gray-400">Per-conversation context</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Context Information */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-200 flex items-center space-x-2">
            <Settings className="w-5 h-5 text-orange-400" />
            <span>Context Awareness Settings</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <h4 className="text-sm font-medium text-blue-200 mb-2">Session-Only Context</h4>
            <p className="text-xs text-blue-200/80">
              Vega now remembers context only within individual conversations. 
              Each new chat session starts fresh, but Vega maintains context throughout the current conversation.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-gray-700/20 rounded-lg p-3">
              <Label className="text-xs text-gray-400 mb-1 block">Memory Scope</Label>
              <div className="text-sm font-medium text-white">Current Conversation Only</div>
            </div>

            <div className="bg-gray-700/20 rounded-lg p-3">
              <Label className="text-xs text-gray-400 mb-1 block">Context Window</Label>
              <div className="text-sm font-medium text-white">Last 20 Messages</div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium text-gray-300">What Vega Remembers in Each Session:</Label>
            <ul className="text-xs text-gray-400 space-y-1 ml-4">
              <li>• Previous messages in the current conversation</li>
              <li>• Topics discussed in this session</li>
              <li>• Course codes and policies mentioned</li>
              <li>• Relevant RMIT knowledge for context</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Memory Cleanup */}
      <Card className="bg-gray-800 border-gray-700">
        <CardHeader>
          <CardTitle className="text-gray-200 flex items-center space-x-2">
            <Trash2 className="w-5 h-5 text-red-400" />
            <span>Memory Cleanup</span>
          </CardTitle>
          <p className="text-sm text-gray-400">
            Remove old conversation data to improve performance and privacy.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="text-sm font-medium text-amber-200 mb-1">Important Note</h4>
                <p className="text-xs text-amber-200/80">
                  Cleaning up old conversations will remove Vega&apos;s memory of those discussions. 
                  This action cannot be undone.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="flex-1">
              <Label className="text-sm font-medium text-gray-300 mb-2 block">
                Delete conversations older than (days):
              </Label>
              <Input
                type="number"
                min="1"
                max="365"
                value={daysToClean}
                onChange={(e) => setDaysToClean(parseInt(e.target.value) || 30)}
                className="w-32 bg-gray-700 border-gray-600 text-white"
              />
            </div>

            <Button
              onClick={handleCleanup}
              disabled={isCleaningUp || cleanupMutation.isPending}
              variant="destructive"
              className="mt-6"
            >
              {isCleaningUp || cleanupMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Cleaning...
                </>
              ) : (
                <>
                  <Calendar className="w-4 h-4 mr-2" />
                  Clean Up
                </>
              )}
            </Button>
          </div>

          {cleanupMutation.isSuccess && (
            <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3">
              <p className="text-sm text-green-300">
                ✓ Successfully cleaned up old conversation data
              </p>
            </div>
          )}

          {cleanupMutation.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
              <p className="text-sm text-red-300">
                ✗ Failed to clean up data: {cleanupMutation.error.message}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}