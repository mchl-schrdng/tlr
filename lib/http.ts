// Same-origin guard for side-effecting POST endpoints. A cross-site page can
// trigger a POST but the browser attaches an Origin header we can compare
// against the request Host. Requests without an Origin (curl, server-to-server)
// carry no CSRF risk and are allowed.
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
