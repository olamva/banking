type Claim = { typ?: string; val?: string };
type Principal = { auth_typ?: string; claims?: Claim[] };

export const GOOGLE_EMAIL_CLAIM =
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress";

const isAddress = /^[^@\s,]+@[^@\s,]+\.[^@\s,]+$/;

export function claimTypes(header: string | undefined): string[] {
  const p = decode(header);
  if (!p?.claims) return [];
  return p.claims.map((c) => c.typ ?? "?");
}

function decode(header: string | undefined): Principal | null {
  if (!header) return null;
  try {
    return JSON.parse(
      Buffer.from(header, "base64").toString("utf8"),
    ) as Principal;
  } catch {
    return null;
  }
}

export function principalEmail(header: string | undefined): string | null {
  const p = decode(header);
  if (p?.auth_typ !== "google" || !Array.isArray(p.claims)) return null;
  const values = p.claims
    .filter((c) => c?.typ === GOOGLE_EMAIL_CLAIM)
    .map((c) => c.val)
    .filter((v): v is string => typeof v === "string");
  if (values.length !== 1 || !isAddress.test(values[0]!)) return null;
  return values[0]!;
}
