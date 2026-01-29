// Development server using Bun's built-in server

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

    // Default to index.html
    if (path === '/') {
      path = '/index.html';
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
