import { summarizeReport, type HappyRobotCoordinatorReport } from "./happyrobot.js";

function readFlag(argv: string[], name: string): string | undefined {
  const flag = argv.find((argument) => argument.startsWith(`--${name}=`));
  return flag?.slice(name.length + 3);
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apiUrl = (process.env.API_URL?.trim() || "http://localhost:8000").replace(/\/+$/, "");
  const token = process.env.HAPPYROBOT_WEBHOOK_TOKEN?.trim();
  if (!token) throw new Error("Falta HAPPYROBOT_WEBHOOK_TOKEN para autorizar la petición");
  const text = readFlag(argv, "text") ?? "Fuga de agua en el Acceso Sur: el lounge Sur queda inutilizable hasta nuevo aviso.";
  const started = Date.now();
  console.log(`Shadow HappyRobot · ${apiUrl} · evento: ${text}\n`);
  const response = await fetch(`${apiUrl}/coordinator/happyrobot/shadow`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ source: "chat", kind: "free_text", text }),
    signal: AbortSignal.timeout(600_000),
  });
  const body = (await response.json()) as HappyRobotCoordinatorReport | { error: string };
  if (!response.ok || "error" in body) {
    console.log(`✗ HTTP ${response.status}: ${"error" in body ? body.error : "sin detalle"}`);
    process.exitCode = 1;
    return;
  }
  console.log(summarizeReport(body));
  console.log(`\nida y vuelta: ${((Date.now() - started) / 1000).toFixed(1)}s`);
  if (body.output) console.log(`\n${JSON.stringify(body.output, null, 2)}`);
  process.exitCode = body.status === "accepted" ? 0 : 1;
}

await main();
