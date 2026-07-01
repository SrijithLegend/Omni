/**
 * ConversationsTab — Displays all captured conversations for a project.
 */

import React, { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Filter, Import as SortAsc, Plus, MessageSquare, RefreshCw, Loader as Loader2, CircleAlert as AlertCircle, Star, Pin, Archive } from "lucide-react";
import { ConversationCard } from "./ConversationCard";
import type { UniversalConversation } from "@/models/universal-conversation";
import { cn } from "../lib/utils";

interface ConversationsTabProps {
  conversations: UniversalConversation[];
  isLoading?: boolean;
  isCapturing?: boolean;
  captureStatus?: "idle" | "detecting" | "capturing" | "error";
  captureError?: string | null;
  activeConversationId?: string | null;
  onSelectConversation?: (id: string) => void;
  onOpenConversation?: (id: string) => void;
  onDeleteConversation?: (id: string) => void;
  onStarConversation?: (id: string) => void;
  onPinConversation?: (id: string) => void;
  onRefresh?: () => void;
  onStartCapture?: () => void;
  className?: string;
}

type SortOption = "newest" | "oldest" | "most_messages" | "recently_updated";
type FilterOption = "all" | "starred" | "pinned" | "archived";

export function ConversationsTab({
  conversations,
  isLoading = false,
  isCapturing = false,
  captureStatus = "idle",
  captureError = null,
  activeConversationId = null,
  onSelectConversation,
  onOpenConversation,
  onDeleteConversation,
  onStarConversation,
  onPinConversation,
  onRefresh,
  onStartCapture,
  className,
}: ConversationsTabProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [filterBy, setFilterBy] = useState<FilterOption>("all");
  const [platformFilter, setPlatformFilter] = useState<string[]>([]);
  const [showFilters, setShowFilters] = useState(false);

  // Get unique platforms
  const platforms = useMemo(() => {
    const unique = new Set(conversations.map((c) => c.platform));
    return Array.from(unique);
  }, [conversations]);

  // Filter and sort conversations
  const filteredConversations = useMemo(() => {
    let filtered = [...conversations];

    // Apply search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.title.toLowerCase().includes(query) ||
          c.summary.short.toLowerCase().includes(query) ||
          c.model.toLowerCase().includes(query)
      );
    }

    // Apply filter
    switch (filterBy) {
      case "starred":
        filtered = filtered.filter((c) => c.isStarred);
        break;
      case "pinned":
        filtered = filtered.filter((c) => c.isPinned);
        break;
      case "archived":
        filtered = filtered.filter((c) => c.isArchived);
        break;
    }

    // Apply platform filter
    if (platformFilter.length > 0) {
      filtered = filtered.filter((c) => platformFilter.includes(c.platform));
    }

    // Apply sort
    switch (sortBy) {
      case "newest":
        filtered.sort((a, b) => b.createdAt - a.createdAt);
        break;
      case "oldest":
        filtered.sort((a, b) => a.createdAt - b.createdAt);
        break;
      case "most_messages":
        filtered.sort((a, b) => b.messageCount - a.messageCount);
        break;
      case "recently_updated":
        filtered.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
    }

    return filtered;
  }, [conversations, searchQuery, sortBy, filterBy, platformFilter]);

  // Stats
  const stats = useMemo(
    () => ({
      total: conversations.length,
      starred: conversations.filter((c) => c.isStarred).length,
      pinned: conversations.filter((c) => c.isPinned).length,
      totalMessages: conversations.reduce((sum, c) => sum + c.messageCount, 0),
    }),
    [conversations]
  );

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5 text-primary" />
          <h2 className="font-semibold">Conversations</h2>
          <span className="text-sm text-muted-foreground">
            ({stats.total})
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Capture Status */}
          {captureStatus !== "idle" && (
            <div
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-xs",
                captureStatus === "capturing" && "bg-green-500/10 text-green-600",
                captureStatus === "detecting" && "bg-yellow-500/10 text-yellow-600",
                captureStatus === "error" && "bg-red-500/10 text-red-600"
              )}
            >
              {captureStatus === "capturing" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Capturing
                </>
              )}
              {captureStatus === "detecting" && (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Detecting
                </>
              )}
              {captureStatus === "error" && (
                <>
                  <AlertCircle className="w-3 h-3" />
                  Error
                </>
              )}
            </div>
          )}

          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="p-2 rounded-lg hover:bg-muted transition-colors"
          >
            <RefreshCw
              className={cn("w-4 h-4", isLoading && "animate-spin")}
            />
          </button>

          <button
            onClick={onStartCapture}
            disabled={isCapturing}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            <Plus className="w-4 h-4" />
            Capture
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {captureError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" />
          {captureError}
        </div>
      )}

      {/* Search and Filters */}
      <div className="p-4 space-y-3 border-b">
        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
              showFilters ? "bg-primary/10 text-primary" : "hover:bg-muted"
            )}
          >
            <Filter className="w-3 h-3" />
            Filters
          </button>

          <div className="flex items-center gap-1 ml-auto">
            {/* Quick Filters */}
            <button
              onClick={() => setFilterBy(filterBy === "starred" ? "all" : "starred")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                filterBy === "starred"
                  ? "bg-yellow-500/10 text-yellow-600"
                  : "hover:bg-muted"
              )}
            >
              <Star className="w-3 h-3" />
              {stats.starred}
            </button>
            <button
              onClick={() => setFilterBy(filterBy === "pinned" ? "all" : "pinned")}
              className={cn(
                "flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors",
                filterBy === "pinned"
                  ? "bg-primary/10 text-primary"
                  : "hover:bg-muted"
              )}
            >
              <Pin className="w-3 h-3" />
              {stats.pinned}
            </button>
          </div>

          {/* Sort */}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortOption)}
            className="px-2 py-1 rounded border text-xs bg-background"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_messages">Most Messages</option>
            <option value="recently_updated">Recently Updated</option>
          </select>
        </div>

        {/* Expanded Filters */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-2 space-y-2">
                {/* Platform Filter */}
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">
                    Platform
                  </label>
                  <div className="flex flex-wrap gap-1">
                    {platforms.map((platform) => (
                      <button
                        key={platform}
                        onClick={() => {
                          setPlatformFilter((prev) =>
                            prev.includes(platform)
                              ? prev.filter((p) => p !== platform)
                              : [...prev, platform]
                          );
                        }}
                        className={cn(
                          "px-2 py-1 rounded text-xs transition-colors",
                          platformFilter.includes(platform)
                            ? "bg-primary text-primary-foreground"
                            : "bg-muted hover:bg-muted/80"
                        )}
                      >
                        {platform}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Conversation List */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        ) : filteredConversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center">
            <MessageSquare className="w-12 h-12 text-muted-foreground/50 mb-3" />
            <p className="text-muted-foreground">
              {searchQuery
                ? "No conversations match your search"
                : "No conversations yet"}
            </p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Click "Capture" to start capturing AI conversations
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <AnimatePresence mode="popLayout">
              {filteredConversations.map((conversation) => (
                <ConversationCard
                  key={conversation.id}
                  conversation={conversation}
                  isActive={activeConversationId === conversation.id}
                  onClick={() => onSelectConversation?.(conversation.id)}
                  onOpen={() => onOpenConversation?.(conversation.id)}
                  onDelete={() => onDeleteConversation?.(conversation.id)}
                  onStar={() => onStarConversation?.(conversation.id)}
                  onPin={() => onPinConversation?.(conversation.id)}
                />
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
