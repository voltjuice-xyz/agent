import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { isPrivateKey, scrub } from "./decide.mjs";
import { homeDir } from "./store.mjs";

const SERVICE = "voltjuice-agent";
const ACCOUNT = "api-wallet";

function filePath() {
  if (process.env.VOLTJUICE_TEST === "1" && process.env.VOLTJUICE_KEY_FILE) return process.env.VOLTJUICE_KEY_FILE;
  if (process.platform !== "darwin" || process.env.VOLTJUICE_STORE === "file") return join(homeDir(), "key");
  return "";
}

export function keyStoreName() {
  return filePath() ? "file" : "keychain";
}

function readFileKey(file) {
  try {
    const value = readFileSync(file, "utf8").trim();
    return isPrivateKey(value) ? value : "";
  } catch {
    return "";
  }
}

function writeFileKey(file, key) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  chmodSync(dirname(file), 0o700);
  writeFileSync(file, `${key}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
}

export function readKey() {
  const file = filePath();
  if (file) return readFileKey(file);
  try {
    const value = execFileSync(
      "security",
      ["find-generic-password", "-s", SERVICE, "-a", ACCOUNT, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    return isPrivateKey(value) ? value : "";
  } catch {
    return "";
  }
}

export function writeKey(value) {
  const key = String(value ?? "").trim();
  if (!isPrivateKey(key)) return false;
  const file = filePath();
  if (file) {
    writeFileKey(file, key);
    return true;
  }
  try {
    execFileSync(
      "security",
      ["add-generic-password", "-U", "-s", SERVICE, "-a", ACCOUNT, "-w", key],
      { stdio: "ignore" },
    );
    return true;
  } catch (error) {
    throw new Error(scrub(error instanceof Error ? error.message : "keychain"));
  }
}

export function forgetKey() {
  const file = filePath();
  if (file) {
    rmSync(file, { force: true });
    return;
  }
  try {
    execFileSync("security", ["delete-generic-password", "-s", SERVICE, "-a", ACCOUNT], {
      stdio: "ignore",
    });
  } catch {
    // Already absent.
  }
}
