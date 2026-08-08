/**
 * The one thing the page fetches: every transaction, from the local server.
 *
 * Not embedded in the HTML any more — Vite serves the shell, `serve.ts` serves
 * the rows. Kept out of the component files on purpose, so nothing that renders
 * also knows how the data arrives.
 */
import { useEffect, useState } from 'react';
import type { Categorized } from '../../core/types.ts';

type Load =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; txns: Categorized[] };

export const useTransactions = (): Load => {
  const [load, setLoad] = useState<Load>({ status: 'loading' });

  useEffect(() => {
    let live = true;
    fetch('/api/txns')
      .then(async (r) => {
        if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
        return (await r.json()) as Categorized[];
      })
      .then((txns) => live && setLoad({ status: 'ready', txns }))
      .catch((e: unknown) => live && setLoad({ status: 'error', message: e instanceof Error ? e.message : String(e) }));
    return () => {
      live = false;
    };
  }, []);

  return load;
};

/** Theme is three-state: explicit dark, explicit light, or whatever the system says. */
export const cycleTheme = (): void => {
  const html = document.documentElement;
  const current = html.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : current === 'light' ? null : 'dark';
  if (next) {
    html.setAttribute('data-theme', next);
    localStorage.setItem('dashboardTheme', next);
  } else {
    html.removeAttribute('data-theme');
    localStorage.removeItem('dashboardTheme');
  }
};
