/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Player, Match, Round, MatchResult } from '../types';

/**
 * Shuffles an array using the Fisher-Yates algorithm.
 */
function shuffleArray<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Generates the next round's pairings based on Swiss System rules.
 * Uses a recursive backtracking approach to ensure all players are paired
 * with valid opponents while minimizing score gaps.
 * In Round 1, supports random pairing when randomizeFirstRound is true.
 */
export function generateNextRoundPairings(
  players: Player[],
  rounds: Round[],
  options: { randomizeFirstRound?: boolean } = { randomizeFirstRound: true }
): Match[] {
  const nextRoundNumber = rounds.length + 1;
  const isFirstRound = rounds.length === 0;
  
  // 1. Prepare players for pairing (exclude withdrawn players)
  const activePlayers = players.filter(p => !p.isWithdrawn);

  let availablePlayers: Player[];
  if (isFirstRound && options.randomizeFirstRound !== false) {
    // Round 1: Pair randomly as requested
    availablePlayers = shuffleArray(activePlayers);
  } else {
    // Sort by score (descending), then by Buchholz Cut-1, Buchholz, Sonneborn-Berger, initial rating
    availablePlayers = [...activePlayers].sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const bhc1A = a.buchholzCut1 ?? a.buchholz;
      const bhc1B = b.buchholzCut1 ?? b.buchholz;
      if (bhc1B !== bhc1A) return bhc1B - bhc1A;
      if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      const sbA = a.sonnebornBerger ?? 0;
      const sbB = b.sonnebornBerger ?? 0;
      if (sbB !== sbA) return sbB - sbA;
      return b.initialRating - a.initialRating;
    });
  }

  const matches: Match[] = [];

  // 2. Handle Bye if odd number of players
  if (availablePlayers.length % 2 !== 0) {
    if (isFirstRound) {
      // For random round 1, assign the bye to a random player (e.g. pop from shuffled array)
      const byePlayer = availablePlayers.pop()!;
      matches.push({
        id: `r${nextRoundNumber}-bye`,
        whitePlayerId: byePlayer.id,
        blackPlayerId: 'BYE',
        whitePlayerName: byePlayer.name,
        blackPlayerName: 'BYE',
        result: '1-0',
      });
    } else {
      // Find the lowest ranked player who hasn't had a bye
      let byeIndex = -1;
      for (let i = availablePlayers.length - 1; i >= 0; i--) {
        if (availablePlayers[i].byeCount === 0) {
          byeIndex = i;
          break;
        }
      }
      if (byeIndex === -1) {
        byeIndex = availablePlayers.length - 1;
      }
      const byePlayer = availablePlayers.splice(byeIndex, 1)[0];
      matches.push({
        id: `r${nextRoundNumber}-bye`,
        whitePlayerId: byePlayer.id,
        blackPlayerId: 'BYE',
        whitePlayerName: byePlayer.name,
        blackPlayerName: 'BYE',
        result: '1-0',
      });
    }
  }

  // 3. Backtracking Pairing Logic
  let finalPairings: [Player, Player][] | null = null;
  
  if (isFirstRound && options.randomizeFirstRound !== false) {
    // In random first round, sequential pairing of the shuffled array is completely random
    // and guaranteed valid since no one has played each other yet
    finalPairings = [];
    for (let i = 0; i < availablePlayers.length; i += 2) {
      if (i + 1 < availablePlayers.length) {
        finalPairings.push([availablePlayers[i], availablePlayers[i + 1]]);
      }
    }
  } else {
    finalPairings = backtrackPairings(availablePlayers, []);
  }

  if (!finalPairings) {
    // Fallback: If no valid pairings found (should be extremely rare), 
    // use a simple greedy approach that ignores the "no repeat" rule as a last resort
    // to ensure the tournament can continue.
    console.warn('Backtracking failed to find valid pairings. Falling back to greedy.');
    return [...matches, ...greedyFallback(availablePlayers, nextRoundNumber, isFirstRound)];
  }

  // 4. Convert pairings to Match objects with color allocation
  finalPairings.forEach((pair) => {
    const { white, black } = allocateColors(pair[0], pair[1], isFirstRound);
    matches.push({
      id: `r${nextRoundNumber}-m${matches.length + 1}`,
      whitePlayerId: white.id,
      blackPlayerId: black.id,
      whitePlayerName: white.name,
      blackPlayerName: black.name,
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
function greedyFallback(players: Player[], roundNum: number, isFirstRound: boolean = false): Match[] {
  const matches: Match[] = [];
  const available = [...players];
  
  while (available.length >= 2) {
    const p1 = available.shift()!;
    const p2 = available.shift()!;
    const { white, black } = allocateColors(p1, p2, isFirstRound);
    matches.push({
      id: `r${roundNum}-f${matches.length + 1}`,
      whitePlayerId: white.id,
      blackPlayerId: black.id,
      whitePlayerName: white.name,
      blackPlayerName: black.name,
      result: null,
    });
  }
  return matches;
}

/**
 * Determines who plays White and who plays Black based on history.
 * Implements stricter color balancing rules.
 * For the first round, randomly chooses who plays White and Black.
 */
function allocateColors(p1: Player, p2: Player, isFirstRound: boolean = false): { white: Player; black: Player } {
  // If first round, randomly allocate White vs Black (50% coin flip)
  if (isFirstRound || (p1.colorHistory.length === 0 && p2.colorHistory.length === 0)) {
    const p1IsWhite = Math.random() < 0.5;
    return p1IsWhite 
      ? { white: p1, black: p2 } 
      : { white: p2, black: p1 };
  }

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
  
  // 4. Default to random (50/50)
  else p1ShouldBeWhite = Math.random() < 0.5;

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

export interface OpponentDetail {
  id: string;
  name: string;
  score: number;
  result: '1-0' | '0-1' | '0.5-0.5' | 'BYE' | '-';
  playerOutcome: 'W' | 'L' | 'D' | 'BYE' | '-';
  color: 'W' | 'B' | '-';
  isCut: boolean; // dropped in Buchholz Cut-1
  sbContribution: number;
}

export interface PlayerTiebreakBreakdown {
  player: Player;
  score: number;
  buchholzCut1: number;
  buchholz: number;
  sonnebornBerger: number;
  wins: number;
  blackGames: number;
  opponents: OpponentDetail[];
  headToHeadNotes: string[];
}

/**
 * Calculates standings according to official FIDE Swiss System tiebreak hierarchy:
 * 1. Score (Total Points)
 * 2. Direct Encounter (Head-to-head between tied players)
 * 3. Buchholz Cut-1 (BH-1: Opponents' scores sum excluding lowest score)
 * 4. Buchholz (BH: Sum of all opponents' scores)
 * 5. Sonneborn-Berger (SB: Defeated opponents' scores + 50% drawn opponents' scores)
 * 6. Most Wins (W)
 * 7. Most games played with Black (B)
 * 8. Initial Rating
 */
export function calculateStandings(players: Player[], rounds: Round[] = []): Player[] {
  const playerMap = new Map(players.map(p => [p.id, p]));
  const allMatches: Match[] = rounds.flatMap(r => r.matches).filter(m => m.result !== null);

  // 1. Calculate tiebreak metrics for each player
  const enrichedPlayers = players.map(player => {
    const playerMatches = allMatches.filter(
      m => m.whitePlayerId === player.id || m.blackPlayerId === player.id
    );

    let wins = 0;
    let blackGames = 0;
    let sonnebornBerger = 0;
    const oppScores: number[] = [];

    if (playerMatches.length > 0) {
      playerMatches.forEach(m => {
        if (m.blackPlayerId === 'BYE') {
          wins += 1;
          return;
        }

        const isWhite = m.whitePlayerId === player.id;
        const oppId = isWhite ? m.blackPlayerId : m.whitePlayerId;
        const opp = playerMap.get(oppId);
        const oppScore = opp ? opp.score : 0;
        oppScores.push(oppScore);

        if (isWhite) {
          if (m.result === '1-0') {
            wins += 1;
            sonnebornBerger += oppScore;
          } else if (m.result === '0.5-0.5') {
            sonnebornBerger += oppScore * 0.5;
          }
        } else {
          blackGames += 1;
          if (m.result === '0-1') {
            wins += 1;
            sonnebornBerger += oppScore;
          } else if (m.result === '0.5-0.5') {
            sonnebornBerger += oppScore * 0.5;
          }
        }
      });
    } else {
      // Fallback from player.opponents if rounds not passed or empty
      player.opponents.forEach(oppId => {
        const opp = playerMap.get(oppId);
        if (opp) oppScores.push(opp.score);
      });
    }

    const buchholz = oppScores.reduce((sum, s) => sum + s, 0);
    const buchholzCut1 = oppScores.length > 1 
      ? buchholz - Math.min(...oppScores) 
      : buchholz;

    return {
      ...player,
      buchholz: Math.round(buchholz * 10) / 10,
      buchholzCut1: Math.round(buchholzCut1 * 10) / 10,
      sonnebornBerger: Math.round(sonnebornBerger * 100) / 100,
      wins,
      blackGames,
    };
  });

  // 2. Direct Encounter calculation for tied score groups
  const scoreGroups = new Map<number, Player[]>();
  enrichedPlayers.forEach(p => {
    if (!p.isWithdrawn) {
      const list = scoreGroups.get(p.score) || [];
      list.push(p);
      scoreGroups.set(p.score, list);
    }
  });

  const directEncounterMap = new Map<string, number>();

  scoreGroups.forEach(groupPlayers => {
    if (groupPlayers.length === 2) {
      const [p1, p2] = groupPlayers;
      const match = allMatches.find(
        m => (m.whitePlayerId === p1.id && m.blackPlayerId === p2.id) ||
             (m.blackPlayerId === p1.id && m.whitePlayerId === p2.id)
      );
      if (match) {
        const p1IsWhite = match.whitePlayerId === p1.id;
        if ((p1IsWhite && match.result === '1-0') || (!p1IsWhite && match.result === '0-1')) {
          directEncounterMap.set(p1.id, 1);
          directEncounterMap.set(p2.id, 0);
        } else if ((p1IsWhite && match.result === '0-1') || (!p1IsWhite && match.result === '1-0')) {
          directEncounterMap.set(p1.id, 0);
          directEncounterMap.set(p2.id, 1);
        } else {
          directEncounterMap.set(p1.id, 0.5);
          directEncounterMap.set(p2.id, 0.5);
        }
      }
    } else if (groupPlayers.length > 2) {
      // Check if all players in group have played against each other (FIDE rule)
      let allPlayed = true;
      for (let i = 0; i < groupPlayers.length; i++) {
        for (let j = i + 1; j < groupPlayers.length; j++) {
          const played = allMatches.some(
            m => (m.whitePlayerId === groupPlayers[i].id && m.blackPlayerId === groupPlayers[j].id) ||
                 (m.blackPlayerId === groupPlayers[i].id && m.whitePlayerId === groupPlayers[j].id)
          );
          if (!played) {
            allPlayed = false;
            break;
          }
        }
        if (!allPlayed) break;
      }

      if (allPlayed) {
        const groupIds = new Set(groupPlayers.map(p => p.id));
        groupPlayers.forEach(p => {
          let mutualPoints = 0;
          allMatches.forEach(m => {
            const oppId = m.whitePlayerId === p.id ? m.blackPlayerId : m.whitePlayerId;
            if (groupIds.has(oppId)) {
              const isWhite = m.whitePlayerId === p.id;
              if ((isWhite && m.result === '1-0') || (!isWhite && m.result === '0-1')) {
                mutualPoints += 1;
              } else if (m.result === '0.5-0.5') {
                mutualPoints += 0.5;
              }
            }
          });
          directEncounterMap.set(p.id, mutualPoints);
        });
      }
    }
  });

  // 3. Sort players according to official FIDE tiebreaks
  return enrichedPlayers.sort((a, b) => {
    // Active players first, withdrawn players at bottom
    if (!!a.isWithdrawn !== !!b.isWithdrawn) return a.isWithdrawn ? 1 : -1;
    
    // 1. Points
    if (b.score !== a.score) return b.score - a.score;

    // 2. Direct Encounter
    const deA = directEncounterMap.get(a.id) ?? 0;
    const deB = directEncounterMap.get(b.id) ?? 0;
    if (deB !== deA) return deB - deA;

    // 3. Buchholz Cut-1
    const bhc1A = a.buchholzCut1 ?? a.buchholz;
    const bhc1B = b.buchholzCut1 ?? b.buchholz;
    if (bhc1B !== bhc1A) return bhc1B - bhc1A;

    // 4. Full Buchholz
    if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;

    // 5. Sonneborn-Berger
    const sbA = a.sonnebornBerger ?? 0;
    const sbB = b.sonnebornBerger ?? 0;
    if (sbB !== sbA) return sbB - sbA;

    // 6. Most Wins
    const winsA = a.wins ?? 0;
    const winsB = b.wins ?? 0;
    if (winsB !== winsA) return winsB - winsA;

    // 7. Most games played with Black
    const bgA = a.blackGames ?? 0;
    const bgB = b.blackGames ?? 0;
    if (bgB !== bgA) return bgB - bgA;

    // 8. Initial Rating
    return b.initialRating - a.initialRating;
  });
}

/**
 * Returns an exhaustive step-by-step breakdown of all tiebreak calculations
 * for a specific player (used in the interactive tiebreak inspection UI).
 */
export function getTiebreakBreakdown(
  player: Player,
  allPlayers: Player[],
  rounds: Round[]
): PlayerTiebreakBreakdown {
  const playerMap = new Map(allPlayers.map(p => [p.id, p]));
  const allMatches: Match[] = rounds.flatMap(r => r.matches);

  const playerMatches = allMatches.filter(
    m => (m.whitePlayerId === player.id || m.blackPlayerId === player.id) && m.result !== null
  );

  const opponents: OpponentDetail[] = [];
  let sbTotal = 0;
  let winsTotal = 0;
  let blackGamesTotal = 0;

  playerMatches.forEach(m => {
    if (m.blackPlayerId === 'BYE') {
      winsTotal += 1;
      opponents.push({
        id: 'BYE',
        name: 'BYE',
        score: 0,
        result: 'BYE',
        playerOutcome: 'BYE',
        color: 'W',
        isCut: false,
        sbContribution: 0,
      });
      return;
    }

    const isWhite = m.whitePlayerId === player.id;
    const oppId = isWhite ? m.blackPlayerId : m.whitePlayerId;
    const opp = playerMap.get(oppId);
    const oppScore = opp ? opp.score : 0;
    const oppName = opp ? opp.name : (isWhite ? m.blackPlayerName : m.whitePlayerName) || 'Unknown Player';

    let outcome: 'W' | 'L' | 'D' = 'D';
    let sbContrib = 0;

    if (isWhite) {
      if (m.result === '1-0') {
        outcome = 'W';
        sbContrib = oppScore;
        winsTotal += 1;
      } else if (m.result === '0-1') {
        outcome = 'L';
        sbContrib = 0;
      } else {
        outcome = 'D';
        sbContrib = oppScore * 0.5;
      }
    } else {
      blackGamesTotal += 1;
      if (m.result === '0-1') {
        outcome = 'W';
        sbContrib = oppScore;
        winsTotal += 1;
      } else if (m.result === '1-0') {
        outcome = 'L';
        sbContrib = 0;
      } else {
        outcome = 'D';
        sbContrib = oppScore * 0.5;
      }
    }

    sbTotal += sbContrib;

    opponents.push({
      id: oppId,
      name: oppName,
      score: oppScore,
      result: m.result || '-',
      playerOutcome: outcome,
      color: isWhite ? 'W' : 'B',
      isCut: false,
      sbContribution: sbContrib,
    });
  });

  const realOpponents = opponents.filter(o => o.id !== 'BYE');
  const fullBuchholz = realOpponents.reduce((sum, o) => sum + o.score, 0);

  let buchholzCut1 = fullBuchholz;
  if (realOpponents.length > 1) {
    const minScore = Math.min(...realOpponents.map(o => o.score));
    let marked = false;
    opponents.forEach(o => {
      if (!marked && o.id !== 'BYE' && o.score === minScore) {
        o.isCut = true;
        marked = true;
      }
    });
    buchholzCut1 = fullBuchholz - minScore;
  }

  // Head-to-Head notes against tied rivals
  const tiedRivals = allPlayers.filter(p => p.id !== player.id && p.score === player.score && !p.isWithdrawn);
  const headToHeadNotes: string[] = [];

  tiedRivals.forEach(rival => {
    const directMatch = playerMatches.find(
      m => (m.whitePlayerId === rival.id && m.blackPlayerId === player.id) ||
           (m.blackPlayerId === rival.id && m.whitePlayerId === player.id)
    );
    if (directMatch) {
      const isWhite = directMatch.whitePlayerId === player.id;
      let outcomeStr = 'Draw (½-½)';
      if ((isWhite && directMatch.result === '1-0') || (!isWhite && directMatch.result === '0-1')) {
        outcomeStr = 'Won (1-0)';
      } else if ((isWhite && directMatch.result === '0-1') || (!isWhite && directMatch.result === '1-0')) {
        outcomeStr = 'Lost (0-1)';
      }
      headToHeadNotes.push(`${outcomeStr} vs ${rival.name}`);
    } else {
      headToHeadNotes.push(`Did not play vs ${rival.name}`);
    }
  });

  return {
    player,
    score: player.score,
    buchholzCut1: Math.round(buchholzCut1 * 10) / 10,
    buchholz: Math.round(fullBuchholz * 10) / 10,
    sonnebornBerger: Math.round(sbTotal * 100) / 100,
    wins: winsTotal,
    blackGames: blackGamesTotal,
    opponents,
    headToHeadNotes,
  };
}
