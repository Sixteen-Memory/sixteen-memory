/**
 * Offline exclusion check. Reads operator-selected private config in memory;
 * prints only pass/fail and file counts, never the sensitive matching value.
 */
import { readFile, readdir, lstat } from "node:fs/promises";
import { resolve, relative } from "node:path";
const path = process.env.PRIVATE_TEST_CONFIG;
if (!path) throw Error("Supply PRIVATE_TEST_CONFIG to check against the local-only test configuration");
const config = JSON.parse(await readFile(path, "utf8"));
const credentials = (await readFile(config.credential_file, "utf8")).split("\n");
const key = credentials.find(l=>l.startsWith(config.credential_field+"="))?.slice(config.credential_field.length+1).trim().replace(/^['"]|['"]$/g,"");
if (!key) throw Error("Private credential source unavailable; cannot perform exclusion check");
const forbidden = [key, config.model, new URL(config.endpoint).hostname, config.credential_file].filter(v=>typeof v==="string"&&v.length>=8);
const roots = ["worker","src","sdk","public","pages","dist","dist-worker","dist-pages"];
let files = 0; const violations = [];
async function scan(file) {
  const stat = await lstat(file);
  if (stat.isSymbolicLink()) throw Error("Unexpected symlink in distributable inputs");
  if (stat.isDirectory()) { for (const entry of await readdir(file)) await scan(resolve(file,entry)); return; }
  files++;
  const bytes = await readFile(file);
  if (forbidden.some(v=>bytes.includes(Buffer.from(v)))) violations.push(relative(process.cwd(),file));
}
for (const root of roots) await scan(resolve(root));
for (const file of ["wrangler.jsonc","package.json"]) await scan(resolve(file));
if (violations.length) throw Error("Local-only configuration found in distributable path(s): "+violations.join(", "));
console.log(JSON.stringify({status:"passed",files_checked:files,private_model_or_host_or_key_in_distributable:false}));
