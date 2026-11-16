export interface Login {
  id: string;
  title: string;
  link?: string;
  steps: string[];
  code?: string;
  placeholder: string;
}

const COPY = "Copy the address of the page that does not load.";

const REMA_CODE =
  'indexedDB.open("firebaseLocalStorageDb").onsuccess=(e)=>{e.target.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll().onsuccess=(r)=>{const u=r.target.result.map((x)=>x.value).find((v)=>v&&v.stsTokenManager);copy(JSON.stringify({key:u.apiKey,refreshToken:u.stsTokenManager.refreshToken}))}}';

export const LOGINS: Login[] = [
  {
    id: "bank",
    title: "SpareBank 1",
    steps: ["Log in with BankID.", `${COPY} It expires after 2 minutes.`],
    placeholder: "http://localhost…/callback?code=…",
  },
  {
    id: "coop",
    title: "Coop",
    steps: ["Log in with your password and the SMS code.", COPY],
    placeholder: "https://login.coop.no/android/…?code=…",
  },
  {
    id: "gmail",
    title: "Gmail",
    steps: ["Allow read access to your mail.", COPY],
    placeholder: "http://127.0.0.1:8765/?…code=…",
  },
  {
    id: "rema",
    title: "Rema",
    steps: [
      "Log in with your phone number and the SMS code.",
      "Go to id.rema.no/in and run this code in the DevTools console.",
    ],
    code: REMA_CODE,
    placeholder: '{"key":"…","refreshToken":"…"}',
  },
  {
    id: "trumf",
    title: "Trumf",
    link: "https://www.trumf.no/trumf-profil/kvitteringer",
    steps: [
      "Log in. In DevTools, open Network and reload.",
      "Copy the cookie request header of the kvitteringer request.",
    ],
    placeholder: "__Secure-authjs.session-token.0=…",
  },
];
