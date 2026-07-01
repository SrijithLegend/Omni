/**
 * Grok Platform Parser — Captures conversations from x.ai/grok or twitter.com/i/grok.
 *
 * Handles:
 * - Message extraction from Grok's DOM structure
 * - Code block parsing with language detection
 * - Model identification (Grok-2, Grok-2-mini, etc.)
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

export class GrokParser extends BasePlatformParser {
  readonly platform: Platform = "Grok";
  readonly hostname = "x.ai";
  readonly aliases = ["x.ai", "grok.x.ai", "twitter.com/i/grok", "x.com/i/grok"];

  private readonly SELECTORS = {
    // Conversation structure
    conversationContainer: 'main, [data-testid="grok-container"], .grok-chat',
    messagesContainer: '[data-testid="messages"], .messages-container',
    messagesWrapper: '.message-wrapper, [data-message-wrapper]',

    // Message elements
    userMessage: '[data-testid="user-message"], .user-message, [data-role="user"]',
    assistantMessage: '[data-testid="assistant-message"], .grok-response, [data-role="assistant"]',

    // Content areas
    messageContent: '.message-content, .markdown, [data-content]',
    codeBlock: 'pre code, .code-block, [data-code]',

    // Model indicator
    modelSelector: '[data-testid="model-selector"], .model-selector, [data-model]',
    modelBadge: '.model-badge, [data-model-name]',

    // Title
    titleSelector: 'h1, .title, [data-title]',

    // Attachments
    attachment: '.attachment, [data-attachment]',
    imageAttachment: 'img, [data-image]',

    // Edit indicators
    editIndicator: '[data-edited]="true", .edited',

    // Regenerate
    regenerateButton: '[data-testid="regenerate"], .regenerate-btn',

    // X/Twitter integration
    twitterContainer: '[data-testid="grok-panel"], .grok-panel',
  };

  detect(url: string, hostname: string): DetectionResult {
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname.includes("x.ai") || normalizedHostname.includes("grok.x.ai")) {
      return {
        detected: true,
        platform: "Grok",
        confidence: 0.98,
        url,
        title: document.title,
      };
    }

    if (
      normalizedHostname.includes("twitter.com/i/grok") ||
      normalizedHostname.includes("x.com/i/grok")
    ) {
      return {
        detected: true,
        platform: "Grok",
        confidence: 0.95,
        url,
        title: document.title,
      };
    }

    return {
      detected: false,
      platform: "Grok",
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
      await this.waitForElement(
        this.SELECTORS.conversationContainer.split(", ")[0],
        3000,
      );

      // Try finding message wrappers
      const messageWrappers = document.querySelectorAll(this.SELECTORS.messagesWrapper);

      if (messageWrappers.length === 0) {
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
        for (let i = 0; i < messageWrappers.length; i++) {
          if (context.maxMessages && messages.length >= context.maxMessages) break;

          const wrapper = messageWrappers[i];

          // Check for user or assistant role
          const isUser = wrapper.querySelector(this.SELECTORS.userMessage) ||
                        wrapper.getAttribute("data-role") === "user";
          const isAssistant = wrapper.querySelector(this.SELECTORS.assistantMessage) ||
                             wrapper.getAttribute("data-role") === "assistant";

          const role = isUser ? "user" : isAssistant ? "assistant" : null;
          if (!role) continue;

          const message = await this.parseMessageElement(wrapper, conversationId, role, context);
          if (message) messages.push(message);
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

    // Try generic message elements
    const messageEls = document.querySelectorAll('.message, [data-message], .markdown');

    let isUserTurn = true;
    for (const el of messageEls) {
      const content = this.cleanText(el.textContent || "");
      if (content.length < 2) continue;

      // Skip UI elements
      if (content.includes("Sign in") || content.includes("Get started")) continue;

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
      if (text.includes("Grok-2") || text.includes("grok-2")) return "Grok-2";
      if (text.includes("Grok-1") || text.includes("grok-1")) return "Grok-1";
      if (text.includes("mini")) return "Grok-2 mini";
      if (text.includes("Grok")) return "Grok-2";
    }

    // Check page content
    const bodyText = document.body.textContent || "";
    if (bodyText.includes("Grok-2 mini")) return "Grok-2 mini";
    if (bodyText.includes("Grok-2")) return "Grok-2";
    if (bodyText.includes("Grok-1")) return "Grok-1";

    // Check URL
    const url = window.location.href;
    if (url.includes("grok-2-mini")) return "Grok-2 mini";
    if (url.includes("grok-2")) return "Grok-2";
    if (url.includes("grok-1")) return "Grok-1";

    // Default
    return "Grok-2";
  }

  async extractTitle(): Promise<string> {
    const titleEl = document.querySelector(this.SELECTORS.titleSelector);
    if (titleEl?.textContent) {
      const title = this.cleanText(titleEl.textContent);
      if (title && !title.includes("Grok") && !title.includes("X.com")) {
        return title;
      }
    }

    // Document title
    const docTitle = document.title;
    if (docTitle) {
      const cleaned = this.cleanText(
        docTitle
          .replace("Grok", "")
          .replace("X.com", "")
          .replace(" - ", "")
          .trim()
      );
      if (cleaned.length > 2) return cleaned;
    }

    // Try first user message
    const firstUser = document.querySelector(this.SELECTORS.userMessage);
    if (firstUser?.textContent) {
      const text = this.cleanText(firstUser.textContent);
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
      if (src && !src.includes("avatar") && !src.includes("profile")) {
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

      const classList = [...codeEl.classList];
      for (const cls of classList) {
        if (cls.startsWith("language-")) {
          language = cls.replace("language-", "");
          break;
        }
      }

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
      this.SELECTORS.messagesWrapper,
    ].flat();
  }

  getUserMessageSelectors(): string[] {
    return this.SELECTORS.userMessage.split(", ");
  }

  getAssistantMessageSelectors(): string[] {
    return this.SELECTORS.assistantMessage.split(", ");
  }

  private extractConversationIdFromUrl(url: string): string | undefined {
    // Grok URLs: x.ai/grok/{id} or x.com/i/grok
    const match = url.match(/x\.ai\/grok\/([a-zA-Z0-9_-]+)/);
    if (match) return match[1];

    // For embedded Grok in X/Twitter, there may not be a clear ID
    return undefined;
  }
}
