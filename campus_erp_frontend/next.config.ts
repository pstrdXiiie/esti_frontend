import type { NextConfig } from "next";

// Proxy /api/* to the Frappe bench in development so the session cookie and
// CSRF token stay same-origin (see blueprint §5.4). The bench's
// `serve_default_site` is on, so any Host header routes to estierp.local.
//
// /files/* and /private/files/* are proxied the same way — Frappe serves
// every uploaded Attach/Attach Image field (Student photos, Employee
// profile photos, the Print Header logo, etc.) at one of these two paths
// on ITS OWN webserver root, not under /api, so without this an <img src>
// built from a stored file_url 404s against the Next.js origin instead of
// reaching the bench (found via the Print Header logo rendering broken).
// /private/files/* additionally needs the session cookie forwarded, same
// reasoning as /api, since Frappe checks read permission on private files.
const FRAPPE_BACKEND_URL =
  process.env.NEXT_PUBLIC_FRAPPE_URL ?? "http://127.0.0.1:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${FRAPPE_BACKEND_URL}/api/:path*`,
      },
      {
        source: "/files/:path*",
        destination: `${FRAPPE_BACKEND_URL}/files/:path*`,
      },
      {
        source: "/private/files/:path*",
        destination: `${FRAPPE_BACKEND_URL}/private/files/:path*`,
      },
    ];
  },
};

export default nextConfig;
