/**
 * Context Package Engine — Generates structured context for AI continuation.
 *
 * Creates Context Packages from conversations and projects that can be used
 * to seamlessly continue work across different AI platforms.
 */

import { BaseEngine } from "./base";
import type { Platform, UUID } from "../types/omni";
import type {
  UniversalConversation,
  UniversalMessage,
  ContextPackage,
} from "../models/universal-conversation";
import type { Project } from "../models/project";
import { SummaryEngine } from "./summary";

export interface ContextConfig {
  format: "detailed" | "concise" | "minimal";
  maxMessages: number;
  maxTokens: number;
  includeCodeBlocks: boolean;
  includeAttachments: boolean;
  includeSummary: boolean;
}

const DEFAULT_CONTEXT_CONFIG: ContextConfig = {
  format: "concise",
  maxMessages: 20,
  maxTokens: 4000,
  includeCodeBlocks: true,
  includeAttachments: false,
  includeSummary: true,
};

export class ContextPackageEngine extends BaseEngine {
  private config: ContextConfig;
  private summaryEngine: SummaryEngine;

  constructor(config: Partial<ContextConfig> = {}) {
    super({ name: "ContextPackageEngine", version: "1.0.0", debug: false });
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };
    this.summaryEngine = new SummaryEngine();
  }

  async start(): Promise<void> {
    await this.summaryEngine.start();
    this.isRunning = true;
    this.emit("ready");
  }

  async stop(): Promise<void> {
    await this.summaryEngine.stop();
    this.isRunning = false;
  }

  async health(): Promise<import("./base").HealthStatus> {
    return {
      ok: true,
      message: "Context Package Engine ready",
      timestamp: Date.now(),
    };
  }

  /**
   * Generate a context package for a conversation.
   */
  async generatePackage(
    conversation: UniversalConversation,
    project?: Project | null,
    options: Partial<ContextConfig> = {},
  ): Promise<ContextPackage> {
    const config = { ...this.config, ...options };

    // Generate summary if needed
    let summary = conversation.summary;
    if (config.includeSummary && (!summary.short || summary.short.length === 0)) {
      summary = await this.summaryEngine.generateSummary(conversation);
    }

    // Get recent messages
    const recentMessages = this.getRecentMessages(conversation.messages, config.maxMessages);

    // Get key exchanges (messages with code/important content)
    const keyExchanges = this.getKeyExchanges(conversation.messages);

    // Extract open questions
    const openQuestions = summary.questions.slice(0, 5);

    // Build formatted context
    const formattedContext = this.formatContext(
      conversation,
      summary,
      recentMessages,
      keyExchanges,
      project,
      config,
    );

    return {
      conversationId: conversation.id,
      projectId: conversation.projectId,
      conversationContext: {
        summary,
        recentMessages,
        keyExchanges,
        openQuestions,
      },
      projectContext: project ? {
        name: project.name,
        description: project.description,
        goals: summary.goals,
        technologies: summary.technologies,
        decisions: summary.decisions,
        currentPhase: this.determinePhase(conversation),
      } : undefined,
      formattedContext,
      generatedAt: Date.now(),
      tokenCount: this.estimateTokens(formattedContext),
      format: config.format,
    };
  }

  /**
   * Get recent messages.
   */
  private getRecentMessages(
    messages: UniversalMessage[],
    max: number,
  ): UniversalMessage[] {
    if (messages.length <= max) return messages;

    // Get last N messages
    return messages.slice(-max);
  }

  /**
   * Get key exchanges (important messages).
   */
  private getKeyExchanges(messages: UniversalMessage[]): UniversalMessage[] {
    const keyMessages: UniversalMessage[] = [];

    for (const message of messages) {
      // Include messages with code
      if (message.codeBlocks.length > 0) {
        keyMessages.push(message);
        continue;
      }

      // Include messages with attachments
      if (message.attachments.length > 0) {
        keyMessages.push(message);
        continue;
      }

      // Include messages marked as important (contains certain keywords)
      const content = message.content.toLowerCase();
      if (
        content.includes("important:") ||
        content.includes("key point:") ||
        content.includes("decision:") ||
        content.includes("note:")
      ) {
        keyMessages.push(message);
      }
    }

    // Limit to 10 key exchanges
    return keyMessages.slice(0, 10);
  }

  /**
   * Format context as a string.
   */
  private formatContext(
    conversation: UniversalConversation,
    summary: typeof conversation.summary,
    recentMessages: UniversalMessage[],
    keyExchanges: UniversalMessage[],
    project: Project | null | undefined,
    config: ContextConfig,
  ): string {
    const parts: string[] = [];

    // Project context (if available)
    if (project) {
      parts.push(this.formatProjectSection(project, config));
    }

    // Conversation summary
    if (config.includeSummary) {
      parts.push(this.formatSummarySection(conversation, summary, config));
    }

    // Key findings
    parts.push(this.formatKeyFindings(summary, config));

    // Recent context
    parts.push(this.formatRecentContext(recentMessages, config));

    // Open questions
    if (summary.questions.length > 0) {
      parts.push(this.formatOpenQuestions(summary.questions));
    }

    return parts.join("\n\n");
  }

  /**
   * Format project section.
   */
  private formatProjectSection(project: Project, config: ContextConfig): string {
    const lines: string[] = [];

    lines.push("# Project Context");
    lines.push(`Project: ${project.name}`);

    if (project.description) {
      lines.push(`Description: ${project.description}`);
    }

    if (project.stats.lastActivityAt) {
      const lastActive = new Date(project.stats.lastActivityAt);
      lines.push(`Last active: ${lastActive.toISOString().split("T")[0]}`);
    }

    return lines.join("\n");
  }

  /**
   * Format summary section.
   */
  private formatSummarySection(
    conversation: UniversalConversation,
    summary: typeof conversation.summary,
    config: ContextConfig,
  ): string {
    const lines: string[] = [];

    lines.push("# Conversation Summary");

    if (config.format === "detailed") {
      lines.push(summary.detailed);
    } else if (config.format === "concise") {
      lines.push(summary.medium);
    } else {
      lines.push(summary.short);
    }

    return lines.join("\n");
  }

  /**
   * Format key findings.
   */
  private formatKeyFindings(
    summary: typeof conversation.summary,
    config: ContextConfig,
  ): string {
    const lines: string[] = [];

    if (config.format === "minimal") {
      return "";
    }

    const findings: string[] = [];

    if (summary.goals.length > 0) {
      findings.push(`Goals: ${summary.goals.slice(0, 3).join("; ")}`);
    }

    if (summary.decisions.length > 0) {
      findings.push(`Key decisions: ${summary.decisions.slice(0, 3).join("; ")}`);
    }

    if (summary.technologies.length > 0) {
      findings.push(`Technologies: ${summary.technologies.slice(0, 5).join(", ")}`);
    }

    if (summary.languages.length > 0) {
      findings.push(`Languages: ${summary.languages.join(", ")}`);
    }

    if (findings.length > 0) {
      lines.push("# Key Findings");
      lines.push(findings.join("\n"));
    }

    return lines.join("\n");
  }

  /**
   * Format recent context.
   */
  private formatRecentContext(
    messages: UniversalMessage[],
    config: ContextConfig,
  ): string {
    const lines: string[] = [];

    lines.push("# Recent Context");

    for (const message of messages) {
      const role = message.role === "user" ? "User" : "Assistant";

      // Truncate long messages
      let content = message.content;
      if (content.length > 500 && config.format !== "detailed") {
        content = content.substring(0, 500) + "...";
      }

      lines.push(`\n${role}:`);

      if (config.includeCodeBlocks && message.codeBlocks.length > 0) {
        // Include first code block
        const block = message.codeBlocks[0];
        lines.push(`\n\`\`\`${block.language}`);
        lines.push(block.code.substring(0, 1000));
        lines.push("```");
      } else {
        lines.push(content);
      }
    }

    return lines.join("\n");
  }

  /**
   * Format open questions.
   */
  private formatOpenQuestions(questions: string[]): string {
    const lines: string[] = [];

    lines.push("# Open Questions");
    questions.forEach((q, i) => {
      lines.push(`${i + 1}. ${q}`);
    });

    return lines.join("\n");
  }

  /**
   * Determine the current phase of the conversation.
   */
  private determinePhase(conversation: UniversalConversation): string {
    const messages = conversation.messages;
    const lastUserMessage = [...messages].reverse().find((m) => m.role === "user");
    const lastAssistantMessage = [...messages].reverse().find((m) => m.role === "assistant");

    if (!lastUserMessage) return "starting";
    if (!lastAssistantMessage) return "awaiting_response";

    const lastContent = lastAssistantMessage.content.toLowerCase();

    if (lastContent.includes("error") || lastContent.includes("failed")) {
      return "debugging";
    }

    if (lastContent.includes("here's") || lastContent.includes("here is")) {
      return "implementation";
    }

    if (lastContent.includes("let me know") || lastContent.includes("anything else")) {
      return "review";
    }

    if (lastContent.includes("?") && lastContent.split("?").length > 3) {
      return "clarifying";
    }

    return "in_progress";
  }

  /**
   * Estimate token count for a string.
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token on average
    return Math.ceil(text.length / 4);
  }

  /**
   * Update config.
   */
  updateConfig(config: Partial<ContextConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Generate a minimal context string for clipboard.
   */
  async generateMinimalContext(
    conversation: UniversalConversation,
    project?: Project | null,
  ): Promise<string> {
    const pkg = await this.generatePackage(conversation, project, {
      format: "minimal",
      maxMessages: 5,
      includeCodeBlocks: false,
      includeAttachments: false,
      includeSummary: true,
    });

    return pkg.formattedContext;
  }

  /**
   * Generate a detailed context string for export.
   */
  async generateDetailedContext(
    conversation: UniversalConversation,
    project?: Project | null,
  ): Promise<string> {
    const pkg = await this.generatePackage(conversation, project, {
      format: "detailed",
      maxMessages: 50,
      includeCodeBlocks: true,
      includeAttachments: true,
      includeSummary: true,
    });

    return pkg.formattedContext;
  }
}
