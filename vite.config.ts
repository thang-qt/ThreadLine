import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { fetchAggregatedFeed } from './src/server/feed/fetchFeed';
import { isAllowedLobstersProxyPath, isHnFeed, isLobstersFeed, sourceEnabledFromSearch } from './src/lib/sources';

function feedDevProxy(): Plugin {
  return {
    name: 'feed-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/feed', async (req, res) => {
        try {
          const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
          const hn = query.get('hn') ?? 'top';
          const lobsters = query.get('lobsters') ?? 'hottest';
          if (!isHnFeed(hn) || !isLobstersFeed(lobsters)) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Unsupported feed mode' }));
            return;
          }
          const sourceEnabled = sourceEnabledFromSearch(query);
          const payload = await fetchAggregatedFeed({ hn, lobsters, sourceEnabled });
          res.writeHead(payload.stories.length ? 200 : 502, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify(payload));
        } catch (error) {
          const query = new URL(req.url ?? '/', 'http://localhost').searchParams;
          const sourceEnabled = sourceEnabledFromSearch(query);
          const message = error instanceof Error ? error.message : 'Development feed proxy failed';
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ stories: [], errors: Object.fromEntries(Object.entries(sourceEnabled).filter(([, enabled]) => enabled).map(([source]) => [source, message])) }));
        }
      });
    }
  };
}

function lobstersDevProxy(): Plugin {
  return {
    name: 'lobsters-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/lobsters', async (req, res) => {
        const path = (req.url ?? '/').replace(/^\/+/, '').split('?')[0];
        if (!isAllowedLobstersProxyPath(path)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unsupported Lobsters API path' }));
          return;
        }
        try {
          const upstream = await fetch(`https://lobste.rs/${path}`, { headers: { Accept: 'application/json' } });
          const body = await upstream.arrayBuffer();
          res.writeHead(upstream.status, {
            'Content-Type': upstream.headers.get('content-type') ?? 'application/json',
            'Cache-Control': 'no-store'
          });
          res.end(Buffer.from(body));
        } catch {
          res.writeHead(502, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Could not reach Lobsters from the Vite development proxy' }));
        }
      });
    }
  };
}

export default defineConfig({
  plugins: [react(), feedDevProxy(), lobstersDevProxy()],
  test: { environment: 'node', include: ['src/**/*.test.ts'] }
});
