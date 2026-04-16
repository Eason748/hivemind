/**
 * Task handlers
 *
 * Implement your Worker Agent capabilities here.
 * Route by task name to different handler functions.
 */

type TaskParams = Record<string, unknown> | undefined;

export async function handleTask(task: string, params: TaskParams): Promise<unknown> {
  switch (task) {
    case "ping":
      return ping();

    case "echo":
      return echo(params);

    case "time":
      return time();

    default:
      // Fallback: treat unrecognized tasks as generic queries
      return genericQuery(task, params);
  }
}

// ── Example tasks ──

/** Health check */
function ping() {
  return { message: "pong", timestamp: new Date().toISOString() };
}

/** Echo back the params */
function echo(params: TaskParams) {
  return { echo: params ?? null };
}

/** Return current time */
function time() {
  const now = new Date();
  return {
    utc: now.toISOString(),
    unix: Math.floor(now.getTime() / 1000),
  };
}

/** Generic query (placeholder — replace with your own AI/API logic) */
function genericQuery(task: string, params: TaskParams) {
  return {
    message: `Task received: "${task}"`,
    params: params ?? null,
    note: "Replace this handler with your own logic",
  };
}
