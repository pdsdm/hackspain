import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { openDatabase } from "../src/state/database.js";

test("SQLite state survives reopening the database", () => {
  const directory = mkdtempSync(join(tmpdir(), "hackspain-backend-"));
  const path = join(directory, "crisis.db");

  try {
    const first = openDatabase(path);
    first.connection
      .prepare("INSERT INTO app_metadata (key, value) VALUES (?, ?)")
      .run("test_marker", "persisted");
    first.close();

    const second = openDatabase(path);
    const row = second.connection
      .prepare("SELECT value FROM app_metadata WHERE key = ?")
      .get("test_marker") as { value: string } | undefined;
    second.close();

    assert.equal(row?.value, "persisted");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
