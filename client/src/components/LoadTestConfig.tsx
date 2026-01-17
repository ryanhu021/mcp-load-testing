import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  LoadTestConfig,
  ToolConfig,
  ToolSelectionStrategy,
  DurationMode,
} from "@/lib/loadTest/types";
import { ChevronDown, ChevronUp, Play, Square } from "lucide-react";
import { useState } from "react";

interface LoadTestConfigProps {
  config: LoadTestConfig;
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onUpdateToolConfig: (toolName: string, updates: Partial<ToolConfig>) => void;
  onSetSelectionStrategy: (strategy: ToolSelectionStrategy) => void;
  onSetDurationMode: (mode: DurationMode) => void;
  onSetRequestCount: (count: number) => void;
  onSetDurationSeconds: (seconds: number) => void;
  onSetPoolSize: (size: number) => void;
  onSetTargetTps: (tps: number | null) => void;
  onSetTpsEnabled: (enabled: boolean) => void;
}

const LoadTestConfigComponent = ({
  config,
  isRunning,
  onStart,
  onStop,
  onUpdateToolConfig,
  onSetSelectionStrategy,
  onSetDurationMode,
  onSetRequestCount,
  onSetDurationSeconds,
  onSetPoolSize,
  onSetTargetTps,
  onSetTpsEnabled,
}: LoadTestConfigProps) => {
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());

  const toggleToolExpanded = (toolName: string) => {
    setExpandedTools((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  const enabledToolsCount = config.toolConfigs.filter(
    (tc) => tc.enabled,
  ).length;

  return (
    <div className="space-y-6">
      {/* Start/Stop Button */}
      <div className="flex gap-2">
        {isRunning ? (
          <Button onClick={onStop} variant="destructive" className="flex-1">
            <Square className="w-4 h-4 mr-2" />
            Stop Test
          </Button>
        ) : (
          <Button
            onClick={onStart}
            disabled={enabledToolsCount === 0}
            className="flex-1"
          >
            <Play className="w-4 h-4 mr-2" />
            Start Load Test
          </Button>
        )}
      </div>

      {enabledToolsCount === 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          Select at least one tool to run the load test
        </p>
      )}

      {/* Tool Selection */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Tools to Test</Label>
        <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
          {config.toolConfigs.length === 0 ? (
            <p className="p-3 text-sm text-gray-500">
              No tools available. Connect to an MCP server and list tools first.
            </p>
          ) : (
            config.toolConfigs.map((tc) => (
              <div key={tc.tool.name} className="p-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`tool-${tc.tool.name}`}
                    checked={tc.enabled}
                    disabled={isRunning}
                    onCheckedChange={(checked) =>
                      onUpdateToolConfig(tc.tool.name, { enabled: !!checked })
                    }
                  />
                  <label
                    htmlFor={`tool-${tc.tool.name}`}
                    className="flex-1 text-sm font-medium cursor-pointer"
                  >
                    {tc.tool.name}
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0"
                    onClick={() => toggleToolExpanded(tc.tool.name)}
                  >
                    {expandedTools.has(tc.tool.name) ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </Button>
                </div>

                {expandedTools.has(tc.tool.name) && (
                  <div className="mt-2 pl-6 space-y-2">
                    <div className="flex items-center gap-2">
                      <Label className="text-xs">Weight:</Label>
                      <Input
                        type="number"
                        min={1}
                        max={100}
                        value={tc.weight}
                        disabled={isRunning}
                        onChange={(e) =>
                          onUpdateToolConfig(tc.tool.name, {
                            weight: parseInt(e.target.value) || 1,
                          })
                        }
                        className="h-7 w-20"
                      />
                    </div>

                    <div className="flex items-center gap-2">
                      <Switch
                        id={`auto-gen-${tc.tool.name}`}
                        checked={tc.autoGenerateParams}
                        disabled={isRunning}
                        onCheckedChange={(checked) =>
                          onUpdateToolConfig(tc.tool.name, {
                            autoGenerateParams: checked,
                          })
                        }
                      />
                      <Label
                        htmlFor={`auto-gen-${tc.tool.name}`}
                        className="text-xs"
                      >
                        Auto-generate params from schema
                      </Label>
                    </div>

                    {!tc.autoGenerateParams && (
                      <div className="space-y-1">
                        <Label className="text-xs">Static Params (JSON):</Label>
                        <Textarea
                          value={JSON.stringify(tc.staticParams, null, 2)}
                          disabled={isRunning}
                          onChange={(e) => {
                            try {
                              const params = JSON.parse(e.target.value);
                              onUpdateToolConfig(tc.tool.name, {
                                staticParams: params,
                              });
                            } catch {
                              // Invalid JSON, ignore
                            }
                          }}
                          className="font-mono text-xs h-20"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Selection Strategy */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Selection Strategy</Label>
        <Select
          value={config.selectionStrategy}
          disabled={isRunning}
          onValueChange={(value) =>
            onSetSelectionStrategy(value as ToolSelectionStrategy)
          }
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="rotate">Round Robin</SelectItem>
            <SelectItem value="random">Random</SelectItem>
            <SelectItem value="weighted">Weighted Random</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs text-gray-500">
          {config.selectionStrategy === "rotate" &&
            "Cycle through tools in order"}
          {config.selectionStrategy === "random" &&
            "Random selection with equal probability"}
          {config.selectionStrategy === "weighted" &&
            "Random selection based on configured weights"}
        </p>
      </div>

      {/* Duration Mode */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Duration Mode</Label>
        <Select
          value={config.durationMode}
          disabled={isRunning}
          onValueChange={(value) => onSetDurationMode(value as DurationMode)}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="request_count">Request Count</SelectItem>
            <SelectItem value="time_based">Time Based</SelectItem>
          </SelectContent>
        </Select>

        {config.durationMode === "request_count" ? (
          <div className="flex items-center gap-2">
            <Label className="text-sm">Requests:</Label>
            <Input
              type="number"
              min={1}
              max={1000000}
              value={config.requestCount}
              disabled={isRunning}
              onChange={(e) =>
                onSetRequestCount(parseInt(e.target.value) || 100)
              }
              className="w-32"
            />
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <Label className="text-sm">Duration:</Label>
            <Input
              type="number"
              min={1}
              max={3600}
              value={config.durationSeconds}
              disabled={isRunning}
              onChange={(e) =>
                onSetDurationSeconds(parseInt(e.target.value) || 60)
              }
              className="w-24"
            />
            <span className="text-sm text-gray-500">seconds</span>
          </div>
        )}
      </div>

      {/* Concurrency */}
      <div className="space-y-2">
        <Label className="text-sm font-semibold">Concurrency (Pool Size)</Label>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={1}
            max={100}
            value={config.poolSize}
            disabled={isRunning}
            onChange={(e) => onSetPoolSize(parseInt(e.target.value) || 10)}
            className="w-24"
          />
          <span className="text-sm text-gray-500">connections</span>
        </div>
        <p className="text-xs text-gray-500">
          Number of concurrent connections to the MCP server (1-100)
        </p>
      </div>

      {/* Target TPS */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch
            id="tps-enabled"
            checked={config.tpsEnabled}
            disabled={isRunning}
            onCheckedChange={onSetTpsEnabled}
          />
          <Label htmlFor="tps-enabled" className="text-sm font-semibold">
            Rate Limiting
          </Label>
        </div>

        {config.tpsEnabled && (
          <div className="flex items-center gap-2 pl-6">
            <Label className="text-sm">Target TPS:</Label>
            <Input
              type="number"
              min={1}
              max={10000}
              value={config.targetTps ?? 100}
              disabled={isRunning}
              onChange={(e) => onSetTargetTps(parseInt(e.target.value) || 100)}
              className="w-24"
            />
            <span className="text-sm text-gray-500">req/sec</span>
          </div>
        )}
        <p className="text-xs text-gray-500">
          {config.tpsEnabled
            ? "Limit requests to the target rate"
            : "Send requests as fast as possible"}
        </p>
      </div>
    </div>
  );
};

export default LoadTestConfigComponent;
