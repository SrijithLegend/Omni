/**
 * Conversation Slice — State management for captured conversations.
 */

import type { UUID } from "../../types/omni";
import type {
  UniversalConversation,
  ConversationSummary,
  ConversationStats,
} from "../../models/universal-conversation";

export interface ConversationSlice {
  // All conversations
  conversations: UniversalConversation[];

  // Filtered/search results
  filteredConversations: UniversalConversation[];

  // Active conversation being viewed
  activeConversationId: UUID | null;

  // Project-scoped conversations
  projectConversations: Map<UUID, UniversalConversation[]>;

  // Search and filter state
  searchQuery: string;
  platformFilter: string[];
  dateFilter: {
    from?: number;
    to?: number;
  };
  sort: "newest" | "oldest" | "most_messages" | "recently_updated";

  // Statistics
  stats: ConversationSliceStats;

  // Loading states
  isLoading: boolean;
  isCapturing: boolean;
  captureStatus: "idle" | "detecting" | "capturing" | "error";
  captureError: string | null;

  // Selected conversations (for bulk operations)
  selectedIds: UUID[];
}

export interface ConversationSliceStats {
  totalConversations: number;
  totalMessages: number;
  conversationsByPlatform: Record<string, number>;
  conversationsByProject: Record<string, number>;
  totalCodeBlocks: number;
  totalAttachments: number;
}

export const initialConversationSlice: ConversationSlice = {
  conversations: [],
  filteredConversations: [],
  activeConversationId: null,
  projectConversations: new Map(),
  searchQuery: "",
  platformFilter: [],
  dateFilter: {},
  sort: "newest",
  stats: {
    totalConversations: 0,
    totalMessages: 0,
    conversationsByPlatform: {},
    conversationsByProject: {},
    totalCodeBlocks: 0,
    totalAttachments: 0,
  },
  isLoading: false,
  isCapturing: false,
  captureStatus: "idle",
  captureError: null,
  selectedIds: [],
};
