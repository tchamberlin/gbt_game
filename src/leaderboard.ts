// Leaderboard API client

import type { LeaderboardEntry, SubmitResult, DifficultyMode } from './types.ts';

const API_BASE = '/api';

// Simple hash function for game token anti-cheat
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36);
}

// Generate a game token for anti-cheat (timestamp + simple hash)
export function generateGameToken(score: number, startTime: number): string {
  const now = Date.now();
  const data = `${score}:${startTime}:${now}:gbt-secret`;
  const hash = simpleHash(data);
  return `${now}:${hash}`;
}

// Fetch leaderboard (top 10) for the specified difficulty
export async function fetchLeaderboard(difficulty: DifficultyMode = 'hard'): Promise<LeaderboardEntry[]> {
  try {
    const response = await fetch(`${API_BASE}/leaderboard?difficulty=${difficulty}`);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const data = await response.json();
    return data as LeaderboardEntry[];
  } catch (error) {
    console.error('Failed to fetch leaderboard:', error);
    return [];
  }
}

// Submit score to leaderboard for the specified difficulty
export async function submitScore(
  name: string,
  score: number,
  gameToken: string,
  difficulty: DifficultyMode = 'hard'
): Promise<SubmitResult> {
  try {
    const response = await fetch(`${API_BASE}/submit-score`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name, score, gameToken, difficulty }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      return {
        success: false,
        error: errorData.error || `HTTP ${response.status}`,
      };
    }

    const data = await response.json();
    return data as SubmitResult;
  } catch (error) {
    console.error('Failed to submit score:', error);
    return {
      success: false,
      error: 'Network error',
    };
  }
}
