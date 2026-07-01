/**
 * Platform Parsers — All AI platform conversation parsers.
 *
 * This module exports all parsers and the registry.
 * To add a new platform, create a parser and register it.
 */

export * from "./base";
export * from "./claude";
export * from "./chatgpt";
export * from "./gemini";
export * from "./grok";

import { parserRegistry } from "./base";
import { ClaudeParser } from "./claude";
import { ChatGPTParser } from "./chatgpt";
import { GeminiParser } from "./gemini";
import { GrokParser } from "./grok";
import type { Platform } from "../types/omni";

// Register all built-in parsers
parserRegistry.register(new ClaudeParser());
parserRegistry.register(new ChatGPTParser());
parserRegistry.register(new GeminiParser());
parserRegistry.register(new GrokParser());

/**
 * Initialize all parsers.
 */
export function initializeParsers(): void {
  // Parsers are auto-registered on import
  console.log("[Parsers] Initialized:", parserRegistry.getAll().map((p) => p.platform).join(", "));
}

/**
 * Get parser for a platform.
 */
export function getParserForPlatform(platform: Platform) {
  return parserRegistry.get(platform);
}

/**
 * Detect platform from URL and hostname.
 */
export function detectPlatform(url: string, hostname: string) {
  // Note: 'parserRegistry' variable correctly imported/initialized above.
  // The linter warning appears due to hoisting behavior; runtime is correct.
  return parserRegistry.detect(url, hostname);
}

// Re-export registry for external use
export { parserRegistry };
