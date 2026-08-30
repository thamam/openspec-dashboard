// Shared CORS configuration (S1 security fix).
// The server exposes shell-spawning endpoints, so it must only accept
// browser traffic from the local Vite dev server origins.
// Requests without an Origin header (curl, server-to-server, same-origin)
// are allowed; only loopback dev origins send credentialed browser traffic.

const LOOPBACK_DEV_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:(5173|5183))?$/;

export function isAllowedOrigin(origin: string | undefined): boolean {
  if (!origin) return true; // non-browser clients don't send Origin
  return LOOPBACK_DEV_ORIGIN.test(origin);
}

export const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    }
  },
};
