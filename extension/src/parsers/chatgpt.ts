/**
 * ChatGPT Platform Parser — Captures conversations from chatgpt.com.
 *
 * Handles:
 * - Message extraction from ChatGPT's DOM structure
 * - Code block parsing with language detection
 * - Model identification (GPT-4o, GPT-4, GPT-3.5, etc.)
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

export class ChatGPTParser extends BasePlatformParser {
  readonly platform: Platform = "ChatGPT";
  readonly hostname = "chatgpt.com";
  readonly aliases = ["chatgpt.com", "chat.openai.com", "openai.com"];

  private readonly SELECTORS = {
    // Conversation structure
    conversationContainer: 'main, [data-testid="conversation-panel"], .conversation',
    messagesContainer: '.react-scroll-to-bottom, [data-testid="messages-container"]',
    messagesWrapper: '.markdown, [data-testid="conversation-turn"]',

    // Message elements (ChatGPT uses specific patterns)
    userMessage: '[data-message-author-role="user"], .user-message, [data-user="true"]',
    assistantMessage: '[data-message-author-role="assistant"], .assistant-message, [data-assistant="true"]',
    systemMessage: '[data-message-author-role="system"], .system-message',

    // Content areas
    messageContent: '.markdown, .whitespace-pre-wrap, [data-testid="message-content"]',
    codeBlock: 'pre, code, [data-code-block]',

    // Model indicator
    modelSelector: '[data-testid="model-switcher"], .model-selector, [data-model]',
    modelBadge: '.model-badge, [data-model-name]',

    // Title
    titleSelector: 'h1, [data-testid="conversation-title"], .title',

    // Attachments
    attachment: '[data-testid="attachment"], .attachment, .file-upload',
    imageAttachment: 'img, [data-type="image"], .image-attachment',

    // Edit indicators
    editIndicator: '[data-edited="true"], .edited, [data-testid="edited"]',

    // Regenerate
    regenerateButton: '[data-testid="regenerate-button"], .regenerate',

    // Sidebar conversation list
    conversationList: '[data-testid="conversation-list"], nav ol',

    // Input area
    inputArea: '[data-testid="composer"], #prompt-textarea, .composer',
  };

  detect(url: string, hostname: string): DetectionResult {
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname.includes("chatgpt.com")) {
      return {
        detected: true,
        platform: "ChatGPT",
        confidence: 0.98,
        url,
        title: document.title,
      };
    }

    if (normalizedHostname.includes("chat.openai.com")) {
      return {
        detected: true,
        platform: "ChatGPT",
        confidence: 0.95,
        url,
        title: document.title,
      };
    }

    if (normalizedHostname.includes("openai.com")) {
      return {
        detected: true,
        platform: "ChatGPT",
        confidence: 0.6,
        url,
        title: document.title,
      };
    }

    return {
      detected: false,
      platform: "ChatGPT",
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
      // Wait for conversation to load
      await this.waitForElement(this.SELECTORS.conversationContainer.split(", ")[0], 3000);

      // Get all conversation turns (ChatGPT uses [data-testid="conversation-turn"] in newer versions)
      const conversationTurns = document.querySelectorAll('[data-testid="conversation-turn"]');

      if (conversationTurns.length === 0) {
        // Fallback to separate user/assistant message queries
        const userMessages = document.querySelectorAll(this.SELECTORS.userMessage);
        const assistantMessages = document.querySelectorAll(this.SELECTORS.assistantMessage);

        if (userMessages.length === 0 && assistantMessages.length === 0) {
          // Try alternative extraction
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
        // New ChatGPT structure with conversation turns
        for (let i = 0; i < conversationTurns.length; i++) {
          if (context.maxMessages && messages.length >= context.maxMessages) break;

          const turn = conversationTurns[i];
          const userPart = turn.querySelector('[data-message-author-role="user"]');
          const assistantPart = turn.querySelector('[data-message-author-role="assistant"]');

          if (userPart) {
            const message = await this.parseMessageElement(userPart, conversationId, "user", context);
            if (message) messages.push(message);
          }

          if (assistantPart) {
            const message = await this.parseMessageElement(assistantPart, conversationId, "assistant", context);
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
    // Try multiple content selectors
    let contentEl = element.querySelector(this.SELECTORS.messageContent);
    if (!contentEl) {
      contentEl = element.querySelector('.markdown, .whitespace-pre-wrap');
    }
    if (!contentEl) {
      contentEl = element as Element;
    }

    const content = this.cleanText(contentEl.textContent || "");
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
    const editMarker = element.querySelector(this.SELECTORS.editIndicator);
    message.isEdited = !!editMarker;

    // Metadata
    message.metadata.wordCount = countWords(content);
    message.metadata.charCount = content.length;
    message.metadata.hasLinks = extractLinks(content).length > 0;
    message.metadata.hasTables = hasTables(content);
    message.metadata.hasMath = hasMath(content);
    message.metadata.hasLists = hasLists(content);

    // Check for regenerated content (ChatGPT shows previous versions)
    const previousVersions = element.querySelectorAll('[data-testid="previous-version"]');
    if (previousVersions.length > 0) {
      message.isRegenerated = true;
    }

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

    // Try to find all markdown/prose elements which contain messages
    const markdownEls = document.querySelectorAll(".markdown, .prose");

    let isUserTurn = true;
    for (const el of markdownEls) {
      const content = this.cleanText(el.textContent || "");
      if (content.length < 2) continue;

      // Skip if it looks like UI text
      if (content.includes("Log in") || content.includes("Sign up")) continue;

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
      const badge = modelEl.querySelector(this.SELECTORS.modelBadge);
      if (badge?.textContent) return this.cleanText(badge.textContent);

      const text = modelEl.textContent;
      if (text) {
        if (text.includes("GPT-4o")) return "GPT-4o";
        if (text.includes("GPT-4")) return "GPT-4";
        if (text.includes("GPT-3.5")) return "GPT-3.5";
      }
    }

    // Check for model name anywhere on page
    const bodyText = document.body.textContent || "";
    if (bodyText.includes("GPT-4o")) return "GPT-4o";
    if (bodyText.includes("GPT-4 Turbo")) return "GPT-4 Turbo";
    if (bodyText.includes("GPT-4")) return "GPT-4";
    if (bodyText.includes("GPT-3.5")) return "GPT-3.5";

    // Check URL for model hints
    const url = window.location.href;
    if (url.includes("gpt-4o")) return "GPT-4o";
    if (url.includes("gpt-4")) return "GPT-4";
    if (url.includes("gpt-3.5")) return "GPT-3.5";

    // Default
    return "GPT-4o";
  }

  async extractTitle(): Promise<string> {
    const titleEl = document.querySelector(this.SELECTORS.titleSelector);
    if (titleEl?.textContent) {
      const title = this.cleanText(titleEl.textContent);
      if (title && !title.includes("ChatGPT") && title.length > 2) {
        return title;
      }
    }

    // Check document title
    const docTitle = document.title;
    if (docTitle && !docTitle.includes("ChatGPT") && !docTitle.includes("New chat")) {
      return this.cleanText(docTitle.replace(" - ChatGPT", "").replace("ChatGPT", "").trim());
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
      if (src && !src.includes("avatar")) {
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
      const type = file.getAttribute("data-type") || "file";

      if (name) {
        attachments.push({
          id: crypto.randomUUID(),
          type: type as "file" | "image" | "link",
          name: this.cleanText(name),
          url: file.getAttribute("data-url") || file.getAttribute("href") || undefined,
        });
      }
    });

    return attachments;
  }

  extractCodeBlocks(element: Element): CodeBlock[] {
    const blocks: CodeBlock[] = [];

    // ChatGPT code blocks
    const codeEls = element.querySelectorAll("pre, [data-code-block]");

    codeEls.forEach((pre) => {
      const codeEl = pre.querySelector("code") || pre;
      let language = "text";

      // Check class list for language
      const classList = [...codeEl.classList];
      for (const cls of classList) {
        if (cls.startsWith("language-")) {
          language = cls.replace("language-", "");
          break;
        }
        if (cls.startsWith("hljs") && cls !== "hljs") {
          language = cls.replace("hljs", "");
          break;
        }
      }

      // Check data attribute
      const dataLang = pre.getAttribute("data-language") || codeEl.getAttribute("data-language");
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
      '[data-testid="conversation-turn"]',
    ].flat();
  }

  getUserMessageSelectors(): string[] {
    return this.SELECTORS.userMessage.split(", ");
  }

  getAssistantMessageSelectors(): string[] {
    return this.SELECTORS.assistantMessage.split(", ");
  }

  private extractConversationIdFromUrl(url: string): string | undefined {
    // ChatGPT URLs: chatgpt.com/c/{id} or chat.openai.com/chat/{id}
    const match = url.match(/chatgpt\.com\/c\/([a-zA-Z0-9-]+)/) ||
                  url.match(/chat\.openai\.com\/chat\/([a-zA-Z0-9-]+)/);
    return match?.[1];
  }
}
