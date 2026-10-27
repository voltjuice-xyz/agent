import { mkdirSync, readFileSync, appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { isAddress, MAX_CAP, MIN_NOTIONAL } from "./decide.mjs";

export function homeDir() {
  return process.env.VOLTJUICE_HOME || join(homedir(), ".voltjuice");
}

function configPath() {
  return join(homeDir(), "config.json");
}

export function readConfig() {
  try {
    const raw = JSON.parse(readFileSync(configPath(), "utf8"));
    const mode = raw.mode === "live" ? "live" : "paper";
    const cap = Number(raw.cap);
    const master = isAddress(raw.master) ? String(raw.master).toLowerCase() : "";
    return {
      mode,
      cap: Number.isFinite(cap) ? cap : 0,
      master,
    };
  } catch {
    return { mode: "paper", cap: 0, master: "" };
  }
}

export function writeConfig(next) {
  const current = readConfig();
  const merged = { ...current, ...next };
  mkdirSync(homeDir(), { recursive: true });
  writeFileSync(configPath(), `${JSON.stringify(merged, null, 2)}\n`, { mode: 0o600 });
  return readConfig();
}

export function setMode(mode, cap) {
  if (mode === "paper") return writeConfig({ mode: "paper" });
  const n = Number(cap);
  if (!Number.isFinite(n) || n < MIN_NOTIONAL || n > MAX_CAP) return null;
  return writeConfig({ mode: "live", cap: n });
}

export function setMaster(address) {
  if (!isAddress(address)) return null;
  return writeConfig({ master: address.toLowerCase() });
}

export function recordPaper(row) {
  mkdirSync(homeDir(), { recursive: true });
  appendFileSync(join(homeDir(), "paper.jsonl"), `${JSON.stringify(row)}\n`, { mode: 0o600 });
}

export function readPaper() {
  try {
    return readFileSync(join(homeDir(), "paper.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}
