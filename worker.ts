// Cloudflare Worker with static assets and API routes

interface Env {
  LEADERBOARD: KVNamespace;
  ASSETS: Fetcher;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  timestamp: number;
}

const MAX_ENTRIES = 10;
const MAX_SCORE = 10_000_000;
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

function validateToken(token: string): boolean {
  try {
    const [timestampStr, hash] = token.split(':');
    if (!timestampStr || !hash) return false;
    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;
    if (Date.now() - timestamp > TOKEN_MAX_AGE_MS) return false;
    if (hash.length < 1 || hash.length > 10) return false;
    return true;
  } catch {
    return false;
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API: GET /api/leaderboard
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      try {
        // Get difficulty from query parameter, default to 'hard' for backwards compatibility
        const difficulty = url.searchParams.get('difficulty') || 'hard';
        const kvKey = difficulty === 'normal' ? 'scores_normal' : 'scores';

        const data = await env.LEADERBOARD.get(kvKey, 'json') as LeaderboardEntry[] | null;
        const entries = (data || []).map((entry, index) => ({ ...entry, rank: index + 1 }));
        return new Response(JSON.stringify(entries), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=10' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch leaderboard' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // API: POST /api/submit-score
    if (url.pathname === '/api/submit-score' && request.method === 'POST') {
      try {
        const body = await request.json() as { name: string; score: number; gameToken: string; difficulty?: string };
        const { name, score, gameToken, difficulty = 'hard' } = body;

        // Determine KV key based on difficulty
        const kvKey = difficulty === 'normal' ? 'scores_normal' : 'scores';

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
        const validScore = Math.floor(Math.max(0, Math.min(MAX_SCORE, score)));

        // Validate token
        if (!gameToken || !validateToken(gameToken)) {
          return new Response(JSON.stringify({ success: false, error: 'Invalid game token' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        // Get current leaderboard for the specified difficulty
        const data = await env.LEADERBOARD.get(kvKey, 'json') as LeaderboardEntry[] | null;
        const entries = data || [];

        // Add new entry
        const newEntry: LeaderboardEntry = {
          rank: 0,
          name: normalizedName,
          score: validScore,
          timestamp: Date.now(),
        };

        entries.push(newEntry);
        entries.sort((a, b) => b.score - a.score);

        const topEntries = entries.slice(0, MAX_ENTRIES).map((entry, index) => ({
          ...entry,
          rank: index + 1,
        }));

        const newRank = topEntries.findIndex(
          (e) => e.name === newEntry.name && e.score === newEntry.score && e.timestamp === newEntry.timestamp
        );

        await env.LEADERBOARD.put(kvKey, JSON.stringify(topEntries));

        return new Response(JSON.stringify({
          success: true,
          rank: newRank >= 0 ? newRank + 1 : null,
          leaderboard: topEntries,
        }), {
          headers: { 'Content-Type': 'application/json' },
        });
      } catch (error) {
        return new Response(JSON.stringify({ success: false, error: 'Failed to submit score' }), {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        });
      }
    }

    // Serve static assets for everything else
    return env.ASSETS.fetch(request);
  },
};
