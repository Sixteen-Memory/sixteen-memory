import { spawn } from "node:child_process";
import process from "node:process";

const bin = process.platform === "win32" ? ".cmd" : "";
const processes = [
  spawn(`./node_modules/.bin/wrangler${bin}`, ["dev", "--local", "--port", "8790", "--ip", "127.0.0.1"], { stdio: "inherit" }),
  spawn(`./node_modules/.bin/vite${bin}`, ["--port", "4191", "--strictPort"], { stdio: "inherit" }),
];
let stopping = false;
function stop() { if (stopping) return; stopping = true; for (const child of processes) child.kill("SIGTERM"); }
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, stop);
for (const child of processes) child.on("exit", code => { if (!stopping) { stop(); process.exitCode = code ?? 1; } });
