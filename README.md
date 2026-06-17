# Ludo

A polished, server-authoritative multiplayer Ludo game built with Next.js 16.2,
React 19, Tailwind CSS 4, Socket.IO, Cache Components, and Partial Prerendering.

## Development

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Verification

```bash
npm test
npm run lint
npm run typecheck
npm run security:audit
npm run security:signatures
npm run build
npm run smoke:multiplayer
```

The multiplayer smoke test requires the development server to be running.

## Production Deployment

The production service requires Node.js 22, `npm run build`, and `npm start`.
DigitalOcean App Platform should use `/api/health` as its HTTP health check.
Authentication is first-party and stores users, sessions, and match history in
`AUTH_DATA_DIR` (default: `.data` under the app root). Point `AUTH_DATA_DIR` at
durable writable storage in production so accounts and stats survive deploys.
Set `APP_ORIGINS` to a comma-separated list of exact origins only when a
cross-origin browser client must connect; otherwise realtime connections are
restricted to the request host. Configured origins are added to the same-origin
default.

Active rooms currently live in the single Node server's memory. Rooms survive
temporary client disconnects, but a deploy or server restart clears them. Keep
the service at one instance until room state and the Socket.IO adapter are moved
to shared storage.
