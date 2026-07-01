/**
 * Conversation Capture Engine — Watches AI platforms and captures conversations.
 *
 * Responsibilities:
 * - Detect supported AI websites
 * - Detect active conversation
 * - Watch for new messages via MutationObserver
 * - Detect edits, regenerations, deletions
 * - Track conversation changes efficiently
 * - Auto-save when configured
 */

import { BaseEngine } from "./base";
import type { Platform } from "../types/omni";
import type {
  UniversalConversation,
  UniversalMessage,
} from "../models/universal-conversation";
import {
  createUniversalConversation,
  recalculateStats,
} from "../models/universal-conversation";
import { parserRegistry, type DetectionResult, type ExtractionContext } from "../parsers";

export interface CaptureConfig {
  enabled: boolean;
  autoSave: boolean;
  captureCodeBlocks: boolean;
  captureAttachments: boolean;
  captureImages: boolean;
  debounceMs: number;
  maxMessagesPerCapture: number;
}

export interface ActiveCapture {
  conversationId: string;
  projectId: string | null;
  platform: Platform;
  url: string;
  startedAt: number;
  lastUpdateAt: number;
  messageCount: number;
  conversation: UniversalConversation;
}

export interface CaptureEvent {
  type: "detected" | "captured" | "updated" | "edited" | "regenerated" | "deleted" | "error";
  conversationId: string;
  platform: Platform;
  url: string;
  data?: unknown;
  timestamp: number;
}

const DEFAULT_CAPTURE_CONFIG: CaptureConfig = {
  enabled: true,
  autoSave: true,
  captureCodeBlocks: true,
  captureAttachments: true,
  captureImages: true,
  debounceMs: 500,
  maxMessagesPerCapture: 0, // 0 = no limit
};

export class ConversationCaptureEngine extends BaseEngine {
  private config: CaptureConfig;
  private activeCaptures: Map<string, ActiveCapture> = new Map();
  private observers: Map<string, MutationObserver> = new Map();
  private debounceTimers: Map<string, number> = new Map();
  private currentPlatform: Platform | null = null;
  private currentUrl: string | null = null;
  private detectionResult: DetectionResult | null = null;

  constructor(config: Partial<CaptureConfig> = {}) {
    super({ name: "ConversationCaptureEngine", version: "1.0.0", debug: false });
    this.config = { ...DEFAULT_CAPTURE_CONFIG, ...config };
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.log("info", "Conversation Capture Engine started");
    this.emit("ready");
  }

  async stop(): Promise<void> {
    // Disconnect all observers
    for (const observer of this.observers.values()) {
      observer.disconnect();
    }
    this.observers.clear();

    // Clear timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();

    this.activeCaptures.clear();
    this.currentPlatform = null;
    this.currentUrl = null;
    this.detectionResult = null;

    this.isRunning = false;
    this.log("info", "Conversation Capture Engine stopped");
  }

  async health(): Promise<import("./base").HealthStatus> {
    return {
      ok: true,
      message: `Capturing: ${this.activeCaptures.size} active conversations`,
      timestamp: Date.now(),
    };
  }

  /**
   * Update capture configuration.
   */
  updateConfig(config: Partial<CaptureConfig>): void {
    this.config = { ...this.config, ...config };
    this.log("info", "Config updated:", this.config);
  }

  /**
   * Detect if current page is a supported AI platform.
   */
  detectPlatform(url: string, hostname: string): DetectionResult | null {
    const result = parserRegistry.detect(url, hostname);
    if (result) {
      this.currentPlatform = result.platform;
      this.currentUrl = url;
      this.detectionResult = result;
      this.log("info", `Detected platform: ${result.platform} (confidence: ${result.confidence})`);
    }
    return result;
  }

  /**
   * Start capturing a conversation.
   */
  async startCapture(
    url: string,
    projectId: string | null = null,
  ): Promise<ActiveCapture | null> {
    if (!this.config.enabled) {
      this.log("warn", "Capture is disabled");
      return null;
    }

    if (!this.detectionResult) {
      this.log("warn", "No platform detected");
      return null;
    }

    const parser = parserRegistry.get(this.detectionResult.platform);
    if (!parser) {
      this.log("error", "No parser for platform:", this.detectionResult.platform);
      return null;
    }

    try {
      // Extract the conversation
      const context: ExtractionContext = {
        url,
        projectId: projectId || undefined,
        includeCodeBlocks: this.config.captureCodeBlocks,
        includeAttachments: this.config.captureAttachments,
        includeImages: this.config.captureImages,
        maxMessages: this.config.maxMessagesPerCapture || 0,
      };

      const result = await parser.extractConversation(context);

      if (!result.success || !result.data) {
        this.log("error", "Failed to extract conversation:", result.errors?.join(", "));
        this.emitEvent("error", url, { errors: result.errors });
        return null;
      }

      const conversation = result.data;
      const activeCapture: ActiveCapture = {
        conversationId: conversation.id,
        projectId,
        platform: this.detectionResult.platform,
        url,
        startedAt: Date.now(),
        lastUpdateAt: Date.now(),
        messageCount: conversation.messages.length,
        conversation,
      };

      this.activeCaptures.set(conversation.id, activeCapture);

      // Set up observer for this conversation
      this.setupObserver(conversation.id, parser);

      this.emitEvent("captured", url, { conversation });

      if (this.config.autoSave) {
        this.emit("save", conversation);
      }

      this.log("info", `Started capture: ${conversation.id} (${conversation.messages.length} messages)`);
      return activeCapture;
    } catch (error) {
      this.log("error", "Capture error:", error);
      this.emitEvent("error", url, { error: error instanceof Error ? error.message : error });
      return null;
    }
  }

  /**
   * Stop capturing a conversation.
   */
  stopCapture(conversationId: string): void {
    const capture = this.activeCaptures.get(conversationId);
    if (!capture) return;

    // Disconnect observer
    const observer = this.observers.get(conversationId);
    if (observer) {
      observer.disconnect();
      this.observers.delete(conversationId);
    }

    // Clear debounce timer
    const timer = this.debounceTimers.get(conversationId);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(conversationId);
    }

    this.activeCaptures.delete(conversationId);
    this.log("info", `Stopped capture: ${conversationId}`);
  }

  /**
   * Get active capture by ID.
   */
  getCapture(conversationId: string): ActiveCapture | undefined {
    return this.activeCaptures.get(conversationId);
  }

  /**
   * Get all active captures.
   */
  getAllCaptures(): ActiveCapture[] {
    return Array.from(this.activeCaptures.values());
  }

  /**
   * Force refresh a capture.
   */
  async refreshCapture(conversationId: string): Promise<UniversalConversation | null> {
    const capture = this.activeCaptures.get(conversationId);
    if (!capture || !this.currentPlatform) return null;

    const parser = parserRegistry.get(this.currentPlatform);
    if (!parser) return null;

    const context: ExtractionContext = {
      url: capture.url,
      projectId: capture.projectId || undefined,
      includeCodeBlocks: this.config.captureCodeBlocks,
      includeAttachments: this.config.captureAttachments,
      includeImages: this.config.captureImages,
      maxMessages: this.config.maxMessagesPerCapture || 0,
    };

    const result = await parser.extractConversation(context);
    if (!result.success || !result.data) return null;

    // Detect changes between old and new
    const oldConversation = capture.conversation;
    const newConversation = result.data;

    const changes = this.detectChanges(oldConversation, newConversation);

    if (changes.hasChanges) {
      capture.conversation = newConversation;
      capture.lastUpdateAt = Date.now();
      capture.messageCount = newConversation.messages.length;

      this.emitEvent("updated", capture.url, {
        conversation: newConversation,
        changes: changes.changes,
      });

      if (this.config.autoSave) {
        this.emit("save", newConversation);
      }
    }

    return newConversation;
  }

  /**
   * Set up MutationObserver to watch for DOM changes.
   */
  private setupObserver(conversationId: string, parser: any): void {
    // Disconnect existing observer if any
    const existingObserver = this.observers.get(conversationId);
    if (existingObserver) {
      existingObserver.disconnect();
    }

    const capture = this.activeCaptures.get(conversationId);
    if (!capture) return;

    // Create debounced refresh handler
    const debouncedRefresh = this.debounce(() => {
      this.refreshCapture(conversationId);
    }, this.config.debounceMs);

    // Create observer
    const observer = new MutationObserver((mutations) => {
      // Check if mutations are relevant to conversation
      const isRelevant = mutations.some((mutation) => {
        // Skip if not childList or characterData
        if (mutation.type !== "childList" && mutation.type !== "characterData") {
          return false;
        }

        // Check if added nodes are messages
        for (const node of mutation.addedNodes) {
          if (node instanceof Element) {
            const isMessage = parser.getMessageSelectors().some((sel: string) =>
              node.matches(sel) || node.querySelector(sel)
            );
            if (isMessage) return true;
          }
        }

        return false;
      });

      if (isRelevant) {
        this.log("debug", "Relevant mutation detected");
        debouncedRefresh();
      }
    });

    // Find the conversation container
    const selectors = parser.getMessageSelectors();
    let container: Element | null = null;

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el) {
        container = el.closest("div, main, article") || document.body;
        break;
      }
    }

    if (!container) {
      container = document.body;
    }

    // Start observing
    observer.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    this.observers.set(conversationId, observer);
    this.log("debug", "Observer setup complete for:", conversationId);
  }

  /**
   * Detect changes between two conversation versions.
   */
  private detectChanges(
    oldConv: UniversalConversation,
    newConv: UniversalConversation,
  ): { hasChanges: boolean; changes: ChangeType[] } {
    const changes: ChangeType[] = [];

    // Check message count
    if (oldConv.messages.length !== newConv.messages.length) {
      changes.push({
        type: "message_count",
        old: oldConv.messages.length,
        new: newConv.messages.length,
      });
    }

    // Check for new messages
    const oldIds = new Set(oldConv.messages.map((m) => m.id));
    const newIds = new Set(newConv.messages.map((m) => m.id));

    for (const id of newIds) {
      if (!oldIds.has(id)) {
        changes.push({ type: "new_message", messageId: id });
      }
    }

    // Check for deleted messages
    for (const id of oldIds) {
      if (!newIds.has(id)) {
        changes.push({ type: "deleted_message", messageId: id });
      }
    }

    // Check for edited messages
    const oldMessageMap = new Map(oldConv.messages.map((m) => [m.id, m]));
    const newMessageMap = new Map(newConv.messages.map((m) => [m.id, m]));

    for (const [id, newMsg] of newMessageMap) {
      const oldMsg = oldMessageMap.get(id);
      if (oldMsg && oldMsg.content !== newMsg.content) {
        changes.push({
          type: "edited_message",
          messageId: id,
          oldContent: oldMsg.content,
          newContent: newMsg.content,
        });
      }
    }

    // Check title
    if (oldConv.title !== newConv.title) {
      changes.push({
        type: "title_changed",
        old: oldConv.title,
        new: newConv.title,
      });
    }

    return {
      hasChanges: changes.length > 0,
      changes,
    };
  }

  /**
   * Emit a capture event.
   */
  private emitEvent(
    type: CaptureEvent["type"],
    url: string,
    data?: unknown,
  ): void {
    const event: CaptureEvent = {
      type,
      conversationId: this.activeCaptures.values().next().value?.conversationId || "",
      platform: this.currentPlatform || "Other",
      url,
      data,
      timestamp: Date.now(),
    };
    this.emit("event", event);
  }

  /**
   * Debounce helper.
   */
  private debounce<T extends (...args: any[]) => void>(
    fn: T,
    delay: number,
  ): (...args: Parameters<T>) => void {
    let timeoutId: number | undefined;
    return (...args: Parameters<T>) => {
      clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => fn(...args), delay);
    };
  }

  /**
   * Get current detection result.
   */
  getDetection(): DetectionResult | null {
    return this.detectionResult;
  }

  /**
   * Check if currently capturing.
   */
  isCapturing(): boolean {
    return this.activeCaptures.size > 0;
  }

  /**
   * Get current platform.
   */
  getCurrentPlatform(): Platform | null {
    return this.currentPlatform;
  }
}

interface ChangeType {
  type: string;
  [key: string]: unknown;
}
