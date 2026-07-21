#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const databaseName = process.env.PLAIN_SYNC_D1_NAME || "plainsync";
const workerName = process.env.PLAIN_SYNC_WORKER_NAME || "plainsync";
const configPath = "dist/server/wrangler.deploy.json";

function capture(command, args) {
  return execFileSync(command, args, { encoding: "utf8", stdio: ["inherit", "pipe", "inherit"] });
}

function run(command, args) {
  execFileSync(command, args, { stdio: "inherit" });
}

function databases() {
  return JSON.parse(capture(npx, ["wrangler", "d1", "list", "--json"]));
}

console.log("\nPlainSync Cloudflare setup\n");
let database = databases().find((item) => item.name === databaseName);
if (!database) {
  console.log(`Creating D1 database “${databaseName}”…`);
  run(npx, ["wrangler", "d1", "create", databaseName]);
  database = databases().find((item) => item.name === databaseName);
}

if (!database?.uuid) {
  throw new Error("Cloudflare did not return a database id. Run `npx wrangler login` and try again.");
}

console.log("Building PlainSync…");
run(npm, ["run", "build"]);
const generatedConfig = JSON.parse(readFileSync("dist/server/wrangler.json", "utf8"));
generatedConfig.name = workerName;
generatedConfig.topLevelName = workerName;
generatedConfig.d1_databases = [
  { binding: "DB", database_name: databaseName, database_id: database.uuid },
];
writeFileSync(configPath, `${JSON.stringify(generatedConfig, null, 2)}\n`, "utf8");
console.log("Deploying to Cloudflare…");
run(npx, ["wrangler", "deploy", "--config", configPath]);
