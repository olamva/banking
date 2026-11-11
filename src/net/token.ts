import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { DATA_DIR } from "../core/paths.ts";

export async function withTokenLock<T>(work: () => Promise<T>): Promise<T> {
  const lock = `${DATA_DIR}/token.lock`;
  mkdirSync(DATA_DIR, { recursive: true });
  for (;;) {
    try {
      mkdirSync(lock);
      break;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      const made = statSync(lock, { throwIfNoEntry: false })?.mtimeMs;
      if (made !== undefined && Date.now() - made > 30_000)
        rmSync(lock, { recursive: true, force: true });
      else await sleep(50);
    }
  }
  try {
    return await work();
  } finally {
    rmSync(lock, { recursive: true, force: true });
  }
}

const KEYCHAIN_SERVICE = "sb1-banking";
const KEYCHAIN = process.platform === "darwin";
const secretFile = (name: string) => `${DATA_DIR}/secrets/${name}`;

export function secretSet(name: string, secret: string): void {
  if (!KEYCHAIN) {
    mkdirSync(`${DATA_DIR}/secrets`, { recursive: true, mode: 0o700 });
    writeFileSync(`${secretFile(name)}.tmp`, secret, { mode: 0o600 });
    return renameSync(`${secretFile(name)}.tmp`, secretFile(name));
  }
  execFileSync("security", [
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    name,
    "-w",
    secret,
  ]);
}

export function secretGet(name: string): string | null {
  try {
    return (
      KEYCHAIN
        ? execFileSync(
            "security",
            ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", name, "-w"],
            { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
          )
        : readFileSync(secretFile(name), "utf8")
    ).trim();
  } catch {
    return null;
  }
}

export function env(key: string): string {
  const v = process.env[key] || (KEYCHAIN ? undefined : secretGet(key));
  if (!v || v.startsWith("<"))
    throw new Error(`Missing ${key} — fill it in .env`);
  return v;
}

export const store = (): string =>
  process.env.TOKEN_FILE ? "token file" : "keychain";

export async function getToken(): Promise<string | null> {
  const file = process.env.TOKEN_FILE;
  if (file)
    try {
      return readFileSync(file, "utf8").trim() || null;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw e;
    }
  return secretGet("refresh_token");
}

export async function setToken(token: string): Promise<void> {
  const file = process.env.TOKEN_FILE;
  if (file) {
    writeFileSync(`${file}.tmp`, token, { mode: 0o600 });
    return renameSync(`${file}.tmp`, file);
  }
  secretSet("refresh_token", token);
}
