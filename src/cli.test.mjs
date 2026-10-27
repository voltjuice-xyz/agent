import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cli = new URL("./cli.mjs", import.meta.url).pathname;

function run(args, options = {}) {
  const home = options.home ?? mkdtempSync(join(tmpdir(), "vj-"));
  const env = {
    ...process.env,
    VOLTJUICE_HOME: home,
    VOLTJUICE_OFFLINE: "1",
  };
  if (options.test === false) delete env.VOLTJUICE_TEST;
  else env.VOLTJUICE_TEST = "1";
  if (options.keyFile === false) delete env.VOLTJUICE_KEY_FILE;
  else env.VOLTJUICE_KEY_FILE = join(home, "key");
  if (options.store) env.VOLTJUICE_STORE = options.store;
  const result = spawnSync(process.execPath, [cli, ...args], {
    encoding: "utf8",
    input: options.input,
    env,
  });
  return { ...result, home };
}

test("practice order is recorded and the key is not printed", () => {
  const home = mkdtempSync(join(tmpdir(), "vj-"));
  const key = `0x${"ab".repeat(32)}`;
  const saved = run(["key", "set"], { home, input: `${key}\n` });
  assert.equal(saved.status, 0);
  assert.equal(saved.stdout.includes(key), false);
  const status = run(["status"], { home });
  assert.equal(status.stdout.includes(key), false);
  assert.match(status.stdout, /"key":"present"/);
  const order = run(["order", "--market", "BTC", "--side", "buy", "--notional", "20"], { home });
  assert.equal(order.status, 0);
  assert.match(order.stdout, /"route":"paper"/);
});

test("live refuses an order above the cap before sending it", () => {
  const home = mkdtempSync(join(tmpdir(), "vj-"));
  const mode = run(["mode", "live", "--cap", "100"], { home });
  assert.equal(mode.status, 0);
  const order = run(["order", "--market", "BTC", "--side", "buy", "--notional", "250"], { home });
  assert.equal(order.status, 1);
  assert.match(order.stderr, /above the cap/);
});

test("a key on the command line is refused", () => {
  const key = `0x${"cd".repeat(32)}`;
  const result = run(["status", key]);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Refusing a private key/);
  assert.equal(result.stderr.includes(key), false);
});

test("the cloud file store locks the key and doctor does not print it", () => {
  const home = mkdtempSync(join(tmpdir(), "vj-"));
  const key = `0x${"ef".repeat(32)}`;
  const saved = run(["key", "set"], { home, input: `${key}\n`, store: "file", keyFile: false });
  assert.equal(saved.status, 0);
  const mode = statSync(join(home, "key")).mode & 0o777;
  assert.equal(mode, 0o600);
  const doctor = run(["doctor"], { home, store: "file", keyFile: false });
  assert.equal(doctor.status, 0);
  assert.match(doctor.stdout, /"store":"file"/);
  assert.match(doctor.stdout, /"markets":"skipped"/);
  assert.equal(doctor.stdout.includes(key), false);
});

test("a piped key is refused outside the test harness", () => {
  const key = `0x${"ab".repeat(32)}`;
  const result = run(["key", "set"], { input: `${key}\n`, test: false, keyFile: false });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Do not paste it into the chat/);
  assert.equal(result.stderr.includes(key), false);
});

function textFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...textFiles(path));
    else if (/\.(md|mdc|svg)$/.test(name) || name === "plugin.json") out.push(path);
  }
  return out;
}

test("docs and rules do not name the settlement venue", () => {
  const root = new URL("..", import.meta.url).pathname;
  const files = textFiles(root);
  assert.ok(files.length >= 4);
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    assert.equal(/hyperliquid/i.test(text), false, file);
  }
});
