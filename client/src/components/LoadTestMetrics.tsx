import { LoadTestMetrics, ToolMetrics } from "@/lib/loadTest/types";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

interface LoadTestMetricsProps {
  metrics: LoadTestMetrics;
}

const formatDuration = (ms: number): string => {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes > 0) {
    return `${minutes}m ${remainingSeconds}s`;
  }
  return `${seconds}s`;
};

const formatNumber = (n: number, decimals = 1): string => {
  if (n === 0) return "0";
  if (n < 0.1) return n.toFixed(2);
  return n.toFixed(decimals);
};

const StatCard = ({
  label,
  value,
  unit,
  variant = "default",
}: {
  label: string;
  value: string | number;
  unit?: string;
  variant?: "default" | "success" | "error";
}) => {
  const variantClasses = {
    default: "bg-gray-50 dark:bg-gray-800",
    success: "bg-green-50 dark:bg-green-900/30",
    error: "bg-red-50 dark:bg-red-900/30",
  };

  return (
    <div className={`p-3 rounded-lg ${variantClasses[variant]}`}>
      <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">
        {label}
      </div>
      <div className="text-xl font-bold mt-1">
        {value}
        {unit && (
          <span className="text-sm font-normal text-gray-500 ml-1">{unit}</span>
        )}
      </div>
    </div>
  );
};

const LoadTestMetricsComponent = ({ metrics }: LoadTestMetricsProps) => {
  const isIdle = metrics.state === "idle";
  const isRunning = metrics.state === "running";

  // Prepare chart data
  const latencyChartData = metrics.latencyHistory.map((sample, index) => ({
    index,
    avg: sample.avgLatencyMs,
    p50: sample.p50LatencyMs,
    p95: sample.p95LatencyMs,
    p99: sample.p99LatencyMs,
  }));

  const tpsChartData = metrics.tpsHistory.map((sample, index) => ({
    index,
    tps: sample.tps,
  }));

  // Per-tool metrics as array
  const toolMetricsArray = Array.from(metrics.perToolMetrics.values());

  return (
    <div className="space-y-6">
      {/* Status Badge */}
      <div className="flex items-center gap-2">
        <div
          className={`w-3 h-3 rounded-full ${
            isRunning
              ? "bg-green-500 animate-pulse"
              : metrics.state === "completed"
                ? "bg-blue-500"
                : metrics.state === "error"
                  ? "bg-red-500"
                  : "bg-gray-400"
          }`}
        />
        <span className="text-sm font-medium capitalize">{metrics.state}</span>
        {isRunning && (
          <span className="text-sm text-gray-500">
            ({formatDuration(metrics.elapsedMs)})
          </span>
        )}
      </div>

      {/* Summary Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          label="Total Requests"
          value={metrics.totalRequests.toLocaleString()}
        />
        <StatCard
          label="Current TPS"
          value={formatNumber(metrics.currentTps)}
          unit="req/s"
        />
        <StatCard
          label="Successful"
          value={metrics.successfulRequests.toLocaleString()}
          variant="success"
        />
        <StatCard
          label="Failed"
          value={metrics.failedRequests.toLocaleString()}
          variant={metrics.failedRequests > 0 ? "error" : "default"}
        />
      </div>

      {/* Latency Stats */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Latency</h4>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <StatCard
            label="Average"
            value={formatNumber(metrics.avgLatencyMs)}
            unit="ms"
          />
          <StatCard
            label="Min"
            value={formatNumber(metrics.minLatencyMs)}
            unit="ms"
          />
          <StatCard
            label="P50"
            value={formatNumber(metrics.p50LatencyMs)}
            unit="ms"
          />
          <StatCard
            label="P95"
            value={formatNumber(metrics.p95LatencyMs)}
            unit="ms"
          />
          <StatCard
            label="P99"
            value={formatNumber(metrics.p99LatencyMs)}
            unit="ms"
          />
        </div>
      </div>

      {/* Error Rate */}
      <div className="space-y-2">
        <h4 className="text-sm font-semibold">Error Rate</h4>
        <div className="flex items-center gap-2">
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              className="bg-red-500 h-2 rounded-full transition-all"
              style={{ width: `${Math.min(metrics.errorRate, 100)}%` }}
            />
          </div>
          <span className="text-sm font-medium w-16 text-right">
            {formatNumber(metrics.errorRate)}%
          </span>
        </div>
      </div>

      {/* TPS Chart */}
      {tpsChartData.length > 1 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Throughput Over Time</h4>
          <div className="h-48 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={tpsChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="index" hide />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                  }}
                  formatter={(value) => [
                    `${formatNumber(value as number)} req/s`,
                    "TPS",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="tps"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Latency Chart */}
      {latencyChartData.length > 1 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Latency Over Time</h4>
          <div className="h-48 bg-gray-50 dark:bg-gray-800 rounded-lg p-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latencyChartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                <XAxis dataKey="index" hide />
                <YAxis />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--background)",
                    border: "1px solid var(--border)",
                  }}
                  formatter={(value) => [`${formatNumber(value as number)} ms`]}
                />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="avg"
                  name="Avg"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p50"
                  name="P50"
                  stroke="#3b82f6"
                  strokeWidth={1}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p95"
                  name="P95"
                  stroke="#f59e0b"
                  strokeWidth={1}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="p99"
                  name="P99"
                  stroke="#ef4444"
                  strokeWidth={1}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Per-Tool Breakdown */}
      {toolMetricsArray.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">Per-Tool Breakdown</h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700">
                  <th className="text-left py-2 px-2">Tool</th>
                  <th className="text-right py-2 px-2">Requests</th>
                  <th className="text-right py-2 px-2">Success</th>
                  <th className="text-right py-2 px-2">Failed</th>
                  <th className="text-right py-2 px-2">Avg</th>
                  <th className="text-right py-2 px-2">P50</th>
                  <th className="text-right py-2 px-2">P95</th>
                  <th className="text-right py-2 px-2">P99</th>
                </tr>
              </thead>
              <tbody>
                {toolMetricsArray.map((tm: ToolMetrics) => (
                  <tr
                    key={tm.toolName}
                    className="border-b dark:border-gray-700 last:border-0"
                  >
                    <td className="py-2 px-2 font-medium">{tm.toolName}</td>
                    <td className="text-right py-2 px-2">
                      {tm.totalRequests.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-2 text-green-600">
                      {tm.successfulRequests.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-2 text-red-600">
                      {tm.failedRequests.toLocaleString()}
                    </td>
                    <td className="text-right py-2 px-2">
                      {formatNumber(tm.avgLatencyMs)} ms
                    </td>
                    <td className="text-right py-2 px-2">
                      {formatNumber(tm.p50LatencyMs)} ms
                    </td>
                    <td className="text-right py-2 px-2">
                      {formatNumber(tm.p95LatencyMs)} ms
                    </td>
                    <td className="text-right py-2 px-2">
                      {formatNumber(tm.p99LatencyMs)} ms
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Empty State */}
      {isIdle && metrics.totalRequests === 0 && (
        <div className="text-center py-8 text-gray-500">
          <p>Configure your load test and click Start to begin</p>
        </div>
      )}
    </div>
  );
};

export default LoadTestMetricsComponent;
