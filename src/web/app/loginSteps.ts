export interface Login {
  id: string;
  title: string;
  note: string;
  link?: string;
  steps: string[];
  code?: string;
  placeholder: string;
}

const COPIED = "The last page does not load. Copy its full address.";

const REMA_CODE =
  'indexedDB.open("firebaseLocalStorageDb").onsuccess=(e)=>{e.target.result.transaction("firebaseLocalStorage").objectStore("firebaseLocalStorage").getAll().onsuccess=(r)=>{const u=r.target.result.map((x)=>x.value).find((v)=>v&&v.stsTokenManager);copy(JSON.stringify({key:u.apiKey,refreshToken:u.stsTokenManager.refreshToken}))}}';

export const LOGINS: Login[] = [
  {
    id: "bank",
    title: "SpareBank 1",
    note: "Transactions from the bank.",
    steps: [
      "Log in with BankID.",
      `${COPIED} The code in it expires after 2 minutes.`,
    ],
    placeholder: "http://localhost…/callback?code=…",
  },
  {
    id: "coop",
    title: "Coop",
    note: "Coop keeps one login. A new login elsewhere ends this one.",
    steps: ["Log in with your password and the SMS code.", COPIED],
    placeholder: "https://login.coop.no/android/…?code=…",
  },
  {
    id: "gmail",
    title: "Gmail",
    note: "Receipts from your mail.",
    steps: ["Select your account and allow read access to your mail.", COPIED],
    placeholder: "http://127.0.0.1:8765/?…code=…",
  },
  {
    id: "rema",
    title: "Rema",
    note: "Do these steps in Chrome on a computer.",
    steps: [
      "Log in with your phone number and the SMS code.",
      "Go to id.rema.no/in in the same tab. Open the DevTools console.",
      "Run this code. It copies your login. If Chrome blocks the paste, type allow pasting first.",
    ],
    code: REMA_CODE,
    placeholder: '{"key":"…","refreshToken":"…"}',
  },
  {
    id: "trumf",
    title: "Trumf",
    note: "Do these steps on a computer.",
    link: "https://www.trumf.no/trumf-profil/kvitteringer",
    steps: [
      "Log in. Open DevTools, select Network and reload the page.",
      "Select the kvitteringer request. Copy the value of its cookie request header.",
    ],
    placeholder: "__Secure-authjs.session-token.0=…",
  },
];
