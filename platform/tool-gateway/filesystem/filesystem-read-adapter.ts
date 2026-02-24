import { readFile } from "node:fs/promises";
import { IToolAdapter, ToolResult } from "../types";
import { resolveSandboxPath } from "./path-utils";

type ReadInput = {
  path: string;
  encoding?: "utf8";
};

export class FilesystemReadAdapter implements IToolAdapter {
  public readonly spec = {
    name: "filesystem.read",
    description: "Read a UTF-8 text file from the sandbox.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path"],
      properties: {
        path: { type: "string", minLength: 1 },
        encoding: { type: "string", enum: ["utf8"] },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "content"],
      properties: {
        path: { type: "string" },
        content: { type: "string" },
      },
    },
    permissions: ["fs:read"],
    sideEffects: "fs" as const,
  };

  constructor(private readonly sandboxRoot: string) {}

  async invoke(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const payload = input as ReadInput;
      const resolvedPath = resolveSandboxPath(this.sandboxRoot, payload.path);
      const content = await readFile(resolvedPath, payload.encoding ?? "utf8");

      return {
        ok: true,
        output: {
          path: resolvedPath,
          content,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to read file",
      };
    }
  }
}
