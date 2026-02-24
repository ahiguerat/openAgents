import type { TaskStatus } from "./types";

export interface OrchestratorLogEntry {
  level: "info" | "error";
  message: string;
  taskId: string;
  traceId: string;
  status?: TaskStatus;
  error?: string;
  [key: string]: unknown;
}

export interface OrchestratorLogger {
  log(entry: OrchestratorLogEntry): void;
}

export class ConsoleLogger implements OrchestratorLogger {
  log(entry: OrchestratorLogEntry): void {
    const { level, message, ...rest } = entry;
    const line = JSON.stringify({ level, message, ...rest, ts: new Date().toISOString() });
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }
}
