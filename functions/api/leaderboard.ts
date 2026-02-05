// GET /api/leaderboard - Returns top 10 scores from KV

interface Env {
  LEADERBOARD: KVNamespace;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  timestamp: number;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    // Get difficulty from query parameter, default to 'hard' for backwards compatibility
    const url = new URL(request.url);
    const difficulty = url.searchParams.get('difficulty') || 'hard';
    const kvKey = difficulty === 'normal' ? 'scores_normal' : 'scores';

    // Get leaderboard from KV (stored as JSON array)
    const data = await env.LEADERBOARD.get(kvKey, 'json') as LeaderboardEntry[] | null;
    const entries = data || [];

    // Ensure rank field is up to date
    const rankedEntries = entries.map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    return new Response(JSON.stringify(rankedEntries), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=10',
      },
    });
  } catch (error) {
    console.error('Leaderboard fetch error:', error);
    return new Response(JSON.stringify({ error: 'Failed to fetch leaderboard' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
