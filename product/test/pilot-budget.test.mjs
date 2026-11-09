import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openPilotBudget } from "../eval/pilot-budget.mjs";
test("shared pilot cost envelope persists across runs and charges unknown failures at reservation", async () => {
  const dir = await mkdtemp(join(tmpdir(), "pilot-budget-")), path = join(dir, "budget.json");
  let ledger;
  try {
    ledger = await openPilotBudget(path, 0.2);
    await ledger.reserve("first", 0.1, {});
    await assert.rejects(openPilotBudget(path, 0.2), { code: "EEXIST" });
    await ledger.settle("first", 0.03);
    await assert.rejects(ledger.settle("first", 0));
    await ledger.close(); ledger = null;
    ledger = await openPilotBudget(path, 0.2);
    await ledger.reserve("unknown", 0.1, {});
    assert.deepEqual(ledger.summary(), { limit_cny: 0.2, known_or_reserved_cny: 0.13, calls: 2, unknown_calls: 1 });
    await assert.rejects(ledger.reserve("over", 0.08, {}));
    await ledger.close(); ledger = null;
    await assert.rejects(openPilotBudget(path, 0.1));
    await writeFile(path, JSON.stringify({ limit_cny: 0.2, calls: [{ id: "bad", reserved_cny: -1, actual_cny: null }] }), { mode: 0o600 });
    await assert.rejects(openPilotBudget(path, 0.2), /Invalid budget ledger/);
  } finally { await ledger?.close(); await rm(dir, { recursive: true, force: true }); }
});
