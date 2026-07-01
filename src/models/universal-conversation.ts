/**
 * Universal Conversation Model — Standardized format for all AI platforms.
 *
 * Every captured conversation from Claude, ChatGPT, Gemini, Grok, etc.
 * is converted to this common schema for unified handling.
 */

import type { UUID, Timestamp, Platform } from "../types/omni";

/**
 * Supported AI platforms for conversation capture.
 */
export type SupportedPlatform =
  | "Claude"
  | "ChatGPT"
  | "Gemini"
  | "Grok"
  | "Perplexity"
  | "DeepSeek"
  | "Copilot"
  | "AIStudio"
  | "Other";

/**
 * Message role in a conversation.
 */
export type MessageRole = "user" | "assistant" | "system" | "tool";

/**
 * A code block extracted from a message.
 */
export interface CodeBlock {
  id: UUID;
  language: string;
  code: string;
  lineCount: number;
  filename?: string;
  metadata: Record<string, unknown>;
}

/**
 * An attachment in a message (image, file, etc.).
 */
export interface MessageAttachment {
  id: UUID;
  type: "image" | "file" | "link" | "audio" | "video";
  url?: string;
  name?: string;
  size?: number;
  mimeType?: string;
  thumbnail?: string;
}

/**
 * A citation or reference in a message.
 */
export interface MessageCitation {
  id: UUID;
  type: "source" | "reference" | "footnote";
  text: string;
  url?: string;
  number?: number;
}

/**
 * A single message in a conversation.
 */
export interface UniversalMessage {
  id: UUID;
  conversationId: UUID;
  role: MessageRole;
  content: string;
  timestamp: Timestamp;
  platform: Platform;
  modelUsed?: string;

  // Extracted content
  codeBlocks: CodeBlock[];
  attachments: MessageAttachment[];
  citations: MessageCitation[];

  // Token tracking (future)
  tokenCount?: number;
  inputTokens?: number;
  outputTokens?: number;

  // Message state
  isEdited: boolean;
  isRegenerated: boolean;
  isDeleted: boolean;
  editedAt?: Timestamp;
  originalContent?: string;

  // Metadata
  metadata: MessageMetadata;
}

/**
 * Metadata for a message.
 */
export interface MessageMetadata {
  hasCode: boolean;
  hasImages: boolean;
  hasLinks: boolean;
  hasMath: boolean;
  hasTables: boolean;
  hasLists: boolean;
  wordCount: number;
  charCount: number;
}

/**
 * Conversation summary at different detail levels.
 */
export interface ConversationSummary {
  short: string;     // 1-2 sentences
  medium: string;     // 1 paragraph
  detailed: string;   // Multiple paragraphs

  // Extracted insights
  goals: string[];
  decisions: string[];
  actionItems: string[];
  technologies: string[];
  libraries: string[];
  frameworks: string[];
  languages: string[];
  files: string[];
  urls: string[];
  futureTasks: string[];
  questions: string[];
  risks: string[];
  unknowns: string[];
}

/**
 * Universal Conversation — The canonical format for all AI conversations.
 */
export interface UniversalConversation {
  id: UUID;
  projectId: UUID | null;
  platform: Platform;
  model: string;
  title: string;
  url: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
  messageCount: number;
  summary: ConversationSummary;
  tags: string[];

  // Messages
  messages: UniversalMessage[];

  // Conversation state
  isStarred: boolean;
  isPinned: boolean;
  isArchived: boolean;
  isDeleted: boolean;
  deletedAt?: Timestamp;

  // Capture metadata
  captureMethod: "auto" | "manual" | "paste";
  lastCaptureAt: Timestamp;
  captureVersion: number;

  // Statistics
  stats: ConversationStats;

  // Raw metadata from platform
  metadata: ConversationMetadata;
}

/**
 * Statistics for a conversation.
 */
export interface ConversationStats {
  totalMessages: number;
  userMessages: number;
  assistantMessages: number;
  systemMessages: number;
  totalCodeBlocks: number;
  totalAttachments: number;
  totalCitations: number;
  totalTokens: number;
  totalChars: number;
  estimatedReadTime: number; // minutes
  codeLanguages: string[];
  mentionedTechnologies: string[];
}

/**
 * Platform-specific metadata.
 */
export interface ConversationMetadata {
  platformVersion?: string;
  conversationId?: string; // Platform's internal ID
  modelId?: string;
  modelVersion?: string;
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  customInstructions?: string;
  artifacts?: string[];

  // Platform detection
  detectedUrl: string;
  hostname: string;
  pathname: string;

  // Raw data (never exposed to UI, only for debugging)
  rawSelectors?: string[];
}

/**
 * Context Package — Structured context for AI continuation.
 */
export interface ContextPackage {
  conversationId: UUID;
  projectId: UUID | null;

  // Context layers
  conversationContext: {
    summary: ConversationSummary;
    recentMessages: UniversalMessage[];
    keyExchanges: UniversalMessage[];
    openQuestions: string[];
  };

  // Project context
  projectContext?: {
    name: string;
    description: string;
    goals: string[];
    technologies: string[];
    decisions: string[];
    currentPhase: string;
  };

  // AI-ready context string
  formattedContext: string;

  // Metadata
  generatedAt: Timestamp;
  tokenCount: number;
  format: "detailed" | "concise" | "minimal";
}

// ============== Factory Functions ==============

/**
 * Create a new empty conversation summary.
 */
export function createEmptySummary(): ConversationSummary {
  return {
    short: "",
    medium: "",
    detailed: "",
    goals: [],
    decisions: [],
    actionItems: [],
    technologies: [],
    libraries: [],
    frameworks: [],
    languages: [],
    files: [],
    urls: [],
    futureTasks: [],
    questions: [],
    risks: [],
    unknowns: [],
  };
}

/**
 * Create empty message metadata.
 */
export function createEmptyMessageMetadata(): MessageMetadata {
  return {
    hasCode: false,
    hasImages: false,
    hasLinks: false,
    hasMath: false,
    hasTables: false,
    hasLists: false,
    wordCount: 0,
    charCount: 0,
  };
}

/**
 * Create empty conversation stats.
 */
export function createEmptyStats(): ConversationStats {
  return {
    totalMessages: 0,
    userMessages: 0,
    assistantMessages: 0,
    systemMessages: 0,
    totalCodeBlocks: 0,
    totalAttachments: 0,
    totalCitations: 0,
    totalTokens: 0,
    totalChars: 0,
    estimatedReadTime: 0,
    codeLanguages: [],
    mentionedTechnologies: [],
  };
}

/**
 * Create a new universal message.
 */
export function createUniversalMessage(
  conversationId: UUID,
  role: MessageRole,
  content: string,
  platform: Platform,
  timestamp?: Timestamp,
): UniversalMessage {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    conversationId,
    role,
    content,
    timestamp: timestamp ?? now,
    platform,
    codeBlocks: [],
    attachments: [],
    citations: [],
    isEdited: false,
    isRegenerated: false,
    isDeleted: false,
    metadata: createEmptyMessageMetadata(),
  };
}

/**
 * Create a new universal conversation.
 */
export function createUniversalConversation(
  platform: Platform,
  url: string,
  title: string,
  model: string,
  projectId?: UUID,
): UniversalConversation {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    projectId: projectId ?? null,
    platform,
    model,
    title,
    url,
    createdAt: now,
    updatedAt: now,
    messageCount: 0,
    summary: createEmptySummary(),
    tags: [],
    messages: [],
    isStarred: false,
    isPinned: false,
    isArchived: false,
    isDeleted: false,
    captureMethod: "manual",
    lastCaptureAt: now,
    captureVersion: 1,
    stats: createEmptyStats(),
    metadata: {
      detectedUrl: url,
      hostname: new URL(url).hostname,
      pathname: new URL(url).pathname,
    },
  };
}

// ============== Utility Functions ==============

/**
 * Extract code blocks from text content.
 */
export function extractCodeBlocks(content: string): CodeBlock[] {
  const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
  const blocks: CodeBlock[] = [];
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const language = (match[1] ?? "text").toLowerCase();
    const code = match[2];
    const lines = code.split("\n").length;

    blocks.push({
      id: crypto.randomUUID(),
      language,
      code,
      lineCount: lines,
      metadata: {},
    });
  }

  return blocks;
}

/**
 * Extract links from text content.
 */
export function extractLinks(content: string): string[] {
  const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  const links: string[] = [];
  let match;

  while ((match = linkRegex.exec(content)) !== null) {
    links.push(match[2]);
  }

  return links;
}

/**
 * Check if content has tables.
 */
export function hasTables(content: string): boolean {
  return /^\|.*\|$/m.test(content);
}

/**
 * Check if content has math.
 */
export function hasMath(content: string): boolean {
  return /\$\$[\s\S]*?\$\$|\$[^$]+\$/.test(content);
}

/**
 * Check if content has lists.
 */
export function hasLists(content: string): boolean {
  return /^[-*+]\s|^(\d+)\.\s/m.test(content);
}

/**
 * Count words in text.
 */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Calculate estimated read time in minutes.
 */
export function calculateReadTime(charCount: number): number {
  // Average reading speed: ~200 words per minute
  // Average word length: ~5 characters
  const wordsPerMinute = 200;
  const avgWordLength = 5;
  const wordCount = charCount / avgWordLength;
  return Math.max(1, Math.ceil(wordCount / wordsPerMinute));
}

/**
 * Recalculate conversation statistics.
 */
export function recalculateStats(
  messages: UniversalMessage[],
): ConversationStats {
  const stats = createEmptyStats();

  for (const msg of messages) {
    stats.totalMessages++;
    if (msg.role === "user") stats.userMessages++;
    else if (msg.role === "assistant") stats.assistantMessages++;
    else if (msg.role === "system") stats.systemMessages++;

    stats.totalCodeBlocks += msg.codeBlocks.length;
    stats.totalAttachments += msg.attachments.length;
    stats.totalCitations += msg.citations.length;
    stats.totalChars += msg.content.length;
    stats.totalTokens += msg.tokenCount ?? 0;

    for (const block of msg.codeBlocks) {
      if (!stats.codeLanguages.includes(block.language)) {
        stats.codeLanguages.push(block.language);
      }
    }
  }

  stats.estimatedReadTime = calculateReadTime(stats.totalChars);
  return stats;
}
