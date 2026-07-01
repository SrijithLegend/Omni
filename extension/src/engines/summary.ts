/**
 * Conversation Summary Engine — Generates structured summaries from captured conversations.
 *
 * Extracts:
 * - Goals and objectives
 * - Important decisions
 * - Action items
 * - Technologies, libraries, frameworks
 * - Programming languages used
 * - Important files and URLs
 * - Future tasks
 * - Questions and risks
 */

import { BaseEngine } from "./base";
import type {
  UniversalConversation,
  UniversalMessage,
  ConversationSummary,
  CodeBlock,
} from "../models/universal-conversation";
import { createEmptySummary } from "../models/universal-conversation";

// Common technology keywords
const TECHNOLOGY_KEYWORDS = {
  languages: [
    "python", "javascript", "typescript", "java", "c++", "c#", "go", "rust",
    "ruby", "php", "swift", "kotlin", "scala", "r", "sql", "html", "css",
    "shell", "bash", "powershell", "lua", "perl", "elixir", "haskell",
  ],
  frameworks: [
    "react", "vue", "angular", "svelte", "next.js", "nuxt", "gatsby",
    "express", "fastify", "django", "flask", "rails", "spring", "asp.net",
    "laravel", "symfony", "electron", "react native", "flutter", "tauri",
  ],
  libraries: [
    "lodash", "axios", "jquery", "underscore", "moment", "dayjs",
    "tailwind", "bootstrap", "material-ui", "chakra", "antd",
    "redux", "mobx", "zustand", "recoil", "jotai",
    "zod", "yup", "joi", "class-validator",
    "prisma", "typeorm", "sequelize", "mongoose",
    "pytest", "jest", "vitest", "cypress", "playwright",
  ],
  tools: [
    "docker", "kubernetes", "nginx", "apache", "redis", "postgresql",
    "mongodb", "mysql", "sqlite", "elasticsearch", "rabbitmq", "kafka",
    "webpack", "vite", "esbuild", "rollup", "parcel", "babel", "swc",
    "git", "github", "gitlab", "bitbucket", "jenkins", "github actions",
    "vercel", "netlify", "heroku", "aws", "gcp", "azure", "digitalocean",
    "supabase", "firebase", "planetscale", "neon", "turso",
  ],
  ai: [
    "openai", "anthropic", "claude", "gpt", "gemini", "llama", "mistral",
    "langchain", "llamaindex", "pinecone", "weaviate", "qdrant",
    "embeddings", "rag", "fine-tuning", "prompt", "token",
  ],
};

// Patterns to extract from messages
const PATTERNS = {
  goal: /(?:goal|objective|purpose|aim|target)[:\s]+([^.!?]+)/gi,
  decision: /(?:decided|decision|made|going to|will use|chose)[:\s]+([^.!?]+)/gi,
  action: /(?:todo|task|action|need to|should|must|will|next step)[:\s]+([^.!?]+)/gi,
  question: /\?/g,
  url: /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi,
  file: /(?:file|filename|create|edit|update)[:\s]+([a-zA-Z0-9_\-/.]+\.[a-zA-Z]{1,10})/gi,
};

export class SummaryEngine extends BaseEngine {
  constructor() {
    super({ name: "SummaryEngine", version: "1.0.0", debug: false });
  }

  async start(): Promise<void> {
    this.isRunning = true;
    this.emit("ready");
  }

  async stop(): Promise<void> {
    this.isRunning = false;
  }

  async health(): Promise<import("./base").HealthStatus> {
    return {
      ok: true,
      message: "Summary Engine ready",
      timestamp: Date.now(),
    };
  }

  /**
   * Generate a summary for a conversation.
   */
  async generateSummary(conversation: UniversalConversation): Promise<ConversationSummary> {
    const summary = createEmptySummary();

    if (conversation.messages.length === 0) {
      return summary;
    }

    // Extract from all messages
    const allContent = conversation.messages.map((m) => m.content).join("\n\n");

    // Generate different length summaries
    summary.short = this.generateShortSummary(conversation);
    summary.medium = this.generateMediumSummary(conversation);
    summary.detailed = this.generateDetailedSummary(conversation);

    // Extract structured data
    summary.goals = this.extractGoals(allContent);
    summary.decisions = this.extractDecisions(allContent);
    summary.actionItems = this.extractActionItems(allContent);
    summary.technologies = this.extractTechnologies(allContent, conversation);
    summary.libraries = this.extractLibraries(allContent, conversation);
    summary.frameworks = this.extractFrameworks(allContent, conversation);
    summary.languages = this.extractLanguages(conversation);
    summary.files = this.extractFiles(allContent);
    summary.urls = this.extractUrls(allContent);
    summary.futureTasks = this.extractFutureTasks(allContent);
    summary.questions = this.extractQuestions(allContent);
    summary.risks = this.extractRisks(allContent);
    summary.unknowns = this.extractUnknowns(allContent);

    return summary;
  }

  /**
   * Generate a short summary (1-2 sentences).
   */
  private generateShortSummary(conversation: UniversalConversation): string {
    const firstUserMessage = conversation.messages.find((m) => m.role === "user");
    const topic = firstUserMessage?.content.substring(0, 100) || "conversation";

    const messageCount = conversation.messages.length;
    const codeCount = conversation.stats.totalCodeBlocks;

    let summary = `A ${messageCount}-message conversation about ${this.truncateText(topic, 50)}.`;
    if (codeCount > 0) {
      summary += ` Contains ${codeCount} code blocks.`;
    }

    return summary;
  }

  /**
   * Generate a medium summary (1 paragraph).
   */
  private generateMediumSummary(conversation: UniversalConversation): string {
    const userMessages = conversation.messages.filter((m) => m.role === "user");
    const assistantMessage = conversation.messages.filter((m) => m.role === "assistant");

    const topics = this.extractMainTopics(userMessages);
    const codeLanguages = conversation.stats.codeLanguages;

    let summary = `This conversation from ${conversation.platform} contains ${conversation.messageCount} messages `;
    summary += `(${userMessages.length} user, ${assistantMessage.length} assistant). `;

    if (topics.length > 0) {
      summary += `Main topics: ${topics.slice(0, 3).join(", ")}. `;
    }

    if (codeLanguages.length > 0) {
      summary += `Code in ${codeLanguages.slice(0, 5).join(", ")}. `;
    }

    if (conversation.stats.totalAttachments > 0) {
      summary += `Includes ${conversation.stats.totalAttachments} attachments. `;
    }

    return summary.trim();
  }

  /**
   * Generate a detailed summary.
   */
  private generateDetailedSummary(conversation: UniversalConversation): string {
    const parts: string[] = [];

    // Overview
    parts.push(`# Conversation Summary`);
    parts.push(`Platform: ${conversation.platform}`);
    parts.push(`Model: ${conversation.model}`);
    parts.push(`Messages: ${conversation.messageCount}`);
    parts.push(`Date: ${new Date(conversation.createdAt).toISOString().split("T")[0]}`);
    parts.push("");

    // Main topics
    const topics = this.extractMainTopics(conversation.messages);
    if (topics.length > 0) {
      parts.push(`## Topics`);
      topics.forEach((t) => parts.push(`- ${t}`));
      parts.push("");
    }

    // Code summary
    if (conversation.stats.totalCodeBlocks > 0) {
      parts.push(`## Code`);
      parts.push(`Total code blocks: ${conversation.stats.totalCodeBlocks}`);
      parts.push(`Languages: ${conversation.stats.codeLanguages.join(", ")}`);
      parts.push("");
    }

    // Key exchanges
    const keyExchanges = this.extractKeyExchanges(conversation.messages);
    if (keyExchanges.length > 0) {
      parts.push(`## Key Exchanges`);
      keyExchanges.forEach((exchange, i) => {
        parts.push(`${i + 1}. ${exchange}`);
      });
    }

    return parts.join("\n");
  }

  /**
   * Extract main topics from messages.
   */
  private extractMainTopics(messages: UniversalMessage[]): string[] {
    const topics: Map<string, number> = new Map();

    for (const message of messages) {
      const words = message.content.toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 4);

      for (const word of words) {
        topics.set(word, (topics.get(word) || 0) + 1);
      }
    }

    // Sort by frequency and return top topics
    return Array.from(topics.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  /**
   * Extract goals from content.
   */
  private extractGoals(content: string): string[] {
    const goals: string[] = [];
    let match;

    while ((match = PATTERNS.goal.exec(content)) !== null) {
      const goal = match[1]?.trim();
      if (goal && goal.length > 5 && goal.length < 200) {
        goals.push(goal);
      }
    }

    return [...new Set(goals)].slice(0, 10);
  }

  /**
   * Extract decisions from content.
   */
  private extractDecisions(content: string): string[] {
    const decisions: string[] = [];
    let match;

    while ((match = PATTERNS.decision.exec(content)) !== null) {
      const decision = match[1]?.trim();
      if (decision && decision.length > 5 && decision.length < 200) {
        decisions.push(decision);
      }
    }

    return [...new Set(decisions)].slice(0, 10);
  }

  /**
   * Extract action items from content.
   */
  private extractActionItems(content: string): string[] {
    const actions: string[] = [];
    let match;

    while ((match = PATTERNS.action.exec(content)) !== null) {
      const action = match[1]?.trim();
      if (action && action.length > 5 && action.length < 200) {
        actions.push(action);
      }
    }

    return [...new Set(actions)].slice(0, 20);
  }

  /**
   * Extract technologies mentioned.
   */
  private extractTechnologies(content: string, conversation: UniversalConversation): string[] {
    const technologies = new Set<string>();
    const lowerContent = content.toLowerCase();

    for (const tech of TECHNOLOGY_KEYWORDS.tools) {
      if (lowerContent.includes(tech.toLowerCase())) {
        technologies.add(tech);
      }
    }

    // Add from conversation stats
    for (const tech of conversation.stats.mentionedTechnologies) {
      technologies.add(tech);
    }

    return Array.from(technologies);
  }

  /**
   * Extract libraries mentioned.
   */
  private extractLibraries(content: string, conversation: UniversalConversation): string[] {
    const libraries = new Set<string>();
    const lowerContent = content.toLowerCase();

    for (const lib of TECHNOLOGY_KEYWORDS.libraries) {
      if (lowerContent.includes(lib.toLowerCase())) {
        libraries.add(lib);
      }
    }

    // Extract from code blocks
    for (const message of conversation.messages) {
      for (const block of message.codeBlocks) {
        // Check for common imports
        const importMatch = block.code.match(/import\s+.*?from\s+['"]([^'"]+)['"]/g);
        if (importMatch) {
          importMatch.forEach((imp) => {
            const lib = imp.match(/['"]([^'"]+)['"]/)?.[1];
            if (lib && !lib.startsWith(".")) {
              libraries.add(lib.split("/")[0]);
            }
          });
        }
      }
    }

    return Array.from(libraries);
  }

  /**
   * Extract frameworks mentioned.
   */
  private extractFrameworks(content: string, conversation: UniversalConversation): string[] {
    const frameworks = new Set<string>();
    const lowerContent = content.toLowerCase();

    for (const fw of TECHNOLOGY_KEYWORDS.frameworks) {
      if (lowerContent.includes(fw.toLowerCase())) {
        frameworks.add(fw);
      }
    }

    return Array.from(frameworks);
  }

  /**
   * Extract programming languages from code blocks.
   */
  private extractLanguages(conversation: UniversalConversation): string[] {
    const languages = new Set<string>();

    for (const message of conversation.messages) {
      for (const block of message.codeBlocks) {
        if (block.language && block.language !== "text") {
          languages.add(block.language);
        }
      }
    }

    // Also check stats
    for (const lang of conversation.stats.codeLanguages) {
      languages.add(lang);
    }

    return Array.from(languages);
  }

  /**
   * Extract file names mentioned.
   */
  private extractFiles(content: string): string[] {
    const files = new Set<string>();
    let match;

    while ((match = PATTERNS.file.exec(content)) !== null) {
      const file = match[1]?.trim();
      if (file && file.length > 2 && file.length < 100) {
        files.add(file);
      }
    }

    return Array.from(files);
  }

  /**
   * Extract URLs mentioned.
   */
  private extractUrls(content: string): string[] {
    const urls: string[] = [];
    let match;

    while ((match = PATTERNS.url.exec(content)) !== null) {
      urls.push(match[1]);
    }

    return [...new Set(urls)].slice(0, 50);
  }

  /**
   * Extract future tasks mentioned.
   */
  private extractFutureTasks(content: string): string[] {
    const tasks: string[] = [];
    const futurePatterns = /(?:later|next time|future|someday|todo|pending|backlog)[:\s]+([^.!?]+)/gi;
    let match;

    while ((match = futurePatterns.exec(content)) !== null) {
      const task = match[1]?.trim();
      if (task && task.length > 5 && task.length < 200) {
        tasks.push(task);
      }
    }

    return [...new Set(tasks)].slice(0, 10);
  }

  /**
   * Extract questions asked.
   */
  private extractQuestions(content: string): string[] {
    const questions: string[] = [];
    const sentences = content.split(/[.!?]+/);

    for (const sentence of sentences) {
      if (sentence.includes("?")) {
        const question = sentence.trim();
        if (question.length > 10 && question.length < 300) {
          questions.push(question);
        }
      }
    }

    return questions.slice(0, 10);
  }

  /**
   * Extract risks mentioned.
   */
  private extractRisks(content: string): string[] {
    const risks: string[] = [];
    const riskPatterns = /(?:risk|danger|warning|careful|caution|issue|problem|bug|error|fail)[:\s]+([^.!?]+)/gi;
    let match;

    while ((match = riskPatterns.exec(content)) !== null) {
      const risk = match[1]?.trim();
      if (risk && risk.length > 5 && risk.length < 200) {
        risks.push(risk);
      }
    }

    return [...new Set(risks)].slice(0, 10);
  }

  /**
   * Extract unknowns mentioned.
   */
  private extractUnknowns(content: string): string[] {
    const unknowns: string[] = [];
    const unknownPatterns = /(?:unknown|unclear|not sure|don't know|unsure|tbd|to be determined)[:\s]+([^.!?]+)/gi;
    let match;

    while ((match = unknownPatterns.exec(content)) !== null) {
      const unknown = match[1]?.trim();
      if (unknown && unknown.length > 3 && unknown.length < 200) {
        unknowns.push(unknown);
      }
    }

    return [...new Set(unknowns)].slice(0, 10);
  }

  /**
   * Extract key exchanges (important user-assistant pairs).
   */
  private extractKeyExchanges(messages: UniversalMessage[]): string[] {
    const exchanges: string[] = [];

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      // Look for messages with code or important content
      if (message.metadata.hasCode || message.attachments.length > 0) {
        const preview = message.content.substring(0, 80);
        exchanges.push(`${message.role === "user" ? "Asked" : "Provided"}: ${preview}...`);
      }
    }

    return exchanges.slice(0, 10);
  }

  /**
   * Truncate text helper.
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + "...";
  }
}
