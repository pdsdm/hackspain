// Ejecuta el coordinador contra el estado inicial del escenario y comprueba los
// criterios de T10. Uso: npm run coordinator -- --runs=10

import { complete, loadLlmConfig } from "./llm.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { crisisInput } from "./scenario.js";
import { parseOutput } from "./validate.js";

function readRuns(argv: string[]): number {
  const flag = argv.find((argument) => argument.startsWith("--runs="));
  const value = Number(flag?.slice("--runs=".length) ?? 3);
  return Number.isInteger(value) && value > 0 ? value : 3;
}

async function main(): Promise<void> {
  const runs = readRuns(process.argv.slice(2));
  const config = loadLlmConfig();
  const input = crisisInput();
  const userPrompt = buildUserPrompt(input);

  console.log(
    `Coordinador · ${config.provider} · ${config.model} · ${config.baseUrl || "anthropic"} · ${runs} ejecuciones\n`,
  );

  let valid = 0;

  for (let attempt = 1; attempt <= runs; attempt += 1) {
    const started = Date.now();
    try {
      const text = await complete(config, SYSTEM_PROMPT, userPrompt, {
        nonce: `t10-${attempt}-${Date.now()}`,
      });
      const { output, issues } = parseOutput(text, input);
      const seconds = ((Date.now() - started) / 1000).toFixed(1);

      if (output === null) {
        console.log(`${attempt}. ✗ ${seconds}s`);
        for (const issue of issues) {
          console.log(`     ${issue.code}: ${issue.detail}`);
        }
        continue;
      }

      valid += 1;
      const assigned = output.assignments.reduce((total, item) => total + item.count, 0);
      const escalation = output.decision === null ? "sin escalado" : `escala ${output.decision.cost} €`;
      console.log(
        `${attempt}. ✓ ${seconds}s · ${output.actions.length} acciones · ${assigned} personas asignadas · ${escalation} · ${output.coordinatorStatus}`,
      );
      console.log(`     ${output.reading}`);
      for (const action of output.actions) {
        console.log(`     [${action.area}] ${action.objective} — ${action.reason}`);
      }
    } catch (error) {
      console.log(`${attempt}. ✗ ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log(`\n${valid}/${runs} ejecuciones válidas`);
  process.exitCode = valid === runs ? 0 : 1;
}

await main();
