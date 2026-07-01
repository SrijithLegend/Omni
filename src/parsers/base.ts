/**
 * Base Platform Parser — Interface for all AI platform parsers.
 *
 * Each platform (Claude, ChatGPT, Gemini, Grok) implements this interface.
 * Adding a new platform only requires implementing a new parser.
 */

import type { UUID, Platform } from "../types/omni";
import type {
  UniversalConversation,
  UniversalMessage,
  CodeBlock,
  MessageAttachment,
  ConversationMetadata,
} from "../models/universal-conversation";

/**
 * Parser result containing the parsed conversation and any warnings.
 */
export interface ParserResult<T> {
  success: boolean;
  data?: T;
  warnings?: string[];
  errors?: string[];
}

/**
 * Platform detection result.
 */
export interface DetectionResult {
  detected: boolean;
  platform: Platform;
  confidence: number; // 0-1
  url: string;
  title?: string;
}

/**
 * Conversation extraction context.
 */
export interface ExtractionContext {
  url: string;
  projectId?: UUID;
  includeCodeBlocks: boolean;
  includeAttachments: boolean;
  includeImages: boolean;
  maxMessages?: number;
}

/**
 * Base parser interface that all platform parsers must implement.
 */
export abstract class BasePlatformParser {
  abstract readonly platform: Platform;
  abstract readonly hostname: string;
  abstract readonly aliases: string[];

  /**
   * Detect if this parser can handle the current page.
   */
  abstract detect(url: string, hostname: string): DetectionResult;

  /**
   * Extract the full conversation from the page.
   */
  abstract extractConversation(
    context: ExtractionContext,
  ): Promise<ParserResult<UniversalConversation>>;

  /**
   * Extract all messages from the page.
   */
  abstract extractMessages(
    conversationId: UUID,
    context: ExtractionContext,
  ): Promise<ParserResult<UniversalMessage[]>>;

  /**
   * Extract conversation metadata.
   */
  abstract extractMetadata(url: string): Promise<ParserResult<ConversationMetadata>>;

  /**
   * Extract the model name/ID being used.
   */
  abstract extractModel(): Promise<string>;

  /**
   * Extract the conversation title.
   */
  abstract extractTitle(): Promise<string>;

  /**
   * Extract attachments from a message element.
   */
  abstract extractAttachments(element: Element): MessageAttachment[];

  /**
   * Extract code blocks from a message element.
   */
  abstract extractCodeBlocks(element: Element): CodeBlock[];

  /**
   * Validate the parsed conversation.
   */
  validate(conversation: UniversalConversation): boolean {
    if (!conversation.id) return false;
    if (!conversation.platform) return false;
    if (!conversation.messages || conversation.messages.length === 0) return false;
    if (!conversation.url) return false;
    return true;
  }

  /**
   * Get the platform-specific selectors for message containers.
   */
  abstract getMessageSelectors(): string[];

  /**
   * Get the platform-specific selectors for user messages.
   */
  abstract getUserMessageSelectors(): string[];

  /**
   * Get the platform-specific selectors for assistant messages.
   */
  abstract getAssistantMessageSelectors(): string[];

  /**
   * Check if a URL matches this parser's platform.
   */
  matchesUrl(_url: string, hostname: string): boolean {
    const normalizedHostname = hostname.toLowerCase();
    if (normalizedHostname === this.hostname.toLowerCase()) return true;
    for (const alias of this.aliases) {
      if (normalizedHostname.includes(alias.toLowerCase())) return true;
    }
    return false;
  }

  /**
   * Wait for an element to appear in the DOM.
   */
  protected waitForElement(
    selector: string,
    timeout: number = 5000,
  ): Promise<Element | null> {
    return new Promise((resolve) => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
        return;
      }

      const observer = new MutationObserver(() => {
        const el = document.querySelector(selector);
        if (el) {
          observer.disconnect();
          resolve(el);
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      setTimeout(() => {
        observer.disconnect();
        resolve(null);
      }, timeout);
    });
  }

  /**
   * Debounce a function call.
   */
  protected debounce<T extends (...args: any[]) => void>(
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
   * Throttle a function call.
   */
  protected throttle<T extends (...args: any[]) => void>(
    fn: T,
    limit: number,
  ): (...args: Parameters<T>) => void {
    let inThrottle = false;
    return (...args: Parameters<T>) => {
      if (!inThrottle) {
        fn(...args);
        inThrottle = true;
        setTimeout(() => {
          inThrottle = false;
        }, limit);
      }
    };
  }

  /**
   * Clean up text content (remove extra whitespace, etc.).
   */
  protected cleanText(text: string): string {
    return text
      .replace(/\s+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /**
   * Check if an element is visible.
   */
  protected isVisible(element: Element): boolean {
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  /**
   * Generate a hash for a message (for deduplication).
   */
  protected hashMessage(content: string, role: string): string {
    let hash = 0;
    const str = `${role}:${content}`;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash + char) | 0;
    }
    return Math.abs(hash).toString(16);
  }
}

/**
 * Parser registry — manages all platform parsers.
 */
export class ParserRegistry {
  private parsers: Map<Platform, BasePlatformParser> = new Map();

  register(parser: BasePlatformParser): void {
    this.parsers.set(parser.platform, parser);
  }

  get(platform: Platform): BasePlatformParser | undefined {
    return this.parsers.get(platform);
  }

  detect(url: string, hostname: string): DetectionResult | null {
    for (const parser of this.parsers.values()) {
      const result = parser.detect(url, hostname);
      if (result.detected && result.confidence > 0.5) {
        return result;
      }
    }
    return null;
  }

  getAll(): BasePlatformParser[] {
    return Array.from(this.parsers.values());
  }
}

// Global parser registry
export const parserRegistry = new ParserRegistry();
