/**
 * ConversationDetails — Detailed view of a captured conversation.
 */

import React, { useMemo } from "react";
import { motion } from "framer-motion";
import { X, MessageSquare, Code, Image, Link, Clock, Hash, ExternalLink, Copy, FileText, Brain, Target, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Star, Pin, Trash2, Download, Share2 } from "lucide-react";
import type {
  UniversalConversation,
  UniversalMessage,
} from "@/models/universal-conversation";
import { cn } from "../lib/utils";

interface ConversationDetailsProps {
  conversation: UniversalConversation;
  onClose?: () => void;
  onStar?: () => void;
  onPin?: () => void;
  onDelete?: () => void;
  onExport?: () => void;
  onCopyContext?: () => void;
  className?: string;
}

const roleColors = {
  user: "bg-primary/10 border-primary/20",
  assistant: "bg-muted border-border",
  system: "bg-yellow-500/10 border-yellow-500/20",
  tool: "bg-blue-500/10 border-blue-500/20",
};

const roleLabels = {
  user: "You",
  assistant: "AI",
  system: "System",
  tool: "Tool",
};

export function ConversationDetails({
  conversation,
  onClose,
  onStar,
  onPin,
  onDelete,
  onExport,
  onCopyContext,
  className,
}: ConversationDetailsProps) {
  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  // Group messages by date
  const groupedMessages = useMemo(() => {
    const groups: Map<string, UniversalMessage[]> = new Map();

    for (const message of conversation.messages) {
      const date = new Date(message.timestamp).toLocaleDateString();
      if (!groups.has(date)) {
        groups.set(date, []);
      }
      groups.get(date)!.push(message);
    }

    return groups;
  }, [conversation.messages]);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className={cn("flex flex-col h-full bg-background", className)}
    >
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex items-center gap-2 min-w-0">
          <MessageSquare className="w-5 h-5 text-primary flex-shrink-0" />
          <h2 className="font-semibold truncate">{conversation.title}</h2>
        </div>

        <div className="flex items-center gap-1">
          {onStar && (
            <button
              onClick={onStar}
              className="p-2 rounded hover:bg-muted transition-colors"
            >
              <Star
                className={cn(
                  "w-4 h-4",
                  conversation.isStarred
                    ? "text-yellow-500 fill-yellow-500"
                    : "text-muted-foreground"
                )}
              />
            </button>
          )}
          {onPin && (
            <button
              onClick={onPin}
              className="p-2 rounded hover:bg-muted transition-colors"
            >
              <Pin
                className={cn(
                  "w-4 h-4",
                  conversation.isPinned
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              />
            </button>
          )}
          {onCopyContext && (
            <button
              onClick={onCopyContext}
              className="p-2 rounded hover:bg-muted transition-colors"
              title="Copy Context"
            >
              <Copy className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {onExport && (
            <button
              onClick={onExport}
              className="p-2 rounded hover:bg-muted transition-colors"
              title="Export"
            >
              <Download className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              className="p-2 rounded hover:bg-destructive/10 transition-colors"
              title="Delete"
            >
              <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 rounded hover:bg-muted transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Meta Info */}
      <div className="flex items-center gap-4 px-4 py-2 text-xs text-muted-foreground border-b bg-muted/30">
        <span>{conversation.platform}</span>
        <span className="font-medium">{conversation.model}</span>
        <span className="flex items-center gap-1">
          <MessageSquare className="w-3 h-3" />
          {conversation.messageCount} messages
        </span>
        {conversation.stats.totalCodeBlocks > 0 && (
          <span className="flex items-center gap-1">
            <Code className="w-3 h-3" />
            {conversation.stats.totalCodeBlocks} code blocks
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {formatDate(conversation.updatedAt)}
        </span>
      </div>

      {/* Summary Section */}
      {conversation.summary && (
        <div className="p-4 border-b space-y-3">
          <div className="flex items-center gap-2">
            <Brain className="w-4 h-4 text-primary" />
            <h3 className="font-medium text-sm">Summary</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {conversation.summary.medium || conversation.summary.short}
          </p>

          {/* Extracted insights in compact grid */}
          <div className="grid grid-cols-2 gap-2">
            {conversation.summary.goals.length > 0 && (
              <div className="flex items-start gap-2">
                <Target className="w-3 h-3 mt-0.5 text-green-500" />
                <div className="text-xs">
                  <span className="font-medium">Goals: </span>
                  {conversation.summary.goals.slice(0, 2).join(", ")}
                </div>
              </div>
            )}
            {conversation.summary.decisions.length > 0 && (
              <div className="flex items-start gap-2">
                <CheckCircle className="w-3 h-3 mt-0.5 text-blue-500" />
                <div className="text-xs">
                  <span className="font-medium">Decisions: </span>
                  {conversation.summary.decisions.slice(0, 2).join(", ")}
                </div>
              </div>
            )}
            {conversation.summary.technologies.length > 0 && (
              <div className="flex items-start gap-2">
                <Code className="w-3 h-3 mt-0.5 text-purple-500" />
                <div className="text-xs">
                  <span className="font-medium">Tech: </span>
                  {conversation.summary.technologies.slice(0, 4).join(", ")}
                </div>
              </div>
            )}
            {conversation.summary.risks.length > 0 && (
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-3 h-3 mt-0.5 text-yellow-500" />
                <div className="text-xs">
                  <span className="font-medium">Risks: </span>
                  {conversation.summary.risks.slice(0, 2).join(", ")}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-auto">
        {Array.from(groupedMessages.entries()).map(([date, messages]) => (
          <div key={date}>
            {/* Date Separator */}
            <div className="sticky top-0 z-10 px-4 py-2 bg-muted/50 text-xs text-center text-muted-foreground">
              {date}
            </div>

            {/* Messages for this date */}
            {messages.map((message) => (
              <MessageBubble key={message.id} message={message} />
            ))}
          </div>
        ))}
      </div>

      {/* Footer Actions */}
      <div className="flex items-center justify-between p-4 border-t bg-muted/30">
        <div className="text-xs text-muted-foreground">
          {conversation.stats.totalChars.toLocaleString()} chars / ~
          {conversation.stats.estimatedReadTime} min read
        </div>

        <div className="flex items-center gap-2">
          <a
            href={conversation.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-3 py-1.5 rounded border text-xs hover:bg-muted transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            Open Original
          </a>
        </div>
      </div>
    </motion.div>
  );
}

function MessageBubble({ message }: { message: UniversalMessage }) {
  const isUser = message.role === "user";

  // Format message content with code blocks
  const renderContent = (content: string) => {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      // Add text before code block
      if (match.index > lastIndex) {
        const textPart = content.slice(lastIndex, match.index);
        parts.push(
          <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
            {textPart}
          </span>
        );
      }

      // Add code block
      const language = match[1] || "text";
      const code = match[2];
      parts.push(
        <pre
          key={`code-${match.index}`}
          className="my-2 p-3 rounded bg-muted overflow-x-auto"
        >
          <code className="text-xs">
            {language !== "text" && (
              <div className="text-xs text-muted-foreground mb-1">
                {language}
              </div>
            )}
            {code}
          </code>
        </pre>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${lastIndex}`} className="whitespace-pre-wrap">
          {content.slice(lastIndex)}
        </span>
      );
    }

    return parts;
  };

  return (
    <div
      className={cn(
        "px-4 py-3",
        isUser ? "bg-primary/5" : "bg-background"
      )}
    >
      <div className="max-w-3xl mx-auto">
        {/* Role indicator */}
        <div className="flex items-center gap-2 mb-1">
          <span
            className={cn(
              "text-xs font-medium",
              isUser ? "text-primary" : "text-muted-foreground"
            )}
          >
            {roleLabels[message.role]}
          </span>
          {message.isEdited && (
            <span className="text-xs text-muted-foreground">(edited)</span>
          )}
          {message.isRegenerated && (
            <span className="text-xs text-muted-foreground">(regenerated)</span>
          )}
          {message.modelUsed && (
            <span className="text-xs text-muted-foreground">
              [{message.modelUsed}]
            </span>
          )}
        </div>

        {/* Content */}
        <div className="text-sm leading-relaxed">
          {renderContent(message.content)}
        </div>

        {/* Code blocks list */}
        {message.codeBlocks.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {message.codeBlocks.map((block, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-muted"
              >
                <Code className="w-3 h-3" />
                {block.language}
                <span className="text-muted-foreground">
                  ({block.lineCount} lines)
                </span>
              </span>
            ))}
          </div>
        )}

        {/* Attachments */}
        {message.attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-2">
            {message.attachments.map((att, i) => (
              <div
                key={i}
                className="flex items-center gap-1 px-2 py-1 rounded border text-xs"
              >
                {att.type === "image" ? (
                  <Image className="w-3 h-3" />
                ) : (
                  <FileText className="w-3 h-3" />
                )}
                {att.name || att.type}
              </div>
            ))}
          </div>
        )}

        {/* Metadata */}
        <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
          <span>{new Date(message.timestamp).toLocaleTimeString()}</span>
          {message.metadata.hasCode && (
            <span className="flex items-center gap-0.5">
              <Code className="w-3 h-3" />
            </span>
          )}
          {message.metadata.hasImages && (
            <span className="flex items-center gap-0.5">
              <Image className="w-3 h-3" />
            </span>
          )}
          {message.metadata.hasLinks && (
            <span className="flex items-center gap-0.5">
              <Link className="w-3 h-3" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
