import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import {
  LoadTestConfig,
  LoadTestMetrics,
  LoadTestState,
  LoadTestEvent,
  ToolCallResult,
  ToolMetrics,
  LatencySample,
  TpsSample,
} from "./types";
import { ToolSelector } from "./toolSelector";
import { paramGenerator } from "./paramGenerator";

const MAX_HISTORY_SAMPLES = 60;
const METRICS_UPDATE_INTERVAL_MS = 500;

/**
 * Rate limiter using token bucket algorithm
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private tokensPerSecond: number;
  private maxTokens: number;

  constructor(tokensPerSecond: number) {
    this.tokensPerSecond = tokensPerSecond;
    this.maxTokens = tokensPerSecond;
    this.tokens = tokensPerSecond;
    this.lastRefill = Date.now();
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();

      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      // Wait for tokens to refill
      const waitMs = (1 / this.tokensPerSecond) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const newTokens = elapsed * this.tokensPerSecond;
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens);
    this.lastRefill = now;
  }
}

/**
 * Running statistics calculator
 */
class StatsCollector {
  private latencies: number[] = [];
  private recentLatencies: number[] = [];
  private windowStart: number = Date.now();
  private requestsInWindow: number = 0;

  addLatency(latencyMs: number): void {
    this.latencies.push(latencyMs);
    this.recentLatencies.push(latencyMs);
    this.requestsInWindow++;

    // Keep recent latencies to a reasonable size
    if (this.recentLatencies.length > 1000) {
      this.recentLatencies = this.recentLatencies.slice(-500);
    }
  }

  getPercentile(p: number): number {
    if (this.latencies.length === 0) return 0;

    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  getAverage(): number {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  getMin(): number {
    if (this.latencies.length === 0) return 0;
    return Math.min(...this.latencies);
  }

  getMax(): number {
    if (this.latencies.length === 0) return 0;
    return Math.max(...this.latencies);
  }

  getCurrentTps(): number {
    const now = Date.now();
    const elapsed = (now - this.windowStart) / 1000;

    if (elapsed >= 1) {
      const tps = this.requestsInWindow / elapsed;
      this.windowStart = now;
      this.requestsInWindow = 0;
      return tps;
    }

    return this.requestsInWindow / Math.max(elapsed, 0.1);
  }

  reset(): void {
    this.latencies = [];
    this.recentLatencies = [];
    this.windowStart = Date.now();
    this.requestsInWindow = 0;
  }
}

/**
 * Main load test runner
 */
export class LoadTestRunner {
  private config: LoadTestConfig;
  private mcpClient: Client;
  private toolSelector: ToolSelector | null = null;
  private rateLimiter: RateLimiter | null = null;
  private statsCollector: StatsCollector;

  private state: LoadTestState = "idle";
  private startTime: number | null = null;
  private totalRequests = 0;
  private successfulRequests = 0;
  private failedRequests = 0;
  private perToolMetrics: Map<string, ToolMetrics> = new Map();
  private perToolLatencies: Map<string, number[]> = new Map();
  private latencyHistory: LatencySample[] = [];
  private tpsHistory: TpsSample[] = [];

  private eventListeners: Set<(event: LoadTestEvent) => void> = new Set();
  private metricsInterval: ReturnType<typeof setInterval> | null = null;
  private shouldStop = false;
  private activeWorkers = 0;

  constructor(config: LoadTestConfig, mcpClient: Client) {
    this.config = config;
    this.mcpClient = mcpClient;
    this.statsCollector = new StatsCollector();
  }

  /**
   * Subscribe to load test events
   */
  on(listener: (event: LoadTestEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private emit(event: LoadTestEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (e) {
        console.error("Error in event listener:", e);
      }
    }
  }

  /**
   * Start the load test
   */
  async start(): Promise<void> {
    if (this.state === "running") {
      throw new Error("Load test is already running");
    }

    this.reset();
    this.state = "running";
    this.startTime = Date.now();
    this.shouldStop = false;

    // Initialize components
    this.toolSelector = new ToolSelector(
      this.config.toolConfigs,
      this.config.selectionStrategy,
    );

    if (this.config.tpsEnabled && this.config.targetTps) {
      this.rateLimiter = new RateLimiter(this.config.targetTps);
    }

    // Initialize per-tool metrics
    for (const tc of this.config.toolConfigs) {
      if (tc.enabled) {
        this.perToolMetrics.set(tc.tool.name, {
          toolName: tc.tool.name,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          avgLatencyMs: 0,
          minLatencyMs: Infinity,
          maxLatencyMs: 0,
          p50LatencyMs: 0,
          p95LatencyMs: 0,
          p99LatencyMs: 0,
        });
        this.perToolLatencies.set(tc.tool.name, []);
      }
    }

    this.emit({ type: "started" });

    // Start metrics update interval
    this.metricsInterval = setInterval(() => {
      this.updateMetricsHistory();
      this.emit({ type: "metrics", metrics: this.getMetrics() });
    }, METRICS_UPDATE_INTERVAL_MS);

    try {
      await this.runWorkers();
    } catch (e) {
      this.state = "error";
      this.emit({ type: "error", error: e as Error });
    } finally {
      this.cleanup();
    }
  }

  /**
   * Run worker tasks concurrently
   */
  private async runWorkers(): Promise<void> {
    const workers: Promise<void>[] = [];

    for (let i = 0; i < this.config.poolSize; i++) {
      workers.push(this.worker());
    }

    await Promise.all(workers);

    this.state = "completed";
    this.emit({ type: "completed" });
  }

  /**
   * Individual worker loop
   */
  private async worker(): Promise<void> {
    this.activeWorkers++;

    try {
      while (!this.shouldStopWorker()) {
        // Apply rate limiting if enabled
        if (this.rateLimiter) {
          await this.rateLimiter.acquire();
        }

        if (this.shouldStopWorker()) break;

        const toolConfig = this.toolSelector!.next();
        const params = paramGenerator.generate(
          toolConfig.tool,
          toolConfig.autoGenerateParams,
          toolConfig.staticParams,
        );

        const result = await this.executeToolCall(toolConfig.tool.name, params);

        this.recordResult(result);
      }
    } finally {
      this.activeWorkers--;
    }
  }

  /**
   * Check if worker should stop
   */
  private shouldStopWorker(): boolean {
    if (this.shouldStop || this.state === "stopping") {
      return true;
    }

    if (this.config.durationMode === "request_count") {
      return this.totalRequests >= this.config.requestCount;
    }

    if (this.config.durationMode === "time_based" && this.startTime) {
      const elapsed = (Date.now() - this.startTime) / 1000;
      return elapsed >= this.config.durationSeconds;
    }

    return false;
  }

  /**
   * Execute a single tool call
   */
  private async executeToolCall(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const startTime = Date.now();

    try {
      const result = await this.mcpClient.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: params,
          },
        },
        CallToolResultSchema,
      );
      const endTime = Date.now();

      const content = result.content as Array<{ type: string; text?: string }>;

      return {
        toolName,
        startTime,
        endTime,
        latencyMs: endTime - startTime,
        success: !result.isError,
        error: result.isError
          ? content.map((c) => c.text ?? "").join("")
          : undefined,
        responseSize: JSON.stringify(result).length,
      };
    } catch (e) {
      const endTime = Date.now();
      return {
        toolName,
        startTime,
        endTime,
        latencyMs: endTime - startTime,
        success: false,
        error: e instanceof Error ? e.message : String(e),
      };
    }
  }

  /**
   * Record a tool call result
   */
  private recordResult(result: ToolCallResult): void {
    this.totalRequests++;

    if (result.success) {
      this.successfulRequests++;
    } else {
      this.failedRequests++;
    }

    this.statsCollector.addLatency(result.latencyMs);

    // Update per-tool metrics
    const toolMetrics = this.perToolMetrics.get(result.toolName);
    const toolLatencies = this.perToolLatencies.get(result.toolName);
    if (toolMetrics && toolLatencies) {
      toolMetrics.totalRequests++;
      if (result.success) {
        toolMetrics.successfulRequests++;
      } else {
        toolMetrics.failedRequests++;
      }

      // Track latency for percentile calculations
      toolLatencies.push(result.latencyMs);

      // Running average
      toolMetrics.avgLatencyMs =
        (toolMetrics.avgLatencyMs * (toolMetrics.totalRequests - 1) +
          result.latencyMs) /
        toolMetrics.totalRequests;
      toolMetrics.minLatencyMs = Math.min(
        toolMetrics.minLatencyMs,
        result.latencyMs,
      );
      toolMetrics.maxLatencyMs = Math.max(
        toolMetrics.maxLatencyMs,
        result.latencyMs,
      );

      // Calculate percentiles
      toolMetrics.p50LatencyMs = this.getPercentile(toolLatencies, 50);
      toolMetrics.p95LatencyMs = this.getPercentile(toolLatencies, 95);
      toolMetrics.p99LatencyMs = this.getPercentile(toolLatencies, 99);
    }

    this.emit({ type: "result", result });
  }

  /**
   * Calculate percentile from an array of values
   */
  private getPercentile(values: number[], p: number): number {
    if (values.length === 0) return 0;
    const sorted = [...values].sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Update metrics history for charting
   */
  private updateMetricsHistory(): void {
    const now = Date.now();

    // Add latency sample
    this.latencyHistory.push({
      timestamp: now,
      avgLatencyMs: this.statsCollector.getAverage(),
      p50LatencyMs: this.statsCollector.getPercentile(50),
      p95LatencyMs: this.statsCollector.getPercentile(95),
      p99LatencyMs: this.statsCollector.getPercentile(99),
    });

    // Add TPS sample
    this.tpsHistory.push({
      timestamp: now,
      tps: this.statsCollector.getCurrentTps(),
    });

    // Trim history
    if (this.latencyHistory.length > MAX_HISTORY_SAMPLES) {
      this.latencyHistory = this.latencyHistory.slice(-MAX_HISTORY_SAMPLES);
    }
    if (this.tpsHistory.length > MAX_HISTORY_SAMPLES) {
      this.tpsHistory = this.tpsHistory.slice(-MAX_HISTORY_SAMPLES);
    }
  }

  /**
   * Get current metrics
   */
  getMetrics(): LoadTestMetrics {
    const elapsedMs = this.startTime ? Date.now() - this.startTime : 0;

    return {
      state: this.state,
      startTime: this.startTime,
      elapsedMs,
      totalRequests: this.totalRequests,
      successfulRequests: this.successfulRequests,
      failedRequests: this.failedRequests,
      currentTps: this.statsCollector.getCurrentTps(),
      avgLatencyMs: this.statsCollector.getAverage(),
      minLatencyMs: this.statsCollector.getMin(),
      maxLatencyMs: this.statsCollector.getMax(),
      p50LatencyMs: this.statsCollector.getPercentile(50),
      p95LatencyMs: this.statsCollector.getPercentile(95),
      p99LatencyMs: this.statsCollector.getPercentile(99),
      errorRate:
        this.totalRequests > 0
          ? (this.failedRequests / this.totalRequests) * 100
          : 0,
      perToolMetrics: new Map(this.perToolMetrics),
      latencyHistory: [...this.latencyHistory],
      tpsHistory: [...this.tpsHistory],
    };
  }

  /**
   * Stop the load test
   */
  async stop(): Promise<void> {
    if (this.state !== "running") return;

    this.state = "stopping";
    this.shouldStop = true;
    this.emit({ type: "stopped" });

    // Wait for workers to finish
    while (this.activeWorkers > 0) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.cleanup();
  }

  /**
   * Reset all state
   */
  private reset(): void {
    this.totalRequests = 0;
    this.successfulRequests = 0;
    this.failedRequests = 0;
    this.perToolMetrics.clear();
    this.perToolLatencies.clear();
    this.latencyHistory = [];
    this.tpsHistory = [];
    this.statsCollector.reset();
    this.startTime = null;
    this.shouldStop = false;
    this.activeWorkers = 0;
  }

  /**
   * Cleanup resources
   */
  private cleanup(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
  }

  /**
   * Get current state
   */
  getState(): LoadTestState {
    return this.state;
  }
}
