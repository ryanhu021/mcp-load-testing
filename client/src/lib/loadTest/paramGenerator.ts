import { Tool } from "@modelcontextprotocol/sdk/types.js";
import type { JsonSchemaType } from "@/utils/jsonUtils";

/**
 * Generates random parameters based on a tool's input schema
 */
export class ParamGenerator {
  /**
   * Generate parameters for a tool call
   * If autoGenerate is true, generates random values based on schema
   * Otherwise, returns the static params
   */
  generate(
    tool: Tool,
    autoGenerate: boolean,
    staticParams: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!autoGenerate) {
      return staticParams;
    }

    const schema = tool.inputSchema as JsonSchemaType;
    if (!schema || !schema.properties) {
      return {};
    }

    return this.generateFromSchema(schema);
  }

  /**
   * Generate values from a JSON schema object
   */
  private generateFromSchema(schema: JsonSchemaType): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    const properties = schema.properties || {};
    const required = new Set(schema.required || []);

    for (const [key, propSchema] of Object.entries(properties)) {
      const prop = propSchema as JsonSchemaType;

      // Always generate required fields, optionally generate non-required
      if (required.has(key) || Math.random() > 0.3) {
        result[key] = this.generateValue(prop);
      }
    }

    return result;
  }

  /**
   * Generate a single value based on its schema
   */
  private generateValue(schema: JsonSchemaType): unknown {
    // Handle nullable types
    if (schema.nullable && Math.random() < 0.1) {
      return null;
    }

    // Handle enums
    if (schema.enum && schema.enum.length > 0) {
      return schema.enum[Math.floor(Math.random() * schema.enum.length)];
    }

    // Handle default values
    if (schema.default !== undefined && Math.random() < 0.3) {
      return schema.default;
    }

    const type = this.getType(schema);

    switch (type) {
      case "string":
        return this.generateString(schema);
      case "number":
      case "integer":
        return this.generateNumber(schema, type === "integer");
      case "boolean":
        return Math.random() > 0.5;
      case "array":
        return this.generateArray(schema);
      case "object":
        return this.generateObject(schema);
      default:
        return null;
    }
  }

  /**
   * Get the type from a schema, handling union types
   */
  private getType(schema: JsonSchemaType): string {
    if (typeof schema.type === "string") {
      return schema.type;
    }
    if (Array.isArray(schema.type)) {
      // Filter out 'null' and pick the first real type
      const types = schema.type.filter((t) => t !== "null");
      return types[0] || "string";
    }
    return "string";
  }

  /**
   * Generate a random string
   */
  private generateString(schema: JsonSchemaType): string {
    const minLength = schema.minLength || 1;
    const maxLength = schema.maxLength || 20;
    const length =
      Math.floor(Math.random() * (maxLength - minLength + 1)) + minLength;

    // Check for format hints
    if (schema.format) {
      switch (schema.format) {
        case "email":
          return `test${Math.floor(Math.random() * 10000)}@example.com`;
        case "uri":
        case "url":
          return `https://example.com/path/${Math.floor(Math.random() * 1000)}`;
        case "date":
          return new Date().toISOString().split("T")[0];
        case "date-time":
          return new Date().toISOString();
        case "uuid":
          return this.generateUUID();
      }
    }

    // Generate random alphanumeric string
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  /**
   * Generate a random number
   */
  private generateNumber(schema: JsonSchemaType, isInteger: boolean): number {
    const min = schema.minimum ?? 0;
    const max = schema.maximum ?? 1000;

    let value = Math.random() * (max - min) + min;

    if (isInteger) {
      value = Math.floor(value);
    }

    // Apply multipleOf constraint
    const multipleOf = (schema as { multipleOf?: number }).multipleOf;
    if (multipleOf) {
      value = Math.round(value / multipleOf) * multipleOf;
    }

    return value;
  }

  /**
   * Generate a random array
   */
  private generateArray(schema: JsonSchemaType): unknown[] {
    const minItems = schema.minItems || 0;
    const maxItems = schema.maxItems || 5;
    const length =
      Math.floor(Math.random() * (maxItems - minItems + 1)) + minItems;

    const items = schema.items as JsonSchemaType | undefined;
    if (!items) {
      return [];
    }

    const result: unknown[] = [];
    for (let i = 0; i < length; i++) {
      result.push(this.generateValue(items));
    }
    return result;
  }

  /**
   * Generate a random object
   */
  private generateObject(schema: JsonSchemaType): Record<string, unknown> {
    if (!schema.properties) {
      return {};
    }
    return this.generateFromSchema(schema);
  }

  /**
   * Generate a UUID v4
   */
  private generateUUID(): string {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
      /[xy]/g,
      function (c) {
        const r = (Math.random() * 16) | 0;
        const v = c === "x" ? r : (r & 0x3) | 0x8;
        return v.toString(16);
      },
    );
  }
}

/** Singleton instance */
export const paramGenerator = new ParamGenerator();
