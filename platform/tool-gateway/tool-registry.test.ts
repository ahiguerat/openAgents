import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "bun:test";
import { FilesystemReadAdapter } from "./filesystem/filesystem-read-adapter";
import { FilesystemWriteAdapter } from "./filesystem/filesystem-write-adapter";
import { ToolGatewayLogger, ToolInvocationLog } from "./types";
import { ToolRegistry } from "./tool-registry";

class InMemoryLogger implements ToolGatewayLogger {
  public readonly entries: ToolInvocationLog[] = [];

  log(entry: ToolInvocationLog): void {
    this.entries.push(entry);
  }
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  tempDirs.length = 0;
});

async function createRegistry() {
  const sandboxRoot = await mkdtemp(path.join(os.tmpdir(), "tool-gateway-test-"));
  tempDirs.push(sandboxRoot);

  const logger = new InMemoryLogger();
  const registry = new ToolRegistry(logger);
  registry.register(new FilesystemReadAdapter(sandboxRoot));
  registry.register(new FilesystemWriteAdapter(sandboxRoot));

  return { sandboxRoot, logger, registry };
}

describe("ToolRegistry", () => {
  it("supports filesystem.write and filesystem.read with schema validation", async () => {
    const { registry } = await createRegistry();

    const writeResult = await registry.invoke(
      "filesystem.write",
      { path: "notes/summary.txt", content: "hola mundo" },
      "task-1",
      "trace-1"
    );
    expect(writeResult.ok).toBeTrue();

    const readResult = await registry.invoke(
      "filesystem.read",
      { path: "notes/summary.txt" },
      "task-1",
      "trace-1"
    );
    expect(readResult.ok).toBeTrue();
    expect(readResult.output?.content).toBe("hola mundo");
  });

  it("rejects invalid input before adapter invocation", async () => {
    const { registry } = await createRegistry();

    const result = await registry.invoke("filesystem.write", { path: "x.txt" }, "task-2");

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("Invalid input");
  });

  it("rejects paths outside sandbox", async () => {
    const { registry } = await createRegistry();

    const result = await registry.invoke(
      "filesystem.read",
      { path: "../outside.txt" },
      "task-3"
    );

    expect(result.ok).toBeFalse();
    expect(result.error).toContain("outside sandbox");
  });

  it("returns tool specs and logs task_id, input and output", async () => {
    const { logger, registry, sandboxRoot } = await createRegistry();

    await registry.invoke(
      "filesystem.write",
      { path: "out.txt", content: "abc" },
      "task-4",
      "trace-4"
    );

    const content = await readFile(path.join(sandboxRoot, "out.txt"), "utf8");
    expect(content).toBe("abc");

    const specs = registry.getToolSpecs();
    expect(specs.map((spec) => spec.name)).toEqual(["filesystem.read", "filesystem.write"]);

    expect(logger.entries.length).toBe(1);
    expect(logger.entries[0]?.toolName).toBe("filesystem.write");
    expect(logger.entries[0]?.taskId).toBe("task-4");
    expect(logger.entries[0]?.traceId).toBe("trace-4");
    expect(logger.entries[0]?.input).toEqual({ path: "out.txt", content: "abc" });
    expect(logger.entries[0]?.output).toBeDefined();
  });
});
