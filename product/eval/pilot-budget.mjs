import { lstat, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

/** Local cost-estimate envelope shared by sequential runs. Failed calls retain reservations. */
export async function openPilotBudget(path, approvedLimit) {
  const filename = resolve(path), lock = filename + ".lock";
  if (!Number.isFinite(approvedLimit) || approvedLimit <= 0 || approvedLimit > 0.2) throw Error("Invalid cumulative budget");
  const handle = await open(lock, "wx", 0o600);
  let data;
  try {
    try {
      const stat = await lstat(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.mode & 0o077) throw Error("Budget ledger must be a private regular file");
      data = JSON.parse(await readFile(filename, "utf8"));
      if (data.limit_cny !== approvedLimit || !Array.isArray(data.calls)) throw Error("Budget ledger approval mismatch");
      if (data.calls.some(c => !c || typeof c.id !== "string" || !Number.isFinite(c.reserved_cny) ||
        c.reserved_cny < 0 || (c.actual_cny !== null && (!Number.isFinite(c.actual_cny) || c.actual_cny < 0))) ||
        new Set(data.calls.map(c => c.id)).size !== data.calls.length) throw Error("Invalid budget ledger");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      data = { limit_cny: approvedLimit, calls: [] };
    }
    const save = async () => {
      await writeFile(filename + ".tmp", JSON.stringify(data, null, 2) + "\n", { mode: 0o600 });
      await rename(filename + ".tmp", filename);
    };
    const charged = () => data.calls.reduce((sum, call) => sum + (call.actual_cny ?? call.reserved_cny), 0);
    await save();
    return {
      async reserve(id, cost, metadata) {
        if (!Number.isFinite(cost) || cost < 0 || data.calls.some(c => c.id === id)) throw Error("Invalid reservation");
        if (charged() + cost > approvedLimit) throw Error("Cumulative approved estimate ceiling reached");
        data.calls.push({ ...metadata, id, reserved_cny: cost, actual_cny: null }); await save();
      },
      async settle(id, cost) {
        const row = data.calls.find(c => c.id === id);
        if (!row || row.actual_cny !== null || !Number.isFinite(cost) || cost < 0) throw Error("Invalid cost settlement");
        row.actual_cny = cost; await save();
        if (charged() > approvedLimit) throw Error("Reported usage exceeded cumulative estimate; stop");
      },
      summary: () => ({ limit_cny: approvedLimit, known_or_reserved_cny: Number(charged().toFixed(8)),
        calls: data.calls.length, unknown_calls: data.calls.filter(c => c.actual_cny === null).length }),
      async close() { await handle.close(); await unlink(lock); },
    };
  } catch (error) { await handle.close(); await unlink(lock); throw error; }
}
