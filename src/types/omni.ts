/**
 * Omni Core Types — Shared across all engines and components.
 */

export type UUID = string;

export type Timestamp = number;

export type Platform =
  | "Claude"
  | "ChatGPT"
  | "Gemini"
  | "Grok"
  | "DeepSeek"
  | "Perplexity"
  | "Microsoft Copilot"
  | "Google AI Studio"
  | "Other";

export type PlatformURL = string;

export type ThemeMode = "dark" | "light" | "system";

export type AppStatus = "idle" | "loading" | "success" | "error" | "warning";

export type NotificationLevel = "info" | "success" | "warning" | "error";

export type ExportFormat = "markdown" | "json" | "txt" | "pdf";

export type ConnectionStatus = "disconnected" | "connecting" | "connected" | "error";

export type TaskStatus = "pending" | "in-progress" | "completed" | "cancelled";

export type ViewType =
  | "workspace"
  | "project"
  | "transfer"
  | "settings"
  | "search"
  | "timeline"
  | "history"
  | "compare"
  | "export";

export type StorageBackend = "chrome" | "indexeddb" | "memory" | "cloud";

export type StorageArea = "local" | "sync" | "session" | "managed";

export interface OMNIError {
  code: string;
  message: string;
  context?: Record<string, unknown>;
  cause?: Error;
  timestamp: Timestamp;
}

export interface PageInfo {
  url: string;
  hostname: string;
  title: string;
  platform: Platform;
  isSupported: boolean;
}
