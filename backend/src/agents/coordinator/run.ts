// Ejecuta el coordinador contra un estado del escenario y comprueba los criterios
// de T10. Uso: npm run coordinator -- --runs=10 --fixture=lounge_unavailable

import { complete, loadLlmConfig } from "./llm.js";
import { SYSTEM_PROMPT, buildUserPrompt } from "./prompt.js";
import { crisisInput, type FixtureName } from "./scenario.js";
import { parseOutput } from "./validate.js";

const FIXTURES: readonly FixtureName[] = [
  "calm",
  "normal",
  "crisis",
  "proposal",
  "recovered",
  "lounge_unavailable",
  "pabellon_b_400",
];

function readRuns(argv: string[]): number {
  const flag = argv.find((argument) => argument.startsWith("--runs="));
  const value = Number(flag?.slice("--runs=".length) ?? 3);
  return Number.isInteger(value) && value > 0 ? value : 3;
}

function readFixture(argv: string[]): FixtureName {
  const flag = argv.find((argument) => argument.startsWith("--fixture="));
  const value = flag?.slice("--fixture=".length);
  if (value === undefined) return "crisis";
  if (!FIXTURES.includes(value as FixtureName)) {
    throw new Error(`Fixture desconocido: ${value}. Disponibles: ${FIXTURES.join(", ")}`);
  }
  return value as FixtureName;
}

async function main(): Promise<void> {
  const runs = readRuns(process.argv.slice(2));
  const fixture = readFixture(process.argv.slice(2));
  const config = loadLlmConfig();
  const input = crisisInput(fixture);
  const userPrompt = buildUserPrompt(input);

  console.log(
    `Coordinador · ${config.provider} · ${config.model} · ${fixture} · ${runs} ejecuciones\n`,
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
