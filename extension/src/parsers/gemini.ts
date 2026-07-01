/**
 * Gemini Platform Parser — Captures conversations from gemini.google.com.
 *
 * Handles:
 * - Message extraction from Gemini's DOM structure
 * - Code block parsing with language detection
 * - Model identification (Gemini Pro, Gemini Ultra, etc.)
 * - Attachment and image extraction
 */

import {
  BasePlatformParser,
  type DetectionResult,
  type ExtractionContext,
  type ParserResult,
} from "./base";
import type { Platform } from "../types/omni";
import type {
  UniversalConversation,
  UniversalMessage,
  CodeBlock,
  MessageAttachment,
  ConversationMetadata,
} from "../models/universal-conversation";
import {
  createUniversalConversation,
  createUniversalMessage,
  extractCodeBlocks,
  extractLinks,
  hasTables,
  hasMath,
  hasLists,
  countWords,
  recalculateStats,
} from "../models/universal-conversation";

export class GeminiParser extends BasePlatformParser {
  readonly platform: Platform = "Gemini";
  readonly hostname = "gemini.google.com";
  readonly aliases = ["gemini.google.com", "bard.google.com", "ai.google"];

  private readonly SELECTORS = {
    // Conversation structure
    conversationContainer: 'main, [data-conversation], .conversation-container',
    messagesContainer: '.conversation-turn, [data-turn], .turn-container',
    messagesWrapper: '.response, .query, [data-message]',

    // Message elements (Gemini uses query/response pattern)
    userMessage: '.query, [data-role="user"], .user-input, [data-query]',
    assistantMessage: '.response, [data-role="model"], .model-response, [data-response]',

    // Content areas
    messageContent: '.message-content, .markdown, [data-content]',
    codeBlock: 'pre code, .code-block, [data-code]',

    // Model indicator
    modelSelector: '[data-model], .model-selector, [aria-label*="Model"]',
    modelBadge: '.model-badge, [data-model-name]',

    // Title
    titleSelector: 'h1, .title, [data-title]',

    // Attachments
    attachment: '.attachment, [data-attachment], [data-file]',
    imageAttachment: 'img, [data-image]',

    // Edit indicators
    editIndicator: '[data-edited]="true", .edited',

    // Regenerate
    regenerateButton: '[data-testid="regenerate"], .regenerate-btn',

    // Sidebar for conversation list
    conversationList: '.conversation-list, nav, [data-nav]',

    // Input
    inputArea: '.input-area, [data-input], textarea',

    // Google specific
    bardLogo: '.bard-logo, [data-logo]',
  };

  detect(url: string, hostname: string): DetectionResult {
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname.includes("gemini.google.com")) {
      return {
        detected: true,
        platform: "Gemini",
        confidence: 0.98,
        url,
        title: document.title,
      };
    }

    if (normalizedHostname.includes("bard.google.com")) {
      return {
        detected: true,
        platform: "Gemini",
        confidence: 0.95,
        url,
        title: document.title,
      };
    }

    if (normalizedHostname.includes("ai.google")) {
      return {
        detected: true,
        platform: "Gemini",
        confidence: 0.8,
        url,
        title: document.title,
      };
    }

    return {
      detected: false,
      platform: "Gemini",
      confidence: 0,
      url,
    };
  }

  async extractConversation(
    context: ExtractionContext,
  ): Promise<ParserResult<UniversalConversation>> {
    try {
      const messagesResult = await this.extractMessages(
        crypto.randomUUID(),
        context,
      );

      if (!messagesResult.success || !messagesResult.data) {
        return { success: false, errors: messagesResult.errors };
      }

      const model = await this.extractModel();
      const title = await this.extractTitle();

      const conversation = createUniversalConversation(
        this.platform,
        context.url,
        title,
        model,
        context.projectId,
      );

      conversation.messages = messagesResult.data;
      conversation.messageCount = messagesResult.data.length;
      conversation.stats = recalculateStats(messagesResult.data);

      if (!this.validate(conversation)) {
        return { success: false, errors: ["Validation failed"] };
      }

      return { success: true, data: conversation };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : "Unknown error"],
      };
    }
  }

  async extractMessages(
    conversationId: string,
    context: ExtractionContext,
  ): Promise<ParserResult<UniversalMessage[]>> {
    const messages: UniversalMessage[] = [];
    const warnings: string[] = [];

    try {
      // Wait for the conversation container
      await this.waitForElement(this.SELECTORS.conversationContainer.split(", ")[0], 3000);

      // Gemini uses `conversation-turn` elements
      const turns = document.querySelectorAll('.conversation-turn, [data-turn]');

      if (turns.length === 0) {
        // Fallback to query/response pattern
        const userMessages = document.querySelectorAll(this.SELECTORS.userMessage);
        const assistantMessages = document.querySelectorAll(this.SELECTORS.assistantMessage);

        if (userMessages.length === 0 && assistantMessages.length === 0) {
          const altMessages = await this.extractMessagesAlternative(conversationId, context);
          if (altMessages.length > 0) {
            return { success: true, data: altMessages, warnings };
          }
          return { success: false, errors: ["No messages found"] };
        }

        const allMessages = this.getMessagesInOrder(userMessages, assistantMessages);

        for (const msgData of allMessages) {
          if (context.maxMessages && messages.length >= context.maxMessages) break;
          const message = await this.parseMessageElement(
            msgData.element,
            conversationId,
            msgData.role,
            context,
          );
          if (message) messages.push(message);
        }
      } else {
        // Parse conversation turns
        for (let i = 0; i < turns.length; i++) {
          if (context.maxMessages && messages.length >= context.maxMessages) break;

          const turn = turns[i];

          // Each turn contains a query (user) and response (model)
          const queryEl = turn.querySelector('.query, [data-query], .user-input');
          const responseEl = turn.querySelector('.response, [data-response], .model-response');

          if (queryEl) {
            const message = await this.parseMessageElement(queryEl, conversationId, "user", context);
            if (message) messages.push(message);
          }

          if (responseEl) {
            const message = await this.parseMessageElement(responseEl, conversationId, "assistant", context);
            if (message) messages.push(message);
          }
        }
      }

      if (messages.length === 0) {
        return { success: false, errors: ["No messages extracted"] };
      }

      return { success: true, data: messages, warnings };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : "Extraction failed"],
      };
    }
  }

  private async parseMessageElement(
    element: Element,
    conversationId: string,
    role: "user" | "assistant" | "system",
    context: ExtractionContext,
  ): Promise<UniversalMessage | null> {
    const contentEl = element.querySelector(this.SELECTORS.messageContent);
    const content = this.cleanText((contentEl || element).textContent || "");

    if (!content || content.length < 1) return null;

    const message = createUniversalMessage(
      conversationId,
      role,
      content,
      this.platform,
    );

    // Extract code blocks
    if (context.includeCodeBlocks) {
      message.codeBlocks = this.extractCodeBlocks(element);
      message.metadata.hasCode = message.codeBlocks.length > 0;
    }

    // Extract attachments
    if (context.includeAttachments || context.includeImages) {
      message.attachments = this.extractAttachments(element);
      message.metadata.hasImages = message.attachments.some((a) => a.type === "image");
    }

    // Check for edits
    message.isEdited = !!element.querySelector(this.SELECTORS.editIndicator);

    // Metadata
    message.metadata.wordCount = countWords(content);
    message.metadata.charCount = content.length;
    message.metadata.hasLinks = extractLinks(content).length > 0;
    message.metadata.hasTables = hasTables(content);
    message.metadata.hasMath = hasMath(content);
    message.metadata.hasLists = hasLists(content);

    return message;
  }

  private getMessagesInOrder(
    userEls: NodeListOf<Element>,
    assistantEls: NodeListOf<Element>,
  ): { element: Element; role: "user" | "assistant" }[] {
    const messages: { element: Element; role: "user" | "assistant"; order: number }[] = [];

    userEls.forEach((el) => {
      messages.push({ element: el, role: "user", order: this.getElementOrder(el) });
    });

    assistantEls.forEach((el) => {
      messages.push({ element: el, role: "assistant", order: this.getElementOrder(el) });
    });

    return messages.sort((a, b) => a.order - b.order);
  }

  private getElementOrder(element: Element): number {
    const allElements = document.getElementsByTagName("*");
    for (let i = 0; i < allElements.length; i++) {
      if (allElements[i] === element) return i;
    }
    return 0;
  }

  private async extractMessagesAlternative(
    conversationId: string,
    context: ExtractionContext,
  ): Promise<UniversalMessage[]> {
    const messages: UniversalMessage[] = [];

    // Try finding any message-like elements
    const contentElements = document.querySelectorAll('.message, [data-message-content], .markdown');

    let isUserTurn = true;
    for (const el of contentElements) {
      const content = this.cleanText(el.textContent || "");
      if (content.length < 2) continue;

      // Skip UI elements
      if (content.includes("Get started") || content.includes("Sign in")) continue;

      const message = createUniversalMessage(
        conversationId,
        isUserTurn ? "user" : "assistant",
        content,
        this.platform,
      );

      if (context.includeCodeBlocks) {
        message.codeBlocks = this.extractCodeBlocks(el);
      }

      messages.push(message);
      isUserTurn = !isUserTurn;
    }

    return messages;
  }

  async extractMetadata(url: string): Promise<ParserResult<ConversationMetadata>> {
    const urlObj = new URL(url);

    return {
      success: true,
      data: {
        detectedUrl: url,
        hostname: urlObj.hostname,
        pathname: urlObj.pathname,
        conversationId: this.extractConversationIdFromUrl(url),
        platformVersion: document.querySelector('[data-version]')?.getAttribute("data-version") || undefined,
      },
    };
  }

  async extractModel(): Promise<string> {
    // Check model selector
    const modelEl = document.querySelector(this.SELECTORS.modelSelector);
    if (modelEl) {
      const text = modelEl.textContent || "";
      if (text.includes("Ultra") || text.includes("ultra")) return "Gemini Ultra";
      if (text.includes("Pro") || text.includes("pro")) return "Gemini Pro";
      if (text.includes("Flash") || text.includes("flash")) return "Gemini Flash";
    }

    // Check page for model name
    const bodyText = document.body.textContent || "";
    if (bodyText.includes("Gemini Ultra")) return "Gemini Ultra";
    if (bodyText.includes("Gemini Pro")) return "Gemini Pro";
    if (bodyText.includes("Gemini Flash")) return "Gemini Flash";

    // Check URL
    const url = window.location.href;
    if (url.includes("ultra")) return "Gemini Ultra";
    if (url.includes("flash")) return "Gemini Flash";
    if (url.includes("pro")) return "Gemini Pro";

    // Default
    return "Gemini Pro";
  }

  async extractTitle(): Promise<string> {
    const titleEl = document.querySelector(this.SELECTORS.titleSelector);
    if (titleEl?.textContent) {
      const title = this.cleanText(titleEl.textContent);
      if (title && !title.includes("Gemini") && title.length > 2) {
        return title;
      }
    }

    // Document title
    const docTitle = document.title;
    if (docTitle) {
      const cleaned = this.cleanText(
        docTitle
          .replace("Gemini", "")
          .replace("Bard", "")
          .replace("Google", "")
          .trim()
      );
      if (cleaned.length > 2 && cleaned.length < 100) return cleaned;
    }

    // Try first user query
    const firstQuery = document.querySelector(this.SELECTORS.userMessage);
    if (firstQuery?.textContent) {
      const text = this.cleanText(firstQuery.textContent);
      return text.length > 50 ? text.substring(0, 47) + "..." : text;
    }

    return `Conversation from ${this.platform}`;
  }

  extractAttachments(element: Element): MessageAttachment[] {
    const attachments: MessageAttachment[] = [];

    // Images
    const images = element.querySelectorAll(this.SELECTORS.imageAttachment);
    images.forEach((img) => {
      const src = img instanceof HTMLImageElement ? img.src : img.getAttribute("src");
      if (src && !src.includes("avatar") && !src.includes("logo")) {
        attachments.push({
          id: crypto.randomUUID(),
          type: "image",
          url: src,
          name: img.getAttribute("alt") || undefined,
        });
      }
    });

    // File attachments
    const files = element.querySelectorAll(this.SELECTORS.attachment);
    files.forEach((file) => {
      const name = file.getAttribute("data-name") || file.getAttribute("data-filename");
      if (name) {
        attachments.push({
          id: crypto.randomUUID(),
          type: "file",
          name: this.cleanText(name),
        });
      }
    });

    return attachments;
  }

  extractCodeBlocks(element: Element): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    const codeEls = element.querySelectorAll("pre code, [data-code]");

    codeEls.forEach((codeEl) => {
      let language = "text";

      // Check class list
      const classList = [...codeEl.classList];
      for (const cls of classList) {
        if (cls.startsWith("language-")) {
          language = cls.replace("language-", "");
          break;
        }
      }

      // Check data attribute
      const dataLang = codeEl.getAttribute("data-language");
      if (dataLang) language = dataLang;

      const code = codeEl.textContent || "";
      if (code.trim()) {
        blocks.push({
          id: crypto.randomUUID(),
          language,
          code,
          lineCount: code.split("\n").length,
          metadata: {},
        });
      }
    });

    return blocks;
  }

  getMessageSelectors(): string[] {
    return [
      this.SELECTORS.userMessage,
      this.SELECTORS.assistantMessage,
      '.conversation-turn',
      '[data-turn]',
    ].flat();
  }

  getUserMessageSelectors(): string[] {
    return this.SELECTORS.userMessage.split(", ");
  }

  getAssistantMessageSelectors(): string[] {
    return this.SELECTORS.assistantMessage.split(", ");
  }

  private extractConversationIdFromUrl(url: string): string | undefined {
    // Gemini URLs don't have clear conversation IDs
    // They use: gemini.google.com/app/{id} or gemini.google.com/u/{id}/app/{id}
    const match = url.match(/gemini\.google\.com\/(u\/\d+\/)?app\/([a-zA-Z0-9_-]+)/);
    if (match) return match[2];
    return undefined;
  }
}
