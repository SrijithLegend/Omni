/**
 * BaseEngine — The foundation for all Omni engines.
 *
 * Every engine must implement this contract for lifecycle management,
 * error handling, and inter-engine communication.
 */

export interface EngineConfig {
  name: string;
  version: string;
  debug: boolean;
}

export abstract class BaseEngine {
  readonly name: string;
  readonly version: string;
  protected debug: boolean;
  protected isRunning = false;
  protected dependencies: Set<string> = new Set();
  protected listeners: Map<string, Set<(...args: any[]) => void>> = new Map();

  constructor(config: EngineConfig) {
    this.name = config.name;
    this.version = config.version;
    this.debug = config.debug;
  }

  /** Start the engine. Must resolve when engine is ready. */
  abstract start(): Promise<void>;

  /** Graceful shutdown. Must clear all state, listeners, and timers. */
  abstract stop(): Promise<void>;

  /** Check if the engine is healthy and operational. */
  abstract health(): Promise<HealthStatus>;

  /** Log a message if debug mode is enabled. */
  protected log(level: "info" | "warn" | "error" | "debug", ...args: unknown[]): void {
    if (!this.debug && level === "debug") return;
    const prefix = `[${this.name} v${this.version}]`;
    if (level === "error") console.error(prefix, ...args);
    else if (level === "warn") console.warn(prefix, ...args);
    else if (level === "debug") console.debug(prefix, ...args);
    else console.info(prefix, ...args);
  }

  /** Emit an event to internal listeners. */
  protected emit(event: string, ...args: unknown[]): void {
    const handlers = this.listeners.get(event);
    if (!handlers) return;
    handlers.forEach((h) => {
      try {
        h(...args);
      } catch (err) {
        this.log("error", "Listener error for event", event, err);
      }
    });
  }

  /** Subscribe to an internal engine event. */
  on(event: string, handler: (...args: any[]) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return () => {
      this.listeners.get(event)?.delete(handler);
    };
  }

  /** Declare a dependency on another engine. */
  dependsOn(engineName: string): void {
    this.dependencies.add(engineName);
  }

  get running() {
    return this.isRunning;
  }
}

export type HealthStatus = {
  ok: boolean;
  message: string;
  details?: Record<string, unknown>;
  timestamp: number;
};

export type EngineRegistry = Map<string, BaseEngine>;

/** Global engine registry for cross-engine lookups. */
let _registry: EngineRegistry = new Map();

export function registerEngine(engine: BaseEngine): void {
  _registry.set(engine.name, engine);
}

export function getEngine<T extends BaseEngine>(name: string): T | undefined {
  return _registry.get(name) as T | undefined;
}

export function getRegistry(): EngineRegistry {
  return new Map(_registry);
}

export function clearRegistry(): void {
  _registry.clear();
}

export { BaseEngine }