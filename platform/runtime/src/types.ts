export interface AgentTask {
  taskId: string;
  traceId: string;
  goal: string;
  skillDir?: string;
}

export interface AgentArtifact {
  type: string;
  content: string;
}

export interface AgentResult {
  taskId: string;
  status: "completed" | "failed";
  summary: string;
  artifacts: AgentArtifact[];
}
