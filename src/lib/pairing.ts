/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Player, Match, Round, MatchResult } from '../types';

/**
 * Generates the next round's pairings based on Swiss System rules.
 * Uses a recursive backtracking approach to ensure all players are paired
 * with valid opponents while minimizing score gaps.
 */
export function generateNextRoundPairings(
  players: Player[],
  rounds: Round[]
): Match[] {
  const nextRoundNumber = rounds.length + 1;
  
  // 1. Prepare players for pairing
  // Sort by score (descending), then by initial rating (descending)
  let availablePlayers = [...players].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.initialRating - a.initialRating;
  });

  const matches: Match[] = [];

  // 2. Handle Bye if odd number of players
  if (availablePlayers.length % 2 !== 0) {
    // Find the lowest ranked player who hasn't had a bye
    for (let i = availablePlayers.length - 1; i >= 0; i--) {
      if (availablePlayers[i].byeCount === 0) {
        const byePlayer = availablePlayers.splice(i, 1)[0];
        matches.push({
          id: `r${nextRoundNumber}-bye`,
          whitePlayerId: byePlayer.id,
          blackPlayerId: 'BYE',
          result: '1-0',
        });
        break;
      }
    }
  }

  // 3. Backtracking Pairing Logic
  const finalPairings = backtrackPairings(availablePlayers, []);

  if (!finalPairings) {
    // Fallback: If no valid pairings found (should be extremely rare), 
    // use a simple greedy approach that ignores the "no repeat" rule as a last resort
    // to ensure the tournament can continue.
    console.warn('Backtracking failed to find valid pairings. Falling back to greedy.');
    return [...matches, ...greedyFallback(availablePlayers, nextRoundNumber)];
  }

  // 4. Convert pairings to Match objects with color allocation
  finalPairings.forEach((pair, idx) => {
    const { white, black } = allocateColors(pair[0], pair[1]);
    matches.push({
      id: `r${nextRoundNumber}-m${matches.length + 1}`,
      whitePlayerId: white.id,
      blackPlayerId: black.id,
      result: null,
    });
  });

  return matches;
}

/**
 * Recursive backtracking to find a valid set of pairings.
 */
function backtrackPairings(
  players: Player[],
  currentPairs: [Player, Player][]
): [Player, Player][] | null {
  if (players.length === 0) return currentPairs;

  const p1 = players[0];
  const candidates = players.slice(1);

  for (let i = 0; i < candidates.length; i++) {
    const p2 = candidates[i];

    // Constraint: Cannot play the same opponent twice
    if (!p1.opponents.includes(p2.id)) {
      const remaining = [...candidates];
      remaining.splice(i, 1);
      
      const result = backtrackPairings(remaining, [...currentPairs, [p1, p2]]);
      if (result) return result;
    }
  }

  return null;
}

/**
 * Fallback greedy pairing that relaxes constraints if backtracking fails.
 */
function greedyFallback(players: Player[], roundNum: number): Match[] {
  const matches: Match[] = [];
  const available = [...players];
  
  while (available.length >= 2) {
    const p1 = available.shift()!;
    const p2 = available.shift()!;
    const { white, black } = allocateColors(p1, p2);
    matches.push({
      id: `r${roundNum}-f${matches.length + 1}`,
      whitePlayerId: white.id,
      blackPlayerId: black.id,
      result: null,
    });
  }
  return matches;
}

/**
 * Determines who plays White and who plays Black based on history.
 * Implements stricter color balancing rules.
 */
function allocateColors(p1: Player, p2: Player): { white: Player; black: Player } {
  const p1Balance = getColorBalance(p1);
  const p2Balance = getColorBalance(p2);
  
  const p1LastColor = p1.colorHistory[p1.colorHistory.length - 1];
  const p2LastColor = p2.colorHistory[p2.colorHistory.length - 1];

  // Rule: Avoid 3 in a row of the same color
  const p1Streak = getColorStreak(p1);
  const p2Streak = getColorStreak(p2);

  let p1ShouldBeWhite = false;

  // 1. Check for critical streaks (2 in a row)
  if (p1Streak <= -2) p1ShouldBeWhite = true; // p1 had 2 Blacks, needs White
  else if (p1Streak >= 2) p1ShouldBeWhite = false; // p1 had 2 Whites, needs Black
  else if (p2Streak <= -2) p1ShouldBeWhite = false; // p2 needs White
  else if (p2Streak >= 2) p1ShouldBeWhite = true; // p2 needs Black
  
  // 2. Check overall balance
  else if (p1Balance < p2Balance) p1ShouldBeWhite = true;
  else if (p1Balance > p2Balance) p1ShouldBeWhite = false;
  
  // 3. Check last round color (alternation)
  else if (p1LastColor === 'B' && p2LastColor !== 'B') p1ShouldBeWhite = true;
  else if (p1LastColor !== 'B' && p2LastColor === 'B') p1ShouldBeWhite = false;
  
  // 4. Default to ID for stability
  else p1ShouldBeWhite = p1.id < p2.id;

  return p1ShouldBeWhite 
    ? { white: p1, black: p2 } 
    : { white: p2, black: p1 };
}

/**
 * Returns color balance: positive means more White, negative means more Black.
 */
function getColorBalance(player: Player): number {
  return player.colorHistory.reduce((acc, color) => acc + (color === 'W' ? 1 : -1), 0);
}

/**
 * Returns the current streak of colors. 
 * Positive for White streak, negative for Black streak.
 */
function getColorStreak(player: Player): number {
  if (player.colorHistory.length === 0) return 0;
  
  const lastColor = player.colorHistory[player.colorHistory.length - 1];
  let streak = 0;
  
  for (let i = player.colorHistory.length - 1; i >= 0; i--) {
    if (player.colorHistory[i] === lastColor) {
      streak += (lastColor === 'W' ? 1 : -1);
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Calculates Buchholz score for all players.
 * Buchholz = sum of scores of all opponents.
 */
export function calculateStandings(players: Player[]): Player[] {
  const playerMap = new Map(players.map(p => [p.id, p]));

  return players.map(player => {
    const buchholz = player.opponents.reduce((sum, oppId) => {
      const opponent = playerMap.get(oppId);
      return sum + (opponent ? opponent.score : 0);
    }, 0);

    return { ...player, buchholz };
  }).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
    return b.initialRating - a.initialRating;
  });
}
