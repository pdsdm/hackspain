import type { TranscriptLine } from "../contracts/api.js";

function lineKey(line: TranscriptLine): string {
  return `${line.who}\u0000${line.text}\u0000${line.at}`;
}

export function mergeTranscriptLines(
  current: TranscriptLine[],
  incoming: TranscriptLine[],
): { transcript: TranscriptLine[]; added: number } {
  const transcript = current.map((line) => ({ ...line }));
  const known = new Set(transcript.map(lineKey));
  let added = 0;
  for (const line of incoming) {
    const key = lineKey(line);
    if (known.has(key)) continue;
    known.add(key);
    transcript.push({ ...line });
    added += 1;
  }
  transcript.sort((left, right) => left.at - right.at);
  return { transcript, added };
}
