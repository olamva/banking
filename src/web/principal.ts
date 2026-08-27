type Claim = { typ?: string; val?: string };
type Principal = { claims?: Claim[] };

// Easy Auth spells the address differently for each provider. Google sends the
// SOAP claim type, and the short names arrive from the others.
const EMAIL_CLAIMS = new Set([
  "http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress",
  "email",
  "emails",
  "preferred_username",
  "upn",
]);

/** Easy Auth proves who somebody is. It does not restrict to one person. */
export function principalEmail(header: string | undefined): string | null {
  if (!header) return null;
  let p: Principal;
  try {
    p = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as Principal;
  } catch {
    return null;
  }
  if (!Array.isArray(p?.claims)) return null;
  for (const c of p.claims)
    if (c && EMAIL_CLAIMS.has(c.typ ?? "") && c.val) return c.val;
  return null;
}
