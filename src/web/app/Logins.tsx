import { Fragment, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { finishLogin, startLogin } from "./data.ts";
import { CopyIcon, ExternalLinkIcon, Icon } from "./icons.ts";
import { LOGINS, type Login } from "./loginSteps.ts";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import {
  Item,
  ItemActions,
  ItemContent,
  ItemFooter,
  ItemGroup,
  ItemMedia,
  ItemSeparator,
  ItemTitle,
} from "./ui/item.tsx";

const failed = (e: unknown) =>
  toast.error(e instanceof Error ? e.message : String(e), {
    duration: Infinity,
    closeButton: true,
  });

const copy = (code: string) =>
  navigator.clipboard
    .writeText(code)
    .then(() => toast.success("Code copied."), failed);

interface LoginItemProps {
  login: Login;
}

const LoginItem = ({ login }: LoginItemProps) => {
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

  const close = () => {
    setUrl(null);
    setPasted("");
  };

  const finish = (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    finishLogin(login.id, pasted)
      .then(() => {
        close();
        toast.success(`${login.title} is connected.`);
      }, failed)
      .finally(() => setBusy(false));
  };

  return (
    <Item>
      <ItemMedia variant="image" className="rounded-lg border">
        <img src={`/logos/${login.id}.png`} alt="" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{login.title}</ItemTitle>
      </ItemContent>
      <ItemActions>
        <Button
          variant="outline"
          size="sm"
          disabled={busy && url === null}
          onClick={url === null ? start : close}
        >
          {url === null ? "Connect" : "Cancel"}
        </Button>
      </ItemActions>
      {url !== null && (
        <ItemFooter className="min-w-0 sm:pl-14">
          <ol className="flex w-full min-w-0 list-decimal flex-col gap-3 pl-5">
            <li>
              <Button
                asChild
                variant="outline"
                size="sm"
                className="flex w-fit"
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
                    <pre className="w-full overflow-x-auto rounded-lg border bg-muted/50 p-2 font-mono text-xs">
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
              <form className="flex min-w-0 gap-2" onSubmit={finish}>
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
        </ItemFooter>
      )}
    </Item>
  );
};

export const Logins = () => (
  <ItemGroup className="max-w-2xl rounded-xl border bg-card">
    {LOGINS.map((login, i) => (
      <Fragment key={login.id}>
        {i > 0 && <ItemSeparator />}
        <LoginItem login={login} />
      </Fragment>
    ))}
  </ItemGroup>
);
