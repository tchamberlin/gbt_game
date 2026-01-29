// POST /api/submit-score - Submits a score to the leaderboard

interface Env {
  LEADERBOARD: KVNamespace;
}

interface LeaderboardEntry {
  rank: number;
  name: string;
  score: number;
  timestamp: number;
}

interface SubmitRequest {
  name: string;
  score: number;
  gameToken: string;
}

const MAX_ENTRIES = 10;
const MAX_SCORE = 10_000_000;
const TOKEN_MAX_AGE_MS = 5 * 60 * 1000; // 5 minutes

// Simple hash function matching client-side
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

// Validate game token (basic anti-cheat)
function validateToken(token: string, score: number): boolean {
  try {
    const [timestampStr, hash] = token.split(':');
    if (!timestampStr || !hash) return false;

    const timestamp = parseInt(timestampStr, 10);
    if (isNaN(timestamp)) return false;

    // Check token age (must be within last 5 minutes)
    const now = Date.now();
    if (now - timestamp > TOKEN_MAX_AGE_MS) return false;

    // We can't fully validate the hash without knowing startTime,
    // but we can check the format is reasonable
    if (hash.length < 1 || hash.length > 10) return false;

    return true;
  } catch {
    return false;
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const { env, request } = context;

  try {
    const body = await request.json() as SubmitRequest;
    const { name, score, gameToken } = body;

    // Validate name: exactly 3 uppercase letters
    if (!name || typeof name !== 'string') {
      return new Response(JSON.stringify({ success: false, error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const normalizedName = name.toUpperCase().trim();
    if (!/^[A-Z]{3}$/.test(normalizedName)) {
      return new Response(JSON.stringify({ success: false, error: 'Name must be exactly 3 letters (A-Z)' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Validate score: number between 0 and MAX_SCORE
    if (typeof score !== 'number' || !Number.isFinite(score)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid score' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const validScore = Math.floor(Math.max(0, Math.min(MAX_SCORE, score)));

    // Validate game token (basic anti-cheat)
    if (!gameToken || typeof gameToken !== 'string' || !validateToken(gameToken, validScore)) {
      return new Response(JSON.stringify({ success: false, error: 'Invalid game token' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get current leaderboard
    const data = await env.LEADERBOARD.get('scores', 'json') as LeaderboardEntry[] | null;
    const entries = data || [];

    // Create new entry
    const newEntry: LeaderboardEntry = {
      rank: 0, // Will be calculated
      name: normalizedName,
      score: validScore,
      timestamp: Date.now(),
    };

    // Add to entries and sort by score descending
    entries.push(newEntry);
    entries.sort((a, b) => b.score - a.score);

    // Update ranks and keep only top MAX_ENTRIES
    const topEntries = entries.slice(0, MAX_ENTRIES).map((entry, index) => ({
      ...entry,
      rank: index + 1,
    }));

    // Find the new entry's rank in the full sorted list (before slicing)
    const fullRank = entries.findIndex(
      (e) => e.name === newEntry.name && e.score === newEntry.score && e.timestamp === newEntry.timestamp
    );
    const finalRank = fullRank >= 0 ? fullRank + 1 : null;

    // Save updated leaderboard
    await env.LEADERBOARD.put('scores', JSON.stringify(topEntries));

    // Return the updated leaderboard with the response to avoid cache issues
    return new Response(JSON.stringify({
      success: true,
      rank: finalRank,
      leaderboard: topEntries,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Submit score error:', error);
    return new Response(JSON.stringify({ success: false, error: 'Failed to submit score' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
