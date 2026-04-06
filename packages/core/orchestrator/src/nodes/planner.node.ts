import { buildPlannerPrompt } from "../prompts.js";
import { streamStructuredPlan } from "@openagents/shared/llm";
import { safeJsonParse } from "@openagents/shared/utils";
import type { OrchestratorPlan } from "../types.js";
import type { OrchestratorStateType } from "../state/orchestrator-state.js";

/**
 * Node: Planner
 * Analiza el prompt del usuario y genera un plan
 */
export const plannerNode = async (state: OrchestratorStateType) => {
  try {
    console.error("\n[ORCHESTRATOR][PLANNER] Received user prompt");
    console.error(`[ORCHESTRATOR][PLANNER] USER_PROMPT: ${state.userPrompt}`);
    console.error("[ORCHESTRATOR][PLANNER] Analyzing with LLM");
    
    const systemPrompt = buildPlannerPrompt();
    const { rawText } = await streamStructuredPlan({
      systemPrompt,
      userPrompt: state.userPrompt,
    });

    const plan = safeJsonParse<OrchestratorPlan>(rawText);
    
    console.error(`[ORCHESTRATOR][PLANNER] Plan generated`);
    console.error(`[ORCHESTRATOR][PLANNER] Task type: ${plan.task}`);
    console.error(`[ORCHESTRATOR][PLANNER] Requires data-agent: ${!!plan.dataAgentPrompt}`);
    console.error(`[ORCHESTRATOR][PLANNER] Requires visualization: ${plan.needsVisualization}`);
    if (plan.rationale) {
      console.error(`[ORCHESTRATOR][PLANNER] Rationale: ${plan.rationale}`);
    }
    
    return {
      plan,
      error: null,
    };
  } catch (error) {
    console.error(`[ORCHESTRATOR][PLANNER] Error: ${error instanceof Error ? error.message : error}`);
    return {
      plan: null,
      error: error instanceof Error ? error.message : "Planning failed",
    };
  }
};
