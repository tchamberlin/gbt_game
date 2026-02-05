// Development server using Bun's built-in server

// In-memory leaderboard for local development
let mockLeaderboard: { rank: number; name: string; score: number; timestamp: number }[] = [];

async function bundle() {
  console.log('Bundling...');
  const result = await Bun.build({
    entrypoints: ['./src/main.ts'],
    outdir: '.',
    naming: 'bundle.js',
    target: 'browser',
  });
  if (!result.success) {
    console.error('Bundle errors:', result.logs);
  } else {
    console.log('Bundle complete');
  }
}

// Initial bundle
await bundle();

// Watch for changes and rebundle
const watcher = require('fs').watch('./src', { recursive: true }, async (event: string, filename: string) => {
  if (filename?.endsWith('.ts')) {
    console.log(`File changed: ${filename}`);
    await bundle();
  }
});

const server = Bun.serve({
  port: 3000,
  async fetch(request) {
    const url = new URL(request.url);
    let path = url.pathname;

    // API routes for local development
    if (path === '/api/leaderboard' && request.method === 'GET') {
      return new Response(JSON.stringify(mockLeaderboard), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (path === '/api/submit-score' && request.method === 'POST') {
      try {
        const body = await request.json() as { name: string; score: number; gameToken: string };
        const { name, score, gameToken } = body;

        // Validate name
        const normalizedName = (name || '').toUpperCase().trim();
        if (!/^[A-Z]{3}$/.test(normalizedName)) {
          return new Response(JSON.stringify({ success: false, error: 'Name must be exactly 3 letters' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Validate score
        if (typeof score !== 'number' || !Number.isFinite(score)) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid score' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Add to leaderboard
        const newEntry = {
          rank: 0,
          name: normalizedName,
          score: Math.floor(Math.max(0, Math.min(10_000_000, score))),
          timestamp: Date.now(),
        };

        mockLeaderboard.push(newEntry);
        mockLeaderboard.sort((a, b) => b.score - a.score);
        mockLeaderboard = mockLeaderboard.slice(0, 10).map((e, i) => ({ ...e, rank: i + 1 }));

        const rank = mockLeaderboard.findIndex(
          (e) => e.name === newEntry.name && e.score === newEntry.score && e.timestamp === newEntry.timestamp
        );

        return new Response(JSON.stringify({
          success: true,
          rank: rank >= 0 ? rank + 1 : null,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch {
        return new Response(JSON.stringify({ success: false, error: 'Invalid request' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Default to index.html
    if (path === '/') {
      path = '/index.html';
    }

    // In dev, /assets/ maps to /src/assets/ (in prod, assets are copied to dist/assets/)
    if (path.startsWith('/assets/')) {
      path = '/src' + path;
    }

    // Serve files from the project directory
    const filePath = '.' + path;

    try {
      const file = Bun.file(filePath);

      if (await file.exists()) {
        // Determine content type
        let contentType = 'application/octet-stream';
        if (path.endsWith('.html')) contentType = 'text/html';
        else if (path.endsWith('.js')) contentType = 'application/javascript';
        else if (path.endsWith('.css')) contentType = 'text/css';
        else if (path.endsWith('.json')) contentType = 'application/json';
        else if (path.endsWith('.m4a')) contentType = 'audio/mp4';
        else if (path.endsWith('.mp3')) contentType = 'audio/mpeg';
        else if (path.endsWith('.png')) contentType = 'image/png';
        else if (path.endsWith('.svg')) contentType = 'image/svg+xml';

        return new Response(file, {
          headers: { 'Content-Type': contentType },
        });
      }
    } catch (e) {
      // File not found, fall through
    }

    return new Response('Not Found', { status: 404 });
  },
});

console.log(`Server running at http://localhost:${server.port}`);
console.log('Mock leaderboard API enabled at /api/leaderboard and /api/submit-score');
