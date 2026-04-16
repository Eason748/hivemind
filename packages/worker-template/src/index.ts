import { Hono } from "hono";
import { cors } from "hono/cors";
import { Keypair } from "@solana/web3.js";
import { HMPHandler, HMPErrorCode } from "hivemind-sdk";
import type { HMPInvokeMessage } from "hivemind-sdk";
import { handleTask } from "./tasks.js";

type Env = {
  WORKER_PRIVATE_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// ── Health check ──
app.get("/", (c) => {
  return c.json({
    name: "hivemind-worker",
    protocol: "HMP/1.0",
    status: "ready",
  });
});

// ── HMP invoke endpoint ──
app.post("/hmp/invoke", async (c) => {
  // ① Restore Worker wallet from secret
  const privateKeyBytes = Uint8Array.from(
    JSON.parse(c.env.WORKER_PRIVATE_KEY),
  );
  const wallet = Keypair.fromSecretKey(privateKeyBytes);
  const handler = new HMPHandler({ wallet });

  let message: HMPInvokeMessage;

  try {
    // ② Verify HMP message (signature + hash + timestamp + dedup)
    const body = await c.req.json();
    message = await handler.verify(body);
  } catch (err: any) {
    const code = err.code ?? HMPErrorCode.INVALID_FORMAT;
    return c.json({ error: { code, message: err.message } }, 400);
  }

  try {
    // ③ Execute task
    const startedAt = new Date();
    const result = await handleTask(message.payload.task, message.payload.params);
    const completedAt = new Date();

    // ④ Return signed result + execution proof
    const response = handler.result(
      message,
      { status: "completed", result },
      { startedAt, completedAt },
    );

    return c.json(response);
  } catch (err: any) {
    // Execution failed — return signed error
    const response = handler.error(
      message,
      HMPErrorCode.EXECUTION_FAILED,
      err.message ?? "Task execution failed",
    );
    return c.json(response, 500);
  }
});

export default app;
