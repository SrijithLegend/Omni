/**
 * Claude Platform Parser — Captures conversations from claude.ai.
 *
 * Handles:
 * - Message extraction from Claude's DOM structure
 * - Code block parsing with language detection
 * - Model identification (Claude 3.5 Sonnet, Opus, etc.)
 * - Attachment and artifact extraction
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
  createEmptyMessageMetadata,
  recalculateStats,
} from "../models/universal-conversation";

export class ClaudeParser extends BasePlatformParser {
  readonly platform: Platform = "Claude";
  readonly hostname = "claude.ai";
  readonly aliases = ["claude.ai", "anthropic.com"];

  // Claude-specific selectors
  private readonly SELECTORS = {
    // Conversation container
    conversationContainer: '[data-testid="conversation-panel"], .react-scroll-to-bottom, main',
    messagesContainer: '[data-testid="messages-container"], .messages-container',

    // Message elements
    userMessage: '[data-testid="user-message"], .human-message, [data-user="true"]',
    assistantMessage: '[data-testid="assistant-message"], .assistant-message, [data-assistant="true"]',

    // Content areas
    messageContent: '.prose, .message-content, [data-message-content]',
    codeBlock: 'pre code, .code-block, [data-code]',

    // Model indicator
    modelSelector: '[data-testid="model-selector"], .model-indicator, [data-model]',
    modelText: '.model-name, [data-model-name]',

    // Title
    titleSelector: 'h1, .conversation-title, [data-title]',

    // Attachments
    attachment: '.attachment, [data-attachment], .file-attachment',
    imageAttachment: 'img.attachment, [data-type="image"]',

    // Artifacts (Claude's code artifacts feature)
    artifact: '[data-testid="artifact"], .artifact, [data-artifact]',

    // Editing indicators
    editIndicator: '.edited, [data-edited="true"]',

    // Regeneration
    regenerateButton: '[data-testid="regenerate"], .regenerate-button',
  };

  detect(url: string, hostname: string): DetectionResult {
    const normalizedHostname = hostname.toLowerCase();

    if (normalizedHostname.includes("claude.ai")) {
      return {
        detected: true,
        platform: "Claude",
        confidence: 0.98,
        url,
        title: document.title,
      };
    }

    if (normalizedHostname.includes("anthropic.com")) {
      return {
        detected: true,
        platform: "Claude",
        confidence: 0.7,
        url,
        title: document.title,
      };
    }

    return {
      detected: false,
      platform: "Claude",
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
      // Wait for messages container
      const container = await this.waitForElement(
        this.SELECTORS.messagesContainer.split(", ")[0],
        3000,
      );

      if (!container) {
        // Try conversation panel
        const panel = await this.waitForElement(
          this.SELECTORS.conversationContainer.split(", ")[0],
          1000,
        );
        if (!panel) {
          return { success: false, errors: ["No message container found"] };
        }
      }

      // Get all message elements
      const userMessages = document.querySelectorAll(this.SELECTORS.userMessage);
      const assistantMessages = document.querySelectorAll(this.SELECTORS.assistantMessage);

      // Combine and sort by DOM position
      const allMessages = this.getMessagesInOrder(userMessages, assistantMessages);

      let messageIndex = 0;
      for (const msgEl of allMessages) {
        if (context.maxMessages && messageIndex >= context.maxMessages) break;

        const message = await this.parseMessageElement(
          msgEl.element,
          conversationId,
          msgEl.role,
          context,
        );

        if (message) {
          messages.push(message);
          messageIndex++;
        }
      }

      if (messages.length === 0) {
        // Try alternative extraction method
        const altMessages = await this.extractMessagesAlternative(conversationId, context);
        if (altMessages.length > 0) {
          return { success: true, data: altMessages, warnings };
        }
        return { success: false, errors: ["No messages found"] };
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
    if (!contentEl) return null;

    const content = this.cleanText(contentEl.textContent || "");
    if (!content || content.length < 2) return null;

    const message = createUniversalMessage(
      conversationId,
      role,
      content,
      this.platform,
    );

    // Extract code blocks if enabled
    if (context.includeCodeBlocks) {
      message.codeBlocks = this.extractCodeBlocks(element);
      message.metadata.hasCode = message.codeBlocks.length > 0;
    }

    // Extract attachments if enabled
    if (context.includeAttachments || context.includeImages) {
      message.attachments = this.extractAttachments(element);
      message.metadata.hasImages = message.attachments.some((a) => a.type === "image");
    }

    // Check for edits
    const editMarker = element.querySelector(this.SELECTORS.editIndicator);
    message.isEdited = !!editMarker;

    // Word and character counts
    message.metadata.wordCount = countWords(content);
    message.metadata.charCount = content.length;
    message.metadata.hasLinks = extractLinks(content).length > 0;
    message.metadata.hasTables = hasTables(content);
    message.metadata.hasMath = hasMath(content);
    message.metadata.hasLists = hasLists(content);

    // Check for artifacts
    const artifacts = element.querySelectorAll(this.SELECTORS.artifact);
    for (const artifact of artifacts) {
      const artifactData = artifact.getAttribute("data-artifact");
      if (artifactData) {
        message.metadata.hasCode = true;
      }
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

    // Try to find any prose elements - Claude uses these for message content
    const proseElements = document.querySelectorAll(".prose");

    let isUserTurn = true; // Start with user
    for (const prose of proseElements) {
      const content = this.cleanText(prose.textContent || "");
      if (content.length < 2) continue;

      const message = createUniversalMessage(
        conversationId,
        isUserTurn ? "user" : "assistant",
        content,
        this.platform,
      );

      if (context.includeCodeBlocks) {
        message.codeBlocks = this.extractCodeBlocks(prose);
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
    // Try model selector first
    const modelEl = document.querySelector(this.SELECTORS.modelSelector);
    if (modelEl) {
      const modelText = modelEl.querySelector(this.SELECTORS.modelText)?.textContent;
      if (modelText) return this.cleanText(modelText);

      // Check data attributes
      const dataModel = modelEl.getAttribute("data-model");
      if (dataModel) return dataModel;
    }

    // Check for model name in page
    const modelIndicators = document.querySelectorAll("[class*='model'], [data-model]");
    for (const el of modelIndicators) {
      const text = el.textContent;
      if (text && (text.includes("Claude") || text.includes("claude"))) {
        return this.cleanText(text);
      }
    }

    // Check URL for model hints
    const url = window.location.href;
    if (url.includes("claude-3-5")) return "Claude 3.5 Sonnet";
    if (url.includes("claude-3-opus")) return "Claude 3 Opus";
    if (url.includes("claude-3-sonnet")) return "Claude 3 Sonnet";
    if (url.includes("claude-3-haiku")) return "Claude 3 Haiku";

    // Default fallback
    return "Claude 3.5 Sonnet";
  }

  async extractTitle(): Promise<string> {
    // Check title selector
    const titleEl = document.querySelector(this.SELECTORS.titleSelector);
    if (titleEl?.textContent) {
      return this.cleanText(titleEl.textContent);
    }

    // Check document title
    const docTitle = document.title;
    if (docTitle && !docTitle.includes("Claude") && !docTitle.includes("New Chat")) {
      return this.cleanText(docTitle.replace(" - Claude", "").trim());
    }

    // Try to find first user message for title
    const firstUserMessage = document.querySelector(this.SELECTORS.userMessage);
    if (firstUserMessage?.textContent) {
      const text = this.cleanText(firstUserMessage.textContent);
      return text.length > 50 ? text.substring(0, 47) + "..." : text;
    }

    return `Conversation from ${this.platform}`;
  }

  extractAttachments(element: Element): MessageAttachment[] {
    const attachments: MessageAttachment[] = [];

    // Image attachments
    const images = element.querySelectorAll(this.SELECTORS.imageAttachment);
    images.forEach((img) => {
      const src = img.getAttribute("src");
      if (src) {
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
      const type = file.getAttribute("data-type") || "file";
      const name = file.getAttribute("data-name") || file.textContent;
      const url = file.getAttribute("data-url") || file.getAttribute("href");

      if (name) {
        attachments.push({
          id: crypto.randomUUID(),
          type: type as "file" | "image" | "link",
          url: url || undefined,
          name: this.cleanText(name),
        });
      }
    });

    // Artifacts
    const artifacts = element.querySelectorAll(this.SELECTORS.artifact);
    artifacts.forEach((artifact) => {
      const name = artifact.getAttribute("data-name") || artifact.getAttribute("data-artifact");
      if (name) {
        attachments.push({
          id: crypto.randomUUID(),
          type: "file",
          name: `Artifact: ${name}`,
        });
      }
    });

    return attachments;
  }

  extractCodeBlocks(element: Element): CodeBlock[] {
    const blocks: CodeBlock[] = [];
    const codeEls = element.querySelectorAll("pre code, .code-block");

    codeEls.forEach((codeEl) => {
      let language = "text";

      // Check class names for language
      const classNames = codeEl.className.split(" ");
      for (const cls of classNames) {
        if (cls.startsWith("language-")) {
          language = cls.replace("language-", "");
          break;
        }
        if (cls.startsWith("hljs-")) {
          language = cls.replace("hljs-", "");
          break;
        }
      }

      // Check data attribute
      const dataLang = codeEl.closest("pre")?.getAttribute("data-language");
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

    // Also parse inline code blocks from markdown
    const content = element.textContent || "";
    const markdownBlocks = extractCodeBlocks(content);
    blocks.push(...markdownBlocks);

    return blocks;
  }

  getMessageSelectors(): string[] {
    return [
      this.SELECTORS.userMessage,
      this.SELECTORS.assistantMessage,
    ].map((s) => s.split(", ")).flat();
  }

  getUserMessageSelectors(): string[] {
    return this.SELECTORS.userMessage.split(", ");
  }

  getAssistantMessageSelectors(): string[] {
    return this.SELECTORS.assistantMessage.split(", ");
  }

  private extractConversationIdFromUrl(url: string): string | undefined {
    // Claude URLs: claude.ai/chat/{id} or claude.ai/new
    const match = url.match(/claude\.ai\/chat\/([a-zA-Z0-9-]+)/);
    if (match) return match[1];
    return undefined;
  }
}
