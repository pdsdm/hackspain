import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";

import { createApp } from "../src/app.js";
import { openDatabase } from "../src/state/database.js";

test("GET /health reports that the backend is ready", async () => {
  const database = openDatabase(":memory:");
  const server = createApp(database).listen(0, "127.0.0.1");

  try {
    await once(server, "listening");
    const address = server.address();
    assert(address && typeof address !== "string");

    const response = await fetch(`http://127.0.0.1:${address.port}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    database.close();
  }
});
