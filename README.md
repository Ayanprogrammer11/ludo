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
npx tsc --noEmit
npm run build
npm run smoke:multiplayer
```

The multiplayer smoke test requires the development server to be running.

## Render Deployment

The included `render.yaml` defines a free Render Web Service with the correct
build command, start command, Node version, and health check.

Active rooms currently live in the single Node server's memory. Rooms survive
temporary client disconnects, but a deploy or server restart clears them.
