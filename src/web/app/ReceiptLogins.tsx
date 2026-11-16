import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Panel } from "./Cards.tsx";
import { finishCoop, startCoop } from "./data.ts";
import { ExternalLinkIcon, Icon, ReceiptIcon } from "./icons.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";

const OTHERS: [string, string][] = [
  ["Rema", "pnpm receipts login rema"],
  ["Gmail", "pnpm receipts login gmail"],
  ["Trumf", "TRUMF_COOKIE in .env"],
];

const failed = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : String(e), {
    duration: Infinity,
    closeButton: true,
  });

const CoopLogin = () => {
  const [url, setUrl] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  const start = () => {
    setBusy(true);
    startCoop()
      .then(setUrl, failed)
      .finally(() => setBusy(false));
  };

  const finish = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    finishCoop(pasted)
      .then(() => {
        setUrl(null);
        setPasted("");
        toast.success("Coop is connected. Press Refresh to get the receipts.");
      }, failed)
      .finally(() => setBusy(false));
  };

  return (
    <Panel
      title="Coop"
      icon={ReceiptIcon}
      description="Coop keeps one login. A new login elsewhere ends this one."
    >
      {url === null ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={start}
        >
          Connect Coop
        </Button>
      ) : (
        <ol className="flex list-decimal flex-col gap-4 pl-5 text-sm">
          <li className="flex flex-col items-start gap-2">
            Log in with your password and the SMS code.
            <Button asChild variant="outline" size="sm">
              <a href={url} target="_blank" rel="noreferrer">
                Open Coop login
                <Icon icon={ExternalLinkIcon} />
              </a>
            </Button>
          </li>
          <li>The last page does not load. Copy its full address.</li>
          <li className="flex flex-col gap-2">
            Paste the address here.
            <form className="flex min-w-0 gap-2" onSubmit={finish}>
              <Input
                aria-label="Address of the last Coop page"
                placeholder="https://login.coop.no/android/…?code=…"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
              />
              <Button type="submit" disabled={busy || !pasted.trim()}>
                Finish
              </Button>
            </form>
          </li>
        </ol>
      )}
    </Panel>
  );
};

export const ReceiptLogins = () => (
  <section className="flex min-w-0 max-w-2xl flex-col gap-8">
    <p className="text-sm text-muted-foreground">
      Refresh gets receipts from each source. When it reports an expired login,
      connect that source again here.
    </p>
    <CoopLogin />
    <Panel
      title="Other sources"
      description="Connect these on the Mac. Then run pnpm receipts:seed."
    >
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
        {OTHERS.map(([name, how]) => (
          <div key={name} className="contents">
            <dt className="font-medium">{name}</dt>
            <dd className="min-w-0 break-words font-mono text-xs leading-5 text-muted-foreground">
              {how}
            </dd>
          </div>
        ))}
      </dl>
    </Panel>
  </section>
);
