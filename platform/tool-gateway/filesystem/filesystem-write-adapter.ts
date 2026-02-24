import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { IToolAdapter, ToolResult } from "../types";
import { resolveSandboxPath } from "./path-utils";

type WriteInput = {
  path: string;
  content: string;
};

export class FilesystemWriteAdapter implements IToolAdapter {
  public readonly spec = {
    name: "filesystem.write",
    description: "Write UTF-8 text content to a file in the sandbox.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "content"],
      properties: {
        path: { type: "string", minLength: 1 },
        content: { type: "string" },
      },
    },
    outputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["path", "bytesWritten"],
      properties: {
        path: { type: "string" },
        bytesWritten: { type: "number", minimum: 0 },
      },
    },
    permissions: ["fs:write"],
    sideEffects: "fs" as const,
  };

  constructor(private readonly sandboxRoot: string) {}

  async invoke(input: Record<string, unknown>): Promise<ToolResult> {
    try {
      const payload = input as WriteInput;
      const resolvedPath = resolveSandboxPath(this.sandboxRoot, payload.path);

      await mkdir(path.dirname(resolvedPath), { recursive: true });
      await writeFile(resolvedPath, payload.content, "utf8");

      return {
        ok: true,
        output: {
          path: resolvedPath,
          bytesWritten: new TextEncoder().encode(payload.content).length,
        },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof Error ? error.message : "Failed to write file",
      };
    }
  }
}
