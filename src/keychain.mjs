import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { isPrivateKey, scrub } from "./decide.mjs";

const SERVICE = "voltjuice-agent";
const ACCOUNT = "api-wallet";

function testFile() {
  if (process.env.VOLTJUICE_TEST !== "1") return "";
  return process.env.VOLTJUICE_KEY_FILE || "";
}

export function readKey() {
  const file = testFile();
  if (file) {
    try {
      const value = readFileSync(file, "utf8").trim();
      return isPrivateKey(value) ? value : "";
    } catch {
      return "";
    }
  }
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
  const file = testFile();
  if (file) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${key}\n`, { mode: 0o600 });
    chmodSync(file, 0o600);
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
  const file = testFile();
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
