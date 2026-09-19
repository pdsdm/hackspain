import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { JEV_QUESTIONS } from "../src/agents/jev.js";
import { isTranscriptAllowed, transcriptPrivacyHash } from "../src/domain/result-verifier.js";
import { HOLDOUT_CASES, HOLDOUT_PROMPT_SHA256, evaluationInput } from "./jev-holdout-data.js";

test("the held-out evaluation uses the candidate frozen before the new cases", () => {
  assert.equal(createHash("sha256").update(JSON.stringify(JEV_QUESTIONS)).digest("hex"), HOLDOUT_PROMPT_SHA256);
  assert.equal(HOLDOUT_CASES.length, 30);
  assert.equal(new Set(HOLDOUT_CASES.map((item) => item.name)).size, 30);
  assert.equal(HOLDOUT_CASES.filter((item) => item.confirm).length, 10);
});

test("reviewed synthetic evidence stays complete, ordered and bounded", () => {
  for (const item of HOLDOUT_CASES) {
    const input = evaluationInput(item);
    assert.equal(input.transcript.length, item.texts.length + 1);
    assert.deepEqual(input.transcript.slice(1).map((line) => line.text), item.texts);
    assert(isTranscriptAllowed(input.transcript, [transcriptPrivacyHash(input.transcript)]));
    assert.equal(isTranscriptAllowed([]), false);
  }
});

test("privacy review fingerprints preserve speaker, wording and order, not call timing", () => {
  const transcript = evaluationInput(HOLDOUT_CASES[0]!).transcript;
  const original = transcriptPrivacyHash(transcript);
  assert.equal(transcriptPrivacyHash(transcript.map((line) => ({ ...line, at: line.at + 5 }))), original);
  assert.notEqual(transcriptPrivacyHash([...transcript].reverse()), original);
  assert.notEqual(transcriptPrivacyHash(transcript.map((line) => ({ ...line, who: "agente" }))), original);
  assert.notEqual(transcriptPrivacyHash(transcript.map((line) => ({ ...line, text: `No ${line.text}` }))), original);
  const huge = [{ who: "humano" as const, text: "a".repeat(2001), at: 1 }];
  assert.equal(isTranscriptAllowed(huge, [transcriptPrivacyHash(huge)]), false);
});
