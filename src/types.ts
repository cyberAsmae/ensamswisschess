/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type MatchResult = '1-0' | '0-1' | '0.5-0.5' | null;

export interface Player {
  id: string;
  name: string;
  initialRating: number;
  score: number;
  buchholz: number;
  colorHistory: ('W' | 'B')[];
  opponents: string[]; // List of player IDs already played
  byeCount: number;
}

export interface Match {
  id: string;
  whitePlayerId: string;
  blackPlayerId: string | 'BYE';
  result: MatchResult;
}

export interface Round {
  number: number;
  matches: Match[];
  isCompleted: boolean;
}

export interface TournamentState {
  players: Player[];
  rounds: Round[];
  currentRoundNumber: number;
  totalRounds: number;
}
