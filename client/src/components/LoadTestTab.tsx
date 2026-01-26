import { TabsContent } from "@/components/ui/tabs";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { useLoadTest } from "@/lib/hooks/useLoadTest";
import { useEffect } from "react";
import LoadTestConfigComponent from "./LoadTestConfig";
import LoadTestMetricsComponent from "./LoadTestMetrics";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";

interface LoadTestTabProps {
  tools: Tool[];
  mcpClient: Client | null;
  transportType: "stdio" | "sse" | "streamable-http";
}

const LoadTestTab = ({ tools, mcpClient, transportType }: LoadTestTabProps) => {
  const {
    config,
    metrics,
    state,
    setSelectionStrategy,
    setDurationMode,
    setRequestCount,
    setDurationSeconds,
    setPoolSize,
    setTargetTps,
    setTpsEnabled,
    updateToolConfig,
    start,
    stop,
    initializeToolConfigs,
  } = useLoadTest({
    mcpClient,
  });

  // Initialize tool configs when tools change
  useEffect(() => {
    if (tools.length > 0) {
      initializeToolConfigs(tools);
    }
  }, [tools, initializeToolConfigs]);

  const isStreamableHttp = transportType === "streamable-http";
  const isRunning = state === "running";

  if (!isStreamableHttp) {
    return (
      <TabsContent value="loadtest">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Load testing is only available for Streamable HTTP transport. Please
            switch to Streamable HTTP in the sidebar to use this feature.
          </AlertDescription>
        </Alert>
      </TabsContent>
    );
  }

  if (tools.length === 0) {
    return (
      <TabsContent value="loadtest">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            No tools available. Please list tools from the Tools tab first
            before running a load test.
          </AlertDescription>
        </Alert>
      </TabsContent>
    );
  }

  return (
    <TabsContent value="loadtest">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Configuration Panel */}
        <div className="bg-card border border-border rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4 text-lg">Configuration</h3>
          <LoadTestConfigComponent
            config={config}
            isRunning={isRunning}
            onStart={start}
            onStop={stop}
            onUpdateToolConfig={updateToolConfig}
            onSetSelectionStrategy={setSelectionStrategy}
            onSetDurationMode={setDurationMode}
            onSetRequestCount={setRequestCount}
            onSetDurationSeconds={setDurationSeconds}
            onSetPoolSize={setPoolSize}
            onSetTargetTps={setTargetTps}
            onSetTpsEnabled={setTpsEnabled}
          />
        </div>

        {/* Metrics Panel */}
        <div className="bg-card border border-border rounded-lg shadow p-4">
          <h3 className="font-semibold mb-4 text-lg">Metrics</h3>
          <LoadTestMetricsComponent metrics={metrics} />
        </div>
      </div>
    </TabsContent>
  );
};

export default LoadTestTab;
