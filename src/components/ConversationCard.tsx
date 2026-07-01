/**
 * ConversationCard — Displays a captured conversation in the Conversations tab.
 */

import React from "react";
import { motion } from "framer-motion";
import {
  MessageSquare,
  Code,
  Image,
  Star,
  Pin,
  Trash2,
  ExternalLink,
  Clock,
  Hash,
} from "lucide-react";
import type { UniversalConversation } from "@/models/universal-conversation";
import { cn } from "../lib/utils";

interface ConversationCardProps {
  conversation: UniversalConversation;
  isActive?: boolean;
  onClick?: () => void;
  onOpen?: () => void;
  onDelete?: () => void;
  onStar?: () => void;
  onPin?: () => void;
  className?: string;
}

const platformIcons: Record<string, React.ReactNode> = {
  Claude: <div className="w-4 h-4 rounded bg-orange-500" />,
  ChatGPT: <div className="w-4 h-4 rounded bg-green-500" />,
  Gemini: <div className="w-4 h-4 rounded bg-blue-500" />,
  Grok: <div className="w-4 h-4 rounded bg-gray-700" />,
};

export function ConversationCard({
  conversation,
  isActive = false,
  onClick,
  onOpen,
  onDelete,
  onStar,
  onPin,
  className,
}: ConversationCardProps) {
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const formatModel = (model: string) => {
    if (model.includes("Claude")) return model.replace("Claude ", "");
    if (model.includes("GPT")) return model;
    if (model.includes("Gemini")) return model.replace("Gemini ", "G");
    return model;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      whileHover={{ scale: 1.01 }}
      className={cn(
        "group relative rounded-lg border p-4 transition-all cursor-pointer",
        isActive
          ? "border-primary bg-primary/5 shadow-sm"
          : "border-border hover:border-primary/50 hover:bg-muted/50",
        className
      )}
      onClick={onClick}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          {/* Platform Icon */}
          <div className="flex-shrink-0">
            {platformIcons[conversation.platform] || (
              <div className="w-4 h-4 rounded bg-gray-400" />
            )}
          </div>

          {/* Title */}
          <h3 className="font-medium text-sm truncate">
            {conversation.title}
          </h3>

          {/* Badges */}
          {conversation.isPinned && (
            <Pin className="w-3 h-3 text-primary flex-shrink-0" />
          )}
          {conversation.isStarred && (
            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500 flex-shrink-0" />
          )}
        </div>

        {/* Hover Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onStar?.();
            }}
            className="p-1 rounded hover:bg-muted"
          >
            <Star
              className={cn(
                "w-3.5 h-3.5",
                conversation.isStarred
                  ? "text-yellow-500 fill-yellow-500"
                  : "text-muted-foreground"
              )}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onPin?.();
            }}
            className="p-1 rounded hover:bg-muted"
          >
            <Pin
              className={cn(
                "w-3.5 h-3.5",
                conversation.isPinned
                  ? "text-primary"
                  : "text-muted-foreground"
              )}
            />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onOpen?.();
            }}
            className="p-1 rounded hover:bg-muted"
          >
            <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.();
            }}
            className="p-1 rounded hover:bg-destructive/10"
          >
            <Trash2 className="w-3.5 h-3.5 text-muted-foreground hover:text-destructive" />
          </button>
        </div>
      </div>

      {/* Summary */}
      <p className="text-xs text-muted-foreground line-clamp-2 mb-3">
        {conversation.summary?.short || conversation.summary?.medium || "No summary available"}
      </p>

      {/* Meta Row */}
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {/* Model */}
        <span className="flex items-center gap-1">
          <span className="font-medium">{formatModel(conversation.model)}</span>
        </span>

        {/* Messages */}
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {conversation.messageCount}
        </span>

        {/* Code Blocks */}
        {conversation.stats.totalCodeBlocks > 0 && (
          <span className="flex items-center gap-1">
            <Code className="w-3 h-3" />
            {conversation.stats.totalCodeBlocks}
          </span>
        )}

        {/* Attachments */}
        {conversation.stats.totalAttachments > 0 && (
          <span className="flex items-center gap-1">
            <Image className="w-3 h-3" />
            {conversation.stats.totalAttachments}
          </span>
        )}

        {/* Time */}
        <span className="flex items-center gap-1 ml-auto">
          <Clock className="w-3 h-3" />
          {formatDate(conversation.updatedAt)}
        </span>
      </div>

      {/* Tags */}
      {conversation.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {conversation.tags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground"
            >
              <Hash className="w-2.5 h-2.5" />
              {tag}
            </span>
          ))}
          {conversation.tags.length > 3 && (
            <span className="text-[10px] text-muted-foreground">
              +{conversation.tags.length - 3}
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
