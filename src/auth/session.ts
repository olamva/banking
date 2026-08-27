/** An empty list denies everybody. A missing variable must never open the door. */
export function allowed(email: string, list: string | undefined): boolean {
  const want = email.trim().toLowerCase();
  if (!want) return false;
  return (list ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(want);
}
