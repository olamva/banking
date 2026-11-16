import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Panel } from "./Cards.tsx";
import { finishLogin, startLogin } from "./data.ts";
import { CopyIcon, ExternalLinkIcon, Icon } from "./icons.ts";
import { LOGINS, type Login } from "./loginSteps.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";

const failed = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : String(e), {
    duration: Infinity,
    closeButton: true,
  });

const copy = (code: string) =>
  navigator.clipboard
    .writeText(code)
    .then(() => toast.success("Code copied."), failed);

interface LoginCardProps {
  login: Login;
}

const LoginCard = ({ login }: LoginCardProps) => {
  const [url, setUrl] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [busy, setBusy] = useState(false);

  const start = () => {
    if (login.link) return setUrl(login.link);
    setBusy(true);
    startLogin(login.id)
      .then(setUrl, failed)
      .finally(() => setBusy(false));
  };

  const finish = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    finishLogin(login.id, pasted)
      .then(() => {
        setUrl(null);
        setPasted("");
        toast.success(
          `${login.title} is connected. Press Refresh to get new data.`,
        );
      }, failed)
      .finally(() => setBusy(false));
  };

  return (
    <Panel title={login.title} description={login.note}>
      {url === null ? (
        <Button
          variant="outline"
          className="self-start"
          disabled={busy}
          onClick={start}
        >
          Connect {login.title}
        </Button>
      ) : (
        <ol className="flex min-w-0 list-decimal flex-col gap-4 pl-5 text-sm">
          <li>
            Open the login in a new tab.
            <Button
              asChild
              variant="outline"
              size="sm"
              className="mt-2 flex w-fit"
            >
              <a href={url} target="_blank" rel="noreferrer">
                Open {login.title}
                <Icon icon={ExternalLinkIcon} />
              </a>
            </Button>
          </li>
          {login.steps.map((step, i) => (
            <li key={step} className="min-w-0">
              {step}
              {login.code && i === login.steps.length - 1 && (
                <div className="mt-2 flex flex-col items-start gap-2">
                  <pre className="w-full overflow-x-auto rounded-lg border p-2 font-mono text-xs">
                    {login.code}
                  </pre>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copy(login.code!)}
                  >
                    <Icon icon={CopyIcon} />
                    Copy code
                  </Button>
                </div>
              )}
            </li>
          ))}
          <li className="min-w-0">
            Paste it here.
            <form className="mt-2 flex min-w-0 gap-2" onSubmit={finish}>
              <Input
                aria-label={`${login.title} login`}
                placeholder={login.placeholder}
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

export const Logins = () => (
  <section className="flex min-w-0 max-w-2xl flex-col gap-8">
    <p className="text-sm text-muted-foreground">
      Refresh gets data with these logins. When it reports an expired login,
      connect that source again here.
    </p>
    {LOGINS.map((login) => (
      <LoginCard key={login.id} login={login} />
    ))}
  </section>
);
