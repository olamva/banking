import { execFileSync } from "node:child_process";

const KEYCHAIN_SERVICE = "sb1-banking";
const SECRET_NAME = "sb1-refresh-token";

// ponytail: the refresh token goes through argv, so `ps` shows it for a short
// time. Use a helper that reads stdin if this machine gets other local users.
function keychainSet(token: string): void {
  execFileSync("security", [
    "add-generic-password",
    "-U",
    "-s",
    KEYCHAIN_SERVICE,
    "-a",
    "refresh_token",
    "-w",
    token,
  ]);
}

function keychainGet(): string | null {
  try {
    return execFileSync(
      "security",
      [
        "find-generic-password",
        "-s",
        KEYCHAIN_SERVICE,
        "-a",
        "refresh_token",
        "-w",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return null;
  }
}

type Client = {
  getSecret(n: string): Promise<{ value?: string }>;
  setSecret(n: string, v: string): Promise<unknown>;
};

let client: Promise<Client> | null = null;

// The Azure SDK loads only where a vault is named, so the Mac keeps its two
// dependencies unread.
function vault(name: string): Promise<Client> {
  client ??= (async () => {
    const { DefaultAzureCredential } = await import("@azure/identity");
    const { SecretClient } = await import("@azure/keyvault-secrets");
    return new SecretClient(
      `https://${name}.vault.azure.net`,
      new DefaultAzureCredential(),
    ) as unknown as Client;
  })();
  return client;
}

export const store = (): string =>
  process.env.KEY_VAULT_NAME ? "Key Vault" : "keychain";

export async function getToken(): Promise<string | null> {
  const name = process.env.KEY_VAULT_NAME;
  if (!name) return keychainGet();
  try {
    return (await (await vault(name)).getSecret(SECRET_NAME)).value ?? null;
  } catch (e) {
    if ((e as { statusCode?: number }).statusCode === 404) return null;
    throw e;
  }
}

export async function setToken(token: string): Promise<void> {
  const name = process.env.KEY_VAULT_NAME;
  if (!name) return keychainSet(token);
  await (await vault(name)).setSecret(SECRET_NAME, token);
}
