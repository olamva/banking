import { execFileSync } from "node:child_process";
import { readFileSync, renameSync, writeFileSync } from "node:fs";

const KEYCHAIN_SERVICE = "sb1-banking";

// ponytail: the refresh token goes through argv, so `ps` shows it for a short
// time. Use a helper that reads stdin if this machine gets other local users.
export function keychainSet(account: string, secret: string): void {
  execFileSync("security", [
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    account,
    "-w",
    secret,
  ]);
}

export function keychainGet(account: string): string | null {
  try {
    return execFileSync(
      "security",
      ["find-generic-password", "-s", KEYCHAIN_SERVICE, "-a", account, "-w"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

export function env(key: string): string {
  const v = process.env[key];
  if (!v || v.startsWith("<"))
    throw new Error(`Missing ${key} — fill it in .env.local`);
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
  return keychainGet("refresh_token");
}

export async function setToken(token: string): Promise<void> {
  const file = process.env.TOKEN_FILE;
  if (file) {
    writeFileSync(`${file}.tmp`, token, { mode: 0o600 });
    return renameSync(`${file}.tmp`, file);
  }
  keychainSet("refresh_token", token);
}
