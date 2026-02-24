import readline from "node:readline";

const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL ?? "http://localhost:3000";
const POLL_INTERVAL_MS = 2000;

// ── Helpers de I/O ────────────────────────────────────────────────────────────

function print(msg: string): void {
  console.log(msg);
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

// ── API calls ─────────────────────────────────────────────────────────────────

async function submitTask(goal: string): Promise<string> {
  const res = await fetch(`${ORCHESTRATOR_URL}/tasks`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal }),
  });
  if (!res.ok) throw new Error(`submit_task failed: ${res.status}`);
  const data = await res.json() as { task_id: string };
  return data.task_id;
}

async function getStatus(taskId: string): Promise<{ status: string; blockedReason?: string }> {
  const res = await fetch(`${ORCHESTRATOR_URL}/tasks/${taskId}/status`);
  if (!res.ok) throw new Error(`get_status failed: ${res.status}`);
  return res.json() as Promise<{ status: string; blockedReason?: string }>;
}

async function getResult(taskId: string): Promise<{ summary: string; status: string }> {
  const res = await fetch(`${ORCHESTRATOR_URL}/tasks/${taskId}/result`);
  if (!res.ok) throw new Error(`get_result failed: ${res.status}`);
  return res.json() as Promise<{ summary: string; status: string }>;
}

async function resumeTask(taskId: string, input: string): Promise<void> {
  const res = await fetch(`${ORCHESTRATOR_URL}/tasks/${taskId}/resume`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
  });
  if (!res.ok) throw new Error(`resume_task failed: ${res.status}`);
}

// ── Polling ───────────────────────────────────────────────────────────────────

async function pollUntilDone(
  taskId: string,
  rl: readline.Interface
): Promise<void> {
  let lastStatus = "";

  while (true) {
    const { status, blockedReason } = await getStatus(taskId);

    if (status !== lastStatus) {
      print(`[${status}] ${statusMessage(status)}`);
      lastStatus = status;
    }

    if (status === "completed" || status === "failed") {
      const result = await getResult(taskId);
      print("");
      print(result.summary);
      return;
    }

    if (status === "blocked") {
      print("");
      print(`Necesito más información: ${blockedReason ?? "¿Puedes dar más detalles?"}`);
      const input = await ask(rl, "> ");
      if (!input) continue;
      await resumeTask(taskId, input);
      print("[running] Continuando...");
      lastStatus = "running";
      continue;
    }

    await sleep(POLL_INTERVAL_MS);
  }
}

function statusMessage(status: string): string {
  switch (status) {
    case "pending":  return "En cola...";
    case "running":  return "Orchestrator procesando...";
    case "blocked":  return "Esperando input del usuario...";
    case "completed": return "Completado.";
    case "failed":   return "La tarea falló.";
    default:         return status;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ── Main ──────────────────────────────────────────────────────────────────────

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

print("openAgents CLI — escribe 'salir' para terminar\n");

while (true) {
  const goal = await ask(rl, "> ¿Qué quieres hacer? ");

  if (!goal || goal.toLowerCase() === "salir") {
    print("Hasta luego.");
    rl.close();
    break;
  }

  try {
    const taskId = await submitTask(goal);
    print(`[pending] Tarea creada: ${taskId}`);
    await pollUntilDone(taskId, rl);
  } catch (err) {
    print(`Error: ${err instanceof Error ? err.message : String(err)}`);
  }

  print("");
}
