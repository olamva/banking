type Claim = { typ?: string; val?: string };
type Principal = { claims?: Claim[] };

// Easy Auth spells the address differently for each provider. Google sends the
// SOAP claim type, and the short names arrive from the others.
const EMAIL_CLAIMS = new Set([
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/name",
  "email",
  "emails",
  "preferred_username",
  "upn",
  "unique_name",
]);

const isAddress = (v: string): boolean => /^[^@\s,]+@[^@\s,]+$/.test(v);

/** The claim types that arrived, for a log line. It carries no address. */
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

/**
 * Easy Auth proves who somebody is. It does not restrict to one person.
 *
 * The platform sets both headers and strips them off an inbound request, so
 * both are equally safe. The name header is the fallback, because a provider
 * may send the address under a claim type that no list predicts.
 */
export function principalEmail(
  header: string | undefined,
  name?: string | undefined,
): string | null {
  const p = decode(header);
  if (p && Array.isArray(p.claims)) {
    for (const c of p.claims)
      if (c && EMAIL_CLAIMS.has(c.typ ?? "") && c.val) return c.val;
    // No known type carried it. Any claim that is plainly an address will do.
    for (const c of p.claims) if (c?.val && isAddress(c.val)) return c.val;
  }
  return name && isAddress(name) ? name : null;
}
