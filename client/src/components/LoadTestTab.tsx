import { TabsContent } from "@/components/ui/tabs";
import { Tool } from "@modelcontextprotocol/sdk/types.js";
import { useLoadTest } from "@/lib/hooks/useLoadTest";
import { useEffect, useMemo } from "react";
import LoadTestConfigComponent from "./LoadTestConfig";
import LoadTestMetricsComponent from "./LoadTestMetrics";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { InspectorConfig } from "@/lib/configurationTypes";
import { getMCPProxyAddress, getMCPProxyAuthToken } from "@/utils/configUtils";

interface LoadTestTabProps {
  tools: Tool[];
  serverUrl: string; // The actual MCP server URL (not the proxy URL)
  customHeaders: Record<string, string>; // User-configured custom headers
  transportType: "stdio" | "sse" | "streamable-http";
  oauthAccessToken?: string;
  inspectorConfig: InspectorConfig;
}

const LoadTestTab = ({
  tools,
  serverUrl,
  customHeaders,
  transportType,
  oauthAccessToken,
  inspectorConfig,
}: LoadTestTabProps) => {
  // Compute the proxy URL for load testing
  const proxyUrl = useMemo(() => {
    const url = new URL(`${getMCPProxyAddress(inspectorConfig)}/mcp`);
    url.searchParams.set("transportType", "streamable-http");
    url.searchParams.set("url", serverUrl);
    return url.toString();
  }, [inspectorConfig, serverUrl]);

  // Merge all headers: custom headers + proxy auth + OAuth token
  const effectiveHeaders = useMemo(() => {
    const { token: proxyAuthToken, header: proxyAuthHeader } =
      getMCPProxyAuthToken(inspectorConfig);
    return {
      ...customHeaders,
      ...(proxyAuthToken
        ? { [proxyAuthHeader]: `Bearer ${proxyAuthToken}` }
        : {}),
      ...(oauthAccessToken
        ? { Authorization: `Bearer ${oauthAccessToken}` }
        : {}),
    };
  }, [inspectorConfig, customHeaders, oauthAccessToken]);

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
    serverUrl: proxyUrl,
    headers: effectiveHeaders,
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
