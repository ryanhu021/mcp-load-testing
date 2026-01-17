import { useState, useCallback, useRef, useEffect } from "react";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  LoadTestConfig,
  LoadTestConnectionConfig,
  LoadTestMetrics,
  LoadTestState,
  ToolConfig,
  EMPTY_METRICS,
  DEFAULT_LOAD_TEST_CONFIG,
  LoadTestEvent,
  ToolCallResult,
} from "../loadTest/types";
import { LoadTestRunner } from "../loadTest/loadTestRunner";

interface UseLoadTestOptions {
  serverUrl: string;
  headers: Record<string, string>;
}

interface UseLoadTestReturn {
  // State
  config: LoadTestConfig;
  metrics: LoadTestMetrics;
  state: LoadTestState;
  recentResults: ToolCallResult[];

  // Config setters
  setToolConfigs: (configs: ToolConfig[]) => void;
  updateToolConfig: (toolName: string, updates: Partial<ToolConfig>) => void;
  setSelectionStrategy: (strategy: LoadTestConfig["selectionStrategy"]) => void;
  setDurationMode: (mode: LoadTestConfig["durationMode"]) => void;
  setRequestCount: (count: number) => void;
  setDurationSeconds: (seconds: number) => void;
  setPoolSize: (size: number) => void;
  setTargetTps: (tps: number | null) => void;
  setTpsEnabled: (enabled: boolean) => void;

  // Actions
  start: () => Promise<void>;
  stop: () => Promise<void>;
  reset: () => void;

  // Helpers
  initializeToolConfigs: (tools: Tool[]) => void;
}

const MAX_RECENT_RESULTS = 100;

export function useLoadTest({
  serverUrl,
  headers,
}: UseLoadTestOptions): UseLoadTestReturn {
  const [config, setConfig] = useState<LoadTestConfig>(
    DEFAULT_LOAD_TEST_CONFIG,
  );
  const [metrics, setMetrics] = useState<LoadTestMetrics>(EMPTY_METRICS);
  const [recentResults, setRecentResults] = useState<ToolCallResult[]>([]);
  const runnerRef = useRef<LoadTestRunner | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (runnerRef.current) {
        runnerRef.current.stop().catch(console.error);
      }
    };
  }, []);

  const handleEvent = useCallback((event: LoadTestEvent) => {
    switch (event.type) {
      case "metrics":
        setMetrics(event.metrics);
        break;
      case "result":
        setRecentResults((prev) => {
          const next = [...prev, event.result];
          if (next.length > MAX_RECENT_RESULTS) {
            return next.slice(-MAX_RECENT_RESULTS);
          }
          return next;
        });
        break;
      case "completed":
      case "stopped":
      case "error":
        // Final metrics update
        if (runnerRef.current) {
          setMetrics(runnerRef.current.getMetrics());
        }
        break;
    }
  }, []);

  const start = useCallback(async () => {
    if (runnerRef.current) {
      await runnerRef.current.stop();
    }

    const connectionConfig: LoadTestConnectionConfig = {
      serverUrl,
      headers,
    };

    const runner = new LoadTestRunner(config, connectionConfig);
    runnerRef.current = runner;

    // Subscribe to events
    runner.on(handleEvent);

    setRecentResults([]);
    setMetrics({ ...EMPTY_METRICS, state: "running" });

    await runner.start();
  }, [config, serverUrl, headers, handleEvent]);

  const stop = useCallback(async () => {
    if (runnerRef.current) {
      await runnerRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    setMetrics(EMPTY_METRICS);
    setRecentResults([]);
  }, []);

  // Config setters
  const setToolConfigs = useCallback((configs: ToolConfig[]) => {
    setConfig((prev) => ({ ...prev, toolConfigs: configs }));
  }, []);

  const updateToolConfig = useCallback(
    (toolName: string, updates: Partial<ToolConfig>) => {
      setConfig((prev) => ({
        ...prev,
        toolConfigs: prev.toolConfigs.map((tc) =>
          tc.tool.name === toolName ? { ...tc, ...updates } : tc,
        ),
      }));
    },
    [],
  );

  const setSelectionStrategy = useCallback(
    (strategy: LoadTestConfig["selectionStrategy"]) => {
      setConfig((prev) => ({ ...prev, selectionStrategy: strategy }));
    },
    [],
  );

  const setDurationMode = useCallback(
    (mode: LoadTestConfig["durationMode"]) => {
      setConfig((prev) => ({ ...prev, durationMode: mode }));
    },
    [],
  );

  const setRequestCount = useCallback((count: number) => {
    setConfig((prev) => ({ ...prev, requestCount: count }));
  }, []);

  const setDurationSeconds = useCallback((seconds: number) => {
    setConfig((prev) => ({ ...prev, durationSeconds: seconds }));
  }, []);

  const setPoolSize = useCallback((size: number) => {
    setConfig((prev) => ({
      ...prev,
      poolSize: Math.max(1, Math.min(100, size)),
    }));
  }, []);

  const setTargetTps = useCallback((tps: number | null) => {
    setConfig((prev) => ({ ...prev, targetTps: tps }));
  }, []);

  const setTpsEnabled = useCallback((enabled: boolean) => {
    setConfig((prev) => ({ ...prev, tpsEnabled: enabled }));
  }, []);

  const initializeToolConfigs = useCallback((tools: Tool[]) => {
    const configs: ToolConfig[] = tools.map((tool) => ({
      tool,
      weight: 1,
      autoGenerateParams: true,
      staticParams: {},
      enabled: false,
    }));
    setConfig((prev) => ({ ...prev, toolConfigs: configs }));
  }, []);

  return {
    config,
    metrics,
    state: metrics.state,
    recentResults,
    setToolConfigs,
    updateToolConfig,
    setSelectionStrategy,
    setDurationMode,
    setRequestCount,
    setDurationSeconds,
    setPoolSize,
    setTargetTps,
    setTpsEnabled,
    start,
    stop,
    reset,
    initializeToolConfigs,
  };
}
