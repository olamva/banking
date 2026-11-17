export const fold = (s: string): string =>
  s
    .toLowerCase()
    .replace(/ø/g, "o")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

const wordsOf = (s: string) =>
  fold(s)
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

const typos = (n: number) => (n < 4 ? 0 : n < 7 ? 1 : 2);

const prefixDistance = (q: string, w: string): number => {
  let before: number[] = [];
  let prev = Array.from({ length: w.length + 1 }, (_, j) => j);
  for (let i = 1; i <= q.length; i++) {
    const row = [i];
    for (let j = 1; j <= w.length; j++) {
      row[j] = Math.min(
        prev[j]! + 1,
        row[j - 1]! + 1,
        prev[j - 1]! + (q[i - 1] === w[j - 1] ? 0 : 1),
        i > 1 && j > 1 && q[i - 1] === w[j - 2] && q[i - 2] === w[j - 1]
          ? before[j - 2]! + 1
          : Infinity,
      );
    }
    before = prev;
    prev = row;
  }
  return Math.min(...prev);
};

export const MISS = 5;

export const searchRank = (
  query: string,
  name: string,
  terms: string[] = [],
): number => {
  const q = fold(query.trim());
  const n = fold(name);
  if (n.startsWith(q)) return 0;
  const tokens = wordsOf(q);
  const words = wordsOf(name);
  const pool = [...words, ...terms.flatMap(wordsOf)];
  const all = (list: string[], fits: (t: string, w: string) => boolean) =>
    tokens.length > 0 && tokens.every((t) => list.some((w) => fits(t, w)));
  const prefix = (t: string, w: string) => w.startsWith(t);
  if (all(words, prefix)) return 1;
  if (n.includes(q)) return 2;
  if (all(pool, prefix)) return 3;
  if (all(pool, (t, w) => prefixDistance(t, w) <= typos(t.length))) return 4;
  return MISS;
};

const ENGLISH: Record<string, string> = {
  annet_lan_og_gjeld: "other loans debt",
  betalingsoppfolging: "debt collection payment reminder",
  studielan: "student loan",
  bil_og_transport: "car transport transportation vehicle",
  bilavgifter: "car fees tolls road tax",
  drivstoff: "fuel gas petrol diesel",
  kollektivtransport: "public transport bus train tram metro subway",
  leiebil: "car rental",
  parkering: "parking",
  taxi: "taxi cab",
  dagligvarer: "groceries grocery food supermarket",
  andre_dagligvarer: "other groceries",
  diverse: "miscellaneous misc other",
  betaling: "payment",
  kurs_utdanning: "courses education school tuition",
  medlemskap_veldedighet: "membership charity donation",
  minibank: "atm cash withdrawal",
  overforing: "transfer",
  overfoering: "transfer transfers",
  renter_innskudd: "interest earned",
  renter_og_gebyrer: "interest fees charges",
  skatt: "tax taxes",
  utlegg: "expenses outlay reimbursement",
  vennebetaling: "friend payment split",
  faste_utgifter: "fixed costs bills utilities",
  boligutgifter: "rent housing",
  kommunale_avgifter: "municipal fees council tax",
  mobiltelefon: "mobile phone cell",
  stroem: "electricity power energy",
  forsikring: "insurance",
  helse_og_velvaere: "health wellness wellbeing",
  apotek: "pharmacy drugstore medicine",
  lege: "doctor medical healthcare",
  skjonnhet: "beauty hairdresser cosmetics",
  velvare: "wellness spa",
  hjem_og_hage: "home garden house",
  byggvare: "hardware building materials diy",
  hage_og_blomster: "garden flowers plants",
  hvitevarer_og_elektronikk: "appliances electronics",
  kjokkenutstyr: "kitchen kitchenware",
  mobler_og_interior: "furniture interior decor",
  verktoy: "tools",
  hobby_og_fritid: "hobby leisure",
  arrangement: "events tickets concerts",
  digital_markedsplass: "digital marketplace online",
  foto: "photo photography camera",
  fritidsaktiviteter: "leisure activities",
  kino: "cinema movies film",
  leker: "toys",
  nettjenester: "online services web",
  post: "mail shipping postage",
  trening: "training gym fitness exercise workout",
  innskudd: "income deposits",
  annet_innskudd: "other income deposit",
  familie: "family",
  lommepenger: "pocket money allowance",
  lonn: "salary wages pay paycheck",
  salg: "sales selling",
  utbytte: "dividend dividends",
  kafe_og_restaurant: "cafe restaurant eating out dining",
  fastfood: "fast food burger",
  godteri: "candy sweets",
  kafe: "cafe coffee",
  kantine: "canteen cafeteria lunch",
  kiosk: "convenience store",
  linjeforening_kiosk: "student association",
  restaurant: "dining",
  utesteder: "bars pubs nightlife clubs drinks",
  klaer_og_utstyr: "clothes clothing gear equipment",
  klaer: "clothes clothing apparel",
  smykker: "jewelry jewellery accessories",
  sportsutstyr: "sports equipment gear",
  medier_og_underholdning: "media entertainment",
  apper_og_spill: "apps games gaming",
  aviser: "newspapers news",
  bokhandler: "books bookstore",
  musikk: "music",
  pengespill: "gambling betting lottery",
  strommetjenester: "streaming subscriptions",
  reise: "travel trips",
  annen_reise: "other travel",
  flybilletter: "flights plane tickets airline",
  overnatting: "accommodation hotel lodging",
  reiseselskap: "travel agency tour operator",
  sparing: "savings",
  ukategorisert: "uncategorized uncategorised",
};

export const categoryTerms = (value: string): string[] => {
  const slug = value.slice(value.lastIndexOf("/") + 1) || value.slice(0, -1);
  return [slug, ENGLISH[slug] ?? ""];
};
