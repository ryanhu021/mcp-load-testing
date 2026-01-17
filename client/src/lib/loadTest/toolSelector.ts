import { ToolConfig, ToolSelectionStrategy } from "./types";

/**
 * Selects tools based on the configured strategy
 */
export class ToolSelector {
  private toolConfigs: ToolConfig[];
  private strategy: ToolSelectionStrategy;
  private currentIndex = 0;
  private weightedPool: ToolConfig[] = [];

  constructor(toolConfigs: ToolConfig[], strategy: ToolSelectionStrategy) {
    // Only use enabled tools
    this.toolConfigs = toolConfigs.filter((tc) => tc.enabled);
    this.strategy = strategy;

    if (this.toolConfigs.length === 0) {
      throw new Error("No enabled tools configured for load test");
    }

    // Pre-compute weighted pool for weighted random selection
    if (strategy === "weighted") {
      this.buildWeightedPool();
    }
  }

  /**
   * Build a pool of tools weighted by their configured weights
   */
  private buildWeightedPool(): void {
    this.weightedPool = [];

    for (const config of this.toolConfigs) {
      // Add the tool to the pool `weight` times
      const weight = Math.max(1, Math.round(config.weight));
      for (let i = 0; i < weight; i++) {
        this.weightedPool.push(config);
      }
    }

    // Shuffle the pool for better distribution
    this.shuffleArray(this.weightedPool);
  }

  /**
   * Fisher-Yates shuffle
   */
  private shuffleArray<T>(array: T[]): void {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
  }

  /**
   * Select the next tool based on the strategy
   */
  next(): ToolConfig {
    switch (this.strategy) {
      case "rotate":
        return this.selectRotate();
      case "random":
        return this.selectRandom();
      case "weighted":
        return this.selectWeighted();
      default:
        return this.selectRotate();
    }
  }

  /**
   * Round-robin selection
   */
  private selectRotate(): ToolConfig {
    const tool = this.toolConfigs[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.toolConfigs.length;
    return tool;
  }

  /**
   * Random selection (uniform distribution)
   */
  private selectRandom(): ToolConfig {
    const index = Math.floor(Math.random() * this.toolConfigs.length);
    return this.toolConfigs[index];
  }

  /**
   * Weighted random selection
   */
  private selectWeighted(): ToolConfig {
    if (this.weightedPool.length === 0) {
      return this.selectRandom();
    }
    const index = Math.floor(Math.random() * this.weightedPool.length);
    return this.weightedPool[index];
  }

  /**
   * Reset the selector state (useful for new test runs)
   */
  reset(): void {
    this.currentIndex = 0;
    if (this.strategy === "weighted") {
      this.shuffleArray(this.weightedPool);
    }
  }

  /**
   * Get the number of enabled tools
   */
  getToolCount(): number {
    return this.toolConfigs.length;
  }

  /**
   * Get all enabled tool configs
   */
  getToolConfigs(): ToolConfig[] {
    return this.toolConfigs;
  }
}
