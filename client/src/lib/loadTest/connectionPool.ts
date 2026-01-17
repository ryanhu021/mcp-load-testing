import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  CompatibilityCallToolResult,
  CompatibilityCallToolResultSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { LoadTestConnectionConfig } from "./types";

const CLIENT_INFO = {
  name: "mcp-inspector-load-test",
  version: "1.0.0",
};

/**
 * A pooled connection wrapping an MCP client and transport
 */
interface PooledConnection {
  id: number;
  client: Client;
  transport: StreamableHTTPClientTransport;
  inUse: boolean;
  lastUsed: number;
}

/**
 * Manages a pool of MCP client connections for load testing
 */
export class ConnectionPool {
  private connections: PooledConnection[] = [];
  private config: LoadTestConnectionConfig;
  private poolSize: number;
  private nextId = 0;
  private initialized = false;
  private closed = false;

  constructor(config: LoadTestConnectionConfig, poolSize: number) {
    this.config = config;
    this.poolSize = poolSize;
  }

  /**
   * Initialize the connection pool by creating all connections
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    const connectionPromises: Promise<PooledConnection>[] = [];
    for (let i = 0; i < this.poolSize; i++) {
      connectionPromises.push(this.createConnection());
    }

    this.connections = await Promise.all(connectionPromises);
    this.initialized = true;
  }

  /**
   * Create a single pooled connection
   */
  private async createConnection(): Promise<PooledConnection> {
    const id = this.nextId++;

    const transport = new StreamableHTTPClientTransport(
      new URL(this.config.serverUrl),
      {
        requestInit: {
          headers: {
            ...this.config.headers,
            Accept: "text/event-stream, application/json",
            "Content-Type": "application/json",
          },
        },
      },
    );

    const client = new Client(CLIENT_INFO, {
      capabilities: {},
    });

    await client.connect(transport);

    return {
      id,
      client,
      transport,
      inUse: false,
      lastUsed: Date.now(),
    };
  }

  /**
   * Acquire a connection from the pool.
   * Waits if all connections are in use.
   */
  async acquire(): Promise<PooledConnection> {
    if (this.closed) {
      throw new Error("Connection pool is closed");
    }

    if (!this.initialized) {
      await this.initialize();
    }

    // Find an available connection
    const available = this.connections.find((c) => !c.inUse);
    if (available) {
      available.inUse = true;
      available.lastUsed = Date.now();
      return available;
    }

    // All connections in use, wait and retry
    await new Promise((resolve) => setTimeout(resolve, 10));
    return this.acquire();
  }

  /**
   * Release a connection back to the pool
   */
  release(connection: PooledConnection): void {
    connection.inUse = false;
    connection.lastUsed = Date.now();
  }

  /**
   * Execute a tool call using a pooled connection
   */
  async callTool(
    toolName: string,
    params: Record<string, unknown>,
  ): Promise<CompatibilityCallToolResult> {
    const connection = await this.acquire();

    try {
      const result = await connection.client.request(
        {
          method: "tools/call",
          params: {
            name: toolName,
            arguments: params,
          },
        },
        CompatibilityCallToolResultSchema,
      );
      return result;
    } finally {
      this.release(connection);
    }
  }

  /**
   * Get current pool statistics
   */
  getStats(): { total: number; inUse: number; available: number } {
    const inUse = this.connections.filter((c) => c.inUse).length;
    return {
      total: this.connections.length,
      inUse,
      available: this.connections.length - inUse,
    };
  }

  /**
   * Close all connections in the pool
   */
  async close(): Promise<void> {
    this.closed = true;

    const closePromises = this.connections.map(async (conn) => {
      try {
        await conn.transport.close();
        await conn.client.close();
      } catch {
        // Ignore close errors
      }
    });

    await Promise.all(closePromises);
    this.connections = [];
    this.initialized = false;
  }

  /**
   * Check if the pool is initialized and has connections
   */
  isReady(): boolean {
    return this.initialized && !this.closed && this.connections.length > 0;
  }
}
