import { execFileSync } from "node:child_process";
import { SOURCES } from "../src/net/receipts.ts";
import { secretGet } from "../src/net/token.ts";

const host = process.env.BANKING_SSH || "banking";
const DIR = "/srv/banking/secrets";

const secretsOf = (source: string): [string, string][] => {
  const login = secretGet(source);
  const settings = Object.entries(process.env).filter(
    (e): e is [string, string] =>
      e[0].startsWith(`${source.toUpperCase()}_`) &&
      !!e[1] &&
      !e[1].startsWith("<"),
  );
  return login ? [[source, login], ...settings] : settings;
};

try {
  for (const source of Object.keys(SOURCES)) {
    const secrets = secretsOf(source);
    if (!secrets.length)
      throw new Error(
        `${source}: no login and no ${source.toUpperCase()}_ values in .env`,
      );
    for (const [name, value] of secrets) {
      execFileSync(
        "ssh",
        [
          host,
          `sudo -u banking sh -c 'umask 077; mkdir -p ${DIR} && cat > ${DIR}/${name}.tmp && mv ${DIR}/${name}.tmp ${DIR}/${name}'`,
        ],
        { input: value, stdio: ["pipe", "inherit", "inherit"] },
      );
      console.error(`${name} -> ${host}`);
    }
  }
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
}
