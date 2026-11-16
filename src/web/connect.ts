import type { IncomingMessage } from "node:http";

type Answer = { status: number; body: string };

type Started = {
  url: string;
  state?: string;
  finish?: (code: string) => Promise<unknown>;
};

type Flow = {
  start?: () => Promise<Started>;
  save?: (pasted: string) => unknown;
};

const FLOWS: Record<string, Flow> = {
  bank: {
    start: async () => {
      const { authorize, connect } = await import("../net/sb1.ts");
      const { url, state } = authorize();
      return { url, state, finish: (code) => connect(code, state) };
    },
  },
  coop: {
    start: async () => {
      const { authorize, connect } = await import("../net/coop.ts");
      const { url, state, verifier } = authorize();
      return { url, state, finish: (code) => connect(code, verifier) };
    },
  },
  gmail: {
    start: async () => {
      const { authorize, connect } = await import("../net/gmail.ts");
      const { url, state, verifier } = authorize();
      return { url, state, finish: (code) => connect(code, verifier) };
    },
  },
  rema: {
    start: async () => ({
      url: (await import("../net/rema.ts")).authorizeUrl(),
    }),
    save: async (pasted) => (await import("../net/rema.ts")).save(pasted),
  },
  trumf: {
    save: async (pasted) => (await import("../net/trumf.ts")).save(pasted),
  },
};

const pending = new Map<string, Started>();

const answer = (status: number, value: unknown): Answer => ({
  status,
  body: JSON.stringify(
    value instanceof Error ? { error: value.message } : value,
  ),
});

const read = (req: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk: string) => (body += chunk));
    req.on("end", () => resolve(body.trim()));
    req.on("error", reject);
  });

const finish = (id: string, flow: Flow, pasted: string): Promise<unknown> => {
  if (flow.save) return Promise.resolve(flow.save(pasted));
  const started = pending.get(id);
  const back = URL.parse(pasted)?.searchParams;
  const code = back?.get("code");
  if (!started?.finish || !code || back!.get("state") !== started.state)
    throw new Error(
      "Paste the full address of the last page. Start again if it still fails.",
    );
  pending.delete(id);
  return started.finish(code);
};

const requestSource = async (name: string): Promise<unknown> => {
  if (!name || name.length > 80)
    throw new Error("Write the name of the service.");
  return (await import("../net/t3.ts")).requestSource(name);
};

// A pasted login travels in the body. A query string lands in the proxy log,
// and the Trumf cookie is too large for a header.
export function connectRoute(
  path: string,
  req: IncomingMessage,
): Promise<Answer> | null {
  if (!path.startsWith("/api/connect/")) return null;
  const [, id = "", step] =
    /^\/api\/connect\/([a-z]+)\/(start|finish)$/.exec(path) ?? [];
  const flow = Object.hasOwn(FLOWS, id) ? FLOWS[id] : undefined;
  const added = path === "/api/connect/new";
  if (!added && (!flow || !step))
    return Promise.resolve(answer(404, new Error(`no route ${path}`)));
  if (req.headers["x-banking-connect"] !== "1")
    return Promise.resolve(
      answer(405, new Error("needs X-Banking-Connect: 1")),
    );
  const work =
    step === "start"
      ? (flow!.start?.() ?? Promise.reject(new Error("no login link"))).then(
          (started) => {
            pending.set(id, started);
            return { url: started.url };
          },
        )
      : req.method !== "POST"
        ? Promise.reject(new Error("needs POST"))
        : added
          ? read(req).then(requestSource)
          : process.platform === "darwin"
            ? Promise.reject(
                new Error(
                  "Connect on the site. The Mac keeps its own logins from pnpm sb1 login and pnpm receipts login.",
                ),
              )
            : read(req).then((pasted) => finish(id, flow!, pasted));
  return work.then(
    (value) => answer(200, value ?? {}),
    (e: unknown) => answer(400, e instanceof Error ? e : new Error(String(e))),
  );
}
