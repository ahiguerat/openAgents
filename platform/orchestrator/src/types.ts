import type { AgentResult } from "@openagents/runtime";

export type TaskStatus = "pending" | "running" | "completed" | "failed" | "blocked";

export interface Task {
  id: string;
  traceId: string;
  goal: string;
  status: TaskStatus;
  createdAt: Date;
  updatedAt: Date;
  result?: AgentResult;
  blockedReason?: string;
  resumeInput?: string;
}
