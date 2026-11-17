import type { Categorized } from "./types.ts";

export type Names = Record<string, string>;

export type Labels = {
  category: (slug: string) => string;
  subcategory: (category: string, sub: string | null) => string;
};

export function tidy(slug: string): string {
  const words = slug.replace(/_/g, " ").trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : slug;
}

export const bankLabel = (
  t: Categorized,
): [name: string, slug: string] | null => {
  if (t.bankCategory === null) return null;
  const name = t.bankCategoryName ?? tidy(t.bankCategory);
  const sub = t.bankSubName ?? (t.bankSub === null ? null : tidy(t.bankSub));
  return [
    sub === null ? name : `${name} / ${sub}`,
    t.bankSub === null ? t.bankCategory : `${t.bankCategory}/${t.bankSub}`,
  ];
};

export const NO_SUB = "Other";

const ENGLISH: Names = {
  annet_lan_og_gjeld: "Other loans and debt",
  "annet_lan_og_gjeld/betalingsoppfolging": "Debt collection",
  "annet_lan_og_gjeld/studielan": "Student loan",
  bil_og_transport: "Car and transport",
  "bil_og_transport/bilavgifter": "Car fees",
  "bil_og_transport/drivstoff": "Fuel",
  "bil_og_transport/kollektivtransport": "Public transport",
  "bil_og_transport/leiebil": "Car rental",
  "bil_og_transport/parkering": "Parking",
  "bil_og_transport/taxi": "Taxi",
  dagligvarer: "Groceries",
  "dagligvarer/andre_dagligvarer": "Other groceries",
  "dagligvarer/dagligvarer": "Food",
  diverse: "Miscellaneous",
  "diverse/betaling": "Payments",
  "diverse/kurs_utdanning": "Courses and education",
  "diverse/medlemskap_veldedighet": "Memberships and charity",
  "diverse/minibank": "Cash withdrawals",
  "diverse/overforing": "Transfers",
  "diverse/renter_innskudd": "Interest earned",
  "diverse/renter_og_gebyrer": "Interest and fees",
  "diverse/skatt": "Tax",
  "diverse/utlegg": "Outlays",
  "diverse/vennebetaling": "Payments to friends",
  faste_utgifter: "Fixed costs",
  "faste_utgifter/boligutgifter": "Housing",
  "faste_utgifter/kommunale_avgifter": "Municipal fees",
  "faste_utgifter/mobiltelefon": "Mobile phone",
  "faste_utgifter/stroem": "Electricity",
  forsikring: "Insurance",
  "forsikring/forsikring": "Insurance",
  helse_og_velvaere: "Health and wellness",
  "helse_og_velvaere/apotek": "Pharmacy",
  "helse_og_velvaere/lege": "Doctor and healthcare",
  "helse_og_velvaere/skjonnhet": "Beauty",
  "helse_og_velvaere/velvare": "Wellness",
  hjem_og_hage: "Home and garden",
  "hjem_og_hage/byggvare": "Building supplies",
  "hjem_og_hage/hage_og_blomster": "Garden and flowers",
  "hjem_og_hage/hvitevarer_og_elektronikk": "Appliances and electronics",
  "hjem_og_hage/kjokkenutstyr": "Kitchenware",
  "hjem_og_hage/mobler_og_interior": "Furniture and interior",
  "hjem_og_hage/verktoy": "Tools",
  hobby_og_fritid: "Hobbies and leisure",
  "hobby_og_fritid/arrangement": "Events",
  "hobby_og_fritid/digital_markedsplass": "Digital marketplaces",
  "hobby_og_fritid/foto": "Photo",
  "hobby_og_fritid/fritidsaktiviteter": "Leisure activities",
  "hobby_og_fritid/hobby": "Hobbies",
  "hobby_og_fritid/kino": "Cinema",
  "hobby_og_fritid/leker": "Toys",
  "hobby_og_fritid/nettjenester": "Online services",
  "hobby_og_fritid/post": "Postage",
  "hobby_og_fritid/trening": "Training",
  innskudd: "Income",
  "innskudd/annet_innskudd": "Other deposits",
  "innskudd/familie": "From family",
  "innskudd/lommepenger": "Pocket money",
  "innskudd/lonn": "Salary",
  "innskudd/salg": "Sales",
  "innskudd/utbytte": "Dividends",
  kafe_og_restaurant: "Cafés and restaurants",
  "kafe_og_restaurant/fastfood": "Fast food",
  "kafe_og_restaurant/godteri": "Sweets",
  "kafe_og_restaurant/kafe": "Cafés",
  "kafe_og_restaurant/kantine": "Canteen",
  "kafe_og_restaurant/kiosk": "Kiosks",
  "kafe_og_restaurant/linjeforening_kiosk": "Student kiosk",
  "kafe_og_restaurant/restaurant": "Restaurants",
  "kafe_og_restaurant/utesteder": "Bars and nightlife",
  klaer_og_utstyr: "Clothing and gear",
  "klaer_og_utstyr/klaer": "Clothing",
  "klaer_og_utstyr/smykker": "Jewellery and accessories",
  "klaer_og_utstyr/sportsutstyr": "Sports gear",
  medier_og_underholdning: "Media and entertainment",
  "medier_og_underholdning/apper_og_spill": "Apps and games",
  "medier_og_underholdning/aviser": "Newspapers",
  "medier_og_underholdning/bokhandler": "Books",
  "medier_og_underholdning/musikk": "Music",
  "medier_og_underholdning/pengespill": "Gambling",
  "medier_og_underholdning/strommetjenester": "Streaming",
  overfoering: "Transfers",
  reise: "Travel",
  "reise/annen_reise": "Other travel",
  "reise/flybilletter": "Flights",
  "reise/kollektivtransport": "Public transport",
  "reise/overnatting": "Accommodation",
  "reise/reiseselskap": "Travel agencies",
  sparing: "Savings",
  "sparing/sparing": "Savings",
  ukategorisert: "Uncategorized",
};

export function buildLabels(txns: Categorized[], names: Names = {}): Labels {
  const mains = new Map<string, string>();
  const subs = new Map<string, string>();
  const bareSubs = new Map<string, string>();
  for (const t of txns) {
    if (t.bankCategory && t.bankCategoryName && !mains.has(t.bankCategory)) {
      mains.set(t.bankCategory, t.bankCategoryName);
    }
    if (t.bankCategory && t.bankSub && t.bankSubName) {
      const key = `${t.bankCategory}/${t.bankSub}`;
      if (!subs.has(key)) subs.set(key, t.bankSubName);
      if (!bareSubs.has(t.bankSub)) bareSubs.set(t.bankSub, t.bankSubName);
    }
  }

  return {
    category: (slug) =>
      names[slug] ?? ENGLISH[slug] ?? mains.get(slug) ?? tidy(slug),
    subcategory: (category, sub) => {
      if (sub === null) return NO_SUB;
      return (
        names[`${category}/${sub}`] ??
        ENGLISH[`${category}/${sub}`] ??
        subs.get(`${category}/${sub}`) ??
        bareSubs.get(sub) ??
        tidy(sub)
      );
    },
  };
}
