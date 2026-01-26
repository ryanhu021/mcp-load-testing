import { Tool } from "@modelcontextprotocol/sdk/types.js";

/**
 * Strategy for selecting which tool to execute next
 */
export type ToolSelectionStrategy = "rotate" | "random" | "weighted";

/**
 * Mode for determining test duration
 */
export type DurationMode = "request_count" | "time_based";

/**
 * Configuration for a specific tool in the load test
 */
export interface ToolConfig {
  tool: Tool;
  /** Weight for weighted random selection (higher = more likely) */
  weight: number;
  /** Whether to auto-generate params from schema or use static params */
  autoGenerateParams: boolean;
  /** Static parameters to use if autoGenerateParams is false */
  staticParams: Record<string, unknown>;
  /** Whether this tool is enabled in the load test */
  enabled: boolean;
}

/**
 * Main load test configuration
 */
export interface LoadTestConfig {
  /** Tools to include in the load test with their configurations */
  toolConfigs: ToolConfig[];
  /** Strategy for selecting tools */
  selectionStrategy: ToolSelectionStrategy;
  /** Mode for test duration */
  durationMode: DurationMode;
  /** Total number of requests (if durationMode is 'request_count') */
  requestCount: number;
  /** Test duration in seconds (if durationMode is 'time_based') */
  durationSeconds: number;
  /** Number of concurrent connections in the pool */
  poolSize: number;
  /** Target requests per second (null = unlimited) */
  targetTps: number | null;
  /** Whether TPS limiting is enabled */
  tpsEnabled: boolean;
}

/**
 * Default load test configuration
 */
export const DEFAULT_LOAD_TEST_CONFIG: LoadTestConfig = {
  toolConfigs: [],
  selectionStrategy: "rotate",
  durationMode: "request_count",
  requestCount: 100,
  durationSeconds: 60,
  poolSize: 10,
  targetTps: null,
  tpsEnabled: false,
};

/**
 * State of the load test runner
 */
export type LoadTestState =
  | "idle"
  | "running"
  | "paused"
  | "stopping"
  | "completed"
  | "error";

/**
 * Result of a single tool call
 */
export interface ToolCallResult {
  toolName: string;
  startTime: number;
  endTime: number;
  latencyMs: number;
  success: boolean;
  error?: string;
  /** Size of the response in bytes (approximate) */
  responseSize?: number;
}

/**
 * Real-time metrics during load test
 */
export interface LoadTestMetrics {
  /** Current state of the load test */
  state: LoadTestState;
  /** When the test started */
  startTime: number | null;
  /** Total elapsed time in ms */
  elapsedMs: number;
  /** Total requests completed */
  totalRequests: number;
  /** Total successful requests */
  successfulRequests: number;
  /** Total failed requests */
  failedRequests: number;
  /** Current requests per second */
  currentTps: number;
  /** Average latency in ms */
  avgLatencyMs: number;
  /** Minimum latency in ms */
  minLatencyMs: number;
  /** Maximum latency in ms */
  maxLatencyMs: number;
  /** P50 (median) latency in ms */
  p50LatencyMs: number;
  /** P95 latency in ms */
  p95LatencyMs: number;
  /** P99 latency in ms */
  p99LatencyMs: number;
  /** Error rate as a percentage (0-100) */
  errorRate: number;
  /** Metrics broken down by tool */
  perToolMetrics: Map<string, ToolMetrics>;
  /** Recent latency samples for charting (last N samples) */
  latencyHistory: LatencySample[];
  /** Recent TPS samples for charting */
  tpsHistory: TpsSample[];
}

/**
 * Metrics for a specific tool
 */
export interface ToolMetrics {
  toolName: string;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  avgLatencyMs: number;
  minLatencyMs: number;
  maxLatencyMs: number;
}

/**
 * A single latency sample for time-series charting
 */
export interface LatencySample {
  timestamp: number;
  avgLatencyMs: number;
  p50LatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
}

/**
 * A single TPS sample for time-series charting
 */
export interface TpsSample {
  timestamp: number;
  tps: number;
}

/**
 * Initial/empty metrics state
 */
export const EMPTY_METRICS: LoadTestMetrics = {
  state: "idle",
  startTime: null,
  elapsedMs: 0,
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  currentTps: 0,
  avgLatencyMs: 0,
  minLatencyMs: 0,
  maxLatencyMs: 0,
  p50LatencyMs: 0,
  p95LatencyMs: 0,
  p99LatencyMs: 0,
  errorRate: 0,
  perToolMetrics: new Map(),
  latencyHistory: [],
  tpsHistory: [],
};

/**
 * Events emitted by the load test runner
 */
export type LoadTestEvent =
  | { type: "started" }
  | { type: "stopped" }
  | { type: "paused" }
  | { type: "resumed" }
  | { type: "completed" }
  | { type: "error"; error: Error }
  | { type: "metrics"; metrics: LoadTestMetrics }
  | { type: "result"; result: ToolCallResult };
