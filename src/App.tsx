/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, RotateCcw, Play, CheckCircle2, Trophy, Users, Swords, Edit2, X, Check, Trash2, Shuffle, AlertCircle, HelpCircle, Info, Award, ChevronRight, UserPlus, Sparkles, ClipboardList, Sun, Moon } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Match, Round, TournamentState, MatchResult } from './types';
import { generateNextRoundPairings, calculateStandings, getTiebreakBreakdown, PlayerTiebreakBreakdown } from './lib/pairing';

const STORAGE_KEY = 'swiss-chess-tournament-v1';
const THEME_STORAGE_KEY = 'swiss-chess-theme';

export default function App() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark');
      root.setAttribute('data-theme', 'light');
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  const [state, setState] = useState<TournamentState>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) return JSON.parse(saved);
    return {
      players: [],
      rounds: [],
      currentRoundNumber: 0,
      totalRounds: 5,
    };
  });

  const [newPlayerName, setNewPlayerName] = useState('');
  const [newPlayerRating, setNewPlayerRating] = useState('1200');
  const [totalRoundsInput, setTotalRoundsInput] = useState('5');
  const [randomizeFirstRound, setRandomizeFirstRound] = useState(true);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [showBulkAdd, setShowBulkAdd] = useState(false);
  const [bulkNamesText, setBulkNamesText] = useState('');
  const [bulkDefaultRating, setBulkDefaultRating] = useState('1200');
  const [playerToDelete, setPlayerToDelete] = useState<Player | null>(null);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [selectedPlayerForTiebreak, setSelectedPlayerForTiebreak] = useState<Player | null>(null);
  const [showTiebreakRules, setShowTiebreakRules] = useState(false);
  const [editName, setEditName] = useState('');
  const [editRating, setEditRating] = useState('');
  const [activeTab, setActiveTab] = useState<'players' | 'pairings' | 'standings'>('pairings');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const addPlayer = () => {
    if (!newPlayerName.trim()) return;
    const player: Player = {
      id: crypto.randomUUID(),
      name: newPlayerName.trim(),
      initialRating: parseInt(newPlayerRating) || 1200,
      score: 0,
      buchholz: 0,
      colorHistory: [],
      opponents: [],
      byeCount: 0,
    };
    setState(prev => ({
      ...prev,
      players: [...prev.players, player],
    }));
    setNewPlayerName('');
  };

  const parsedBulkNames = useMemo(() => {
    if (!bulkNamesText.trim()) return [];
    const lines = bulkNamesText.includes('\n') 
      ? bulkNamesText.split('\n') 
      : bulkNamesText.split(/[,;\n]/);
    
    const results: string[] = [];
    for (const line of lines) {
      const parts = line.split(/[,;]/);
      for (const part of parts) {
        let cleaned = part
          .trim()
          .replace(/^(\d+[\.\)\-\:]\s*|[\*\-\•]\s*|\[\d+\]\s*)/, '')
          .trim();
        cleaned = cleaned.replace(/\s*\(\d+\)$/, '').replace(/\s+-\s+\d+$/, '').trim();
        if (cleaned.length > 0) {
          results.push(cleaned);
        }
      }
    }
    return results;
  }, [bulkNamesText]);

  const handleAddBulkPlayers = () => {
    if (parsedBulkNames.length === 0) return;
    const rating = parseInt(bulkDefaultRating) || 1200;
    const newPlayers: Player[] = parsedBulkNames.map(name => ({
      id: crypto.randomUUID(),
      name,
      initialRating: rating,
      score: 0,
      buchholz: 0,
      colorHistory: [],
      opponents: [],
      byeCount: 0,
    }));

    setState(prev => ({
      ...prev,
      players: [...prev.players, ...newPlayers],
    }));

    setBulkNamesText('');
    setShowBulkAdd(false);
  };

  const confirmDeletePlayer = (player: Player) => {
    if (state.currentRoundNumber === 0) {
      // Tournament hasn't started yet: delete completely from roster
      setState(prev => ({
        ...prev,
        players: prev.players.filter(p => p.id !== player.id),
      }));
    } else {
      // Tournament is in progress: mark player as withdrawn so future rounds don't pair them,
      // and award a forfeit win to their opponent in any uncompleted match this round
      setState(prev => {
        const updatedPlayers = prev.players.map(p => 
          p.id === player.id ? { ...p, isWithdrawn: true } : p
        );

        let updatedRounds = prev.rounds;
        const currentR = prev.rounds[prev.rounds.length - 1];
        if (currentR && !currentR.isCompleted) {
          const newMatches = currentR.matches.map(m => {
            if (m.result !== null) return m;
            if (m.whitePlayerId === player.id) {
              return { ...m, result: '0-1' as MatchResult };
            }
            if (m.blackPlayerId === player.id) {
              return { ...m, result: '1-0' as MatchResult };
            }
            return m;
          });
          updatedRounds = [...prev.rounds];
          updatedRounds[updatedRounds.length - 1] = {
            ...currentR,
            matches: newMatches,
          };
        }

        return {
          ...prev,
          players: updatedPlayers,
          rounds: updatedRounds,
        };
      });
    }
    setPlayerToDelete(null);
  };

  const updatePlayer = () => {
    if (!editingPlayer || !editName.trim()) return;
    setState(prev => ({
      ...prev,
      players: prev.players.map(p => 
        p.id === editingPlayer.id 
          ? { ...p, name: editName.trim(), initialRating: parseInt(editRating) || 1200 } 
          : p
      )
    }));
    setEditingPlayer(null);
  };

  const startTournament = () => {
    const activePlayers = state.players.filter(p => !p.isWithdrawn);
    if (activePlayers.length < 2) return;
    const rounds = parseInt(totalRoundsInput) || 5;
    const firstRoundPairings = generateNextRoundPairings(state.players, [], { randomizeFirstRound });
    const firstRound: Round = {
      number: 1,
      matches: firstRoundPairings,
      isCompleted: false,
      isRandomPaired: randomizeFirstRound,
    };
    setState(prev => ({
      ...prev,
      rounds: [firstRound],
      currentRoundNumber: 1,
      totalRounds: rounds,
    }));
  };

  const reshuffleRound1 = () => {
    if (state.currentRoundNumber !== 1) return;
    const currentR = state.rounds[0];
    if (!currentR || currentR.isCompleted) return;
    const newPairings = generateNextRoundPairings(state.players, [], { randomizeFirstRound: true });
    setState(prev => {
      const newRounds = [...prev.rounds];
      newRounds[0] = {
        ...newRounds[0],
        matches: newPairings,
        isRandomPaired: true,
      };
      return { ...prev, rounds: newRounds };
    });
  };

  const updateMatchResult = (roundIndex: number, matchId: string, result: MatchResult) => {
    setState(prev => {
      const newRounds = [...prev.rounds];
      const round = { ...newRounds[roundIndex] };
      round.matches = round.matches.map(m => 
        m.id === matchId ? { ...m, result } : m
      );
      newRounds[roundIndex] = round;
      return { ...prev, rounds: newRounds };
    });
  };

  const generateNextRound = () => {
    const currentRound = state.rounds[state.rounds.length - 1];
    if (!currentRound || !currentRound.matches.every(m => m.result !== null)) return;

    // 1. Update player stats from the completed round
    const updatedPlayers = [...state.players];
    currentRound.matches.forEach(match => {
      const white = updatedPlayers.find(p => p.id === match.whitePlayerId);
      const black = match.blackPlayerId === 'BYE' ? null : updatedPlayers.find(p => p.id === match.blackPlayerId);

      if (match.blackPlayerId === 'BYE') {
        if (white) {
          white.score += 1;
          white.byeCount += 1;
        }
      } else if (black && white) {
        white.opponents.push(black.id);
        black.opponents.push(white.id);
        white.colorHistory.push('W');
        black.colorHistory.push('B');

        if (match.result === '1-0') white.score += 1;
        else if (match.result === '0-1') black.score += 1;
        else if (match.result === '0.5-0.5') {
          white.score += 0.5;
          black.score += 0.5;
        }
      }
    });

    // 2. Mark current round as completed
    const newRounds = [...state.rounds];
    newRounds[newRounds.length - 1] = { ...currentRound, isCompleted: true };

    // 3. Decide whether to generate next round or finish
    if (state.currentRoundNumber < state.totalRounds) {
      const nextPairings = generateNextRoundPairings(updatedPlayers, newRounds);
      const nextRound: Round = {
        number: state.currentRoundNumber + 1,
        matches: nextPairings,
        isCompleted: false,
      };

      setState(prev => ({
        ...prev,
        players: updatedPlayers,
        rounds: [...newRounds, nextRound],
        currentRoundNumber: prev.currentRoundNumber + 1,
      }));
    } else {
      // Last round completed, just update players and rounds
      setState(prev => ({
        ...prev,
        players: updatedPlayers,
        rounds: newRounds,
      }));
    }
  };

  const resetTournament = () => {
    setState({
      players: [],
      rounds: [],
      currentRoundNumber: 0,
      totalRounds: 5,
    });
    setShowResetConfirm(false);
  };

  const standings = useMemo(() => calculateStandings(state.players, state.rounds), [state.players, state.rounds]);
  const selectedTiebreakDetails = useMemo(() => 
    selectedPlayerForTiebreak ? getTiebreakBreakdown(selectedPlayerForTiebreak, state.players, state.rounds) : null,
    [selectedPlayerForTiebreak, state.players, state.rounds]
  );
  const currentRound = state.rounds[state.rounds.length - 1];
  const allResultsSubmitted = currentRound?.matches.every(m => m.result !== null);
  const isTournamentFinished = state.rounds.length > 0 && 
                               state.rounds.length === state.totalRounds && 
                               state.rounds[state.rounds.length - 1].isCompleted;

  const activePlayersCount = state.players.filter(p => !p.isWithdrawn).length;

  return (
    <div className="flex flex-col min-h-screen lg:h-screen lg:overflow-hidden relative bg-[var(--bg-main)]">
      <AnimatePresence>
        {editingPlayer && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[var(--bg-card)] text-[var(--ink-primary)] rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-[var(--border)]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black uppercase tracking-tighter">Edit Player</h3>
                <button onClick={() => setEditingPlayer(null)} className="text-[var(--ink-secondary)] hover:text-[var(--ink-primary)]">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-[10px] uppercase font-black text-[var(--ink-secondary)] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    className="w-full p-3 border border-[var(--border)] rounded-lg bg-[var(--bg-input)] text-[var(--ink-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-none font-bold"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-[var(--ink-secondary)] mb-1.5">Initial Rating</label>
                  <input
                    type="number"
                    className="w-full p-3 border border-[var(--border)] rounded-lg bg-[var(--bg-input)] text-[var(--ink-primary)] focus:ring-2 focus:ring-[var(--accent)] outline-none font-bold"
                    value={editRating}
                    onChange={e => setEditRating(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => {
                    const p = editingPlayer;
                    setEditingPlayer(null);
                    setPlayerToDelete(p);
                  }}
                  className="px-3 py-3 rounded-lg font-bold text-sm text-red-500 border border-red-500/30 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-1.5"
                  title="Delete Player"
                >
                  <Trash2 size={16} /> Delete
                </button>
                <button 
                  onClick={() => setEditingPlayer(null)}
                  className="flex-1 px-4 py-3 rounded-lg font-bold text-sm border border-[var(--border)] hover:bg-[var(--bg-muted)] text-[var(--ink-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={updatePlayer}
                  className="flex-1 px-4 py-3 rounded-lg font-bold text-sm bg-[var(--accent)] text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                >
                  <Check size={16} /> Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Player Confirmation Modal */}
      <AnimatePresence>
        {playerToDelete && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[var(--bg-card)] text-[var(--ink-primary)] rounded-xl shadow-2xl p-7 max-w-sm w-full text-center border border-[var(--border)]"
            >
              <div className="w-14 h-14 bg-red-500/15 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <Trash2 size={28} />
              </div>
              <h3 className="text-xl font-bold mb-2">
                {state.currentRoundNumber === 0 ? 'Delete Player?' : 'Withdraw Player?'}
              </h3>
              <p className="text-sm text-[var(--ink-secondary)] mb-6">
                {state.currentRoundNumber === 0 
                  ? `Are you sure you want to remove "${playerToDelete.name}" from the tournament?`
                  : `Remove "${playerToDelete.name}" from ongoing matches? They will be marked as withdrawn and skipped in subsequent rounds.`}
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setPlayerToDelete(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold border border-[var(--border)] rounded-md hover:bg-[var(--bg-muted)] text-[var(--ink-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={() => confirmDeletePlayer(playerToDelete)}
                  className="flex-1 px-4 py-2.5 text-sm font-bold bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors flex items-center justify-center gap-1.5"
                >
                  <Trash2 size={16} />
                  {state.currentRoundNumber === 0 ? 'Delete' : 'Withdraw'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reset Confirmation Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="bg-[var(--bg-card)] text-[var(--ink-primary)] rounded-xl shadow-2xl p-8 max-w-sm w-full text-center border border-[var(--border)]"
            >
              <div className="w-16 h-16 bg-red-500/15 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4">
                <RotateCcw size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Reset Tournament?</h3>
              <p className="text-sm text-[var(--ink-secondary)] mb-6">
                This will permanently delete all players, rounds, and results. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-bold border border-[var(--border)] rounded-md hover:bg-[var(--bg-muted)] text-[var(--ink-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={resetTournament}
                  className="flex-1 px-4 py-2 text-sm font-bold bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
                >
                  Reset All
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tiebreak Rules Explanation Modal */}
      <AnimatePresence>
        {showTiebreakRules && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] text-[var(--ink-primary)] rounded-2xl shadow-2xl p-6 max-w-md w-full border border-[var(--border)] my-auto max-h-[85vh] flex flex-col"
            >
              <div className="flex justify-between items-center pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-amber-500/15 text-amber-500 flex items-center justify-center">
                    <Trophy size={18} />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight">FIDE Tiebreak System</h3>
                    <p className="text-[10px] text-[var(--ink-secondary)]">Official Swiss Tournament Tiebreak Hierarchy</p>
                  </div>
                </div>
                <button 
                  onClick={() => setShowTiebreakRules(false)}
                  className="p-1 rounded-md text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto my-4 space-y-2.5 pr-1 text-xs">
                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm text-[var(--accent)]">1. Points (Score)</span>
                    <span className="text-[9px] uppercase font-bold text-white bg-[var(--accent)] px-1.5 py-0.5 rounded">Primary</span>
                  </div>
                  <p className="text-[var(--ink-secondary)] text-[11px] leading-relaxed">
                    Total match score (1.0 for win, 0.5 for draw, 0.0 for loss).
                  </p>
                </div>

                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
                  <div className="font-black text-sm text-[var(--ink-primary)] mb-1">2. Direct Encounter (Head-to-Head)</div>
                  <p className="text-[var(--ink-secondary)] text-[11px] leading-relaxed">
                    If players tied on points played each other, their mutual game result takes precedence.
                  </p>
                </div>

                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-black text-sm text-[var(--ink-primary)]">3. Buchholz Cut-1 (BH-1)</span>
                    <span className="text-[9px] uppercase font-bold text-blue-500 bg-blue-500/15 px-1.5 py-0.5 rounded">FIDE Standard</span>
                  </div>
                  <p className="text-[var(--ink-secondary)] text-[11px] leading-relaxed">
                    Sum of opponents' final scores, discarding the single lowest-scoring opponent to filter out outlier rounds.
                  </p>
                </div>

                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
                  <div className="font-black text-sm text-[var(--ink-primary)] mb-1">4. Full Buchholz (BH)</div>
                  <p className="text-[var(--ink-secondary)] text-[11px] leading-relaxed">
                    The total sum of all opponents' scores, representing comprehensive strength of schedule.
                  </p>
                </div>

                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
                  <div className="font-black text-sm text-[var(--ink-primary)] mb-1">5. Sonneborn-Berger (SB)</div>
                  <p className="text-[var(--ink-secondary)] text-[11px] leading-relaxed">
                    Sum of defeated opponents' scores plus 50% of drawn opponents' scores. Directly rewards beating higher-scoring rivals.
                  </p>
                </div>

                <div className="p-3 bg-[var(--bg-surface)] border border-[var(--border)] rounded-xl">
                  <div className="font-black text-sm text-[var(--ink-primary)] mb-1">6. Most Wins (W) & Games with Black (B)</div>
                  <p className="text-[var(--ink-secondary)] text-[11px] leading-relaxed">
                    Rewards fighting chess with more outright wins. If still equal, having played more games as Black pieces gives priority, followed by starting rating.
                  </p>
                </div>
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex justify-end">
                <button
                  onClick={() => setShowTiebreakRules(false)}
                  className="px-5 py-2 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:opacity-90 transition-opacity"
                >
                  Got It
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Player Tiebreak Detailed Breakdown Modal */}
      <AnimatePresence>
        {selectedPlayerForTiebreak && selectedTiebreakDetails && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] text-[var(--ink-primary)] rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-[var(--border)] my-auto max-h-[90vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex justify-between items-start pb-3 border-b border-[var(--border)]">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-black uppercase tracking-tight text-[var(--ink-primary)]">
                      {selectedPlayerForTiebreak.name}
                    </h3>
                    {selectedPlayerForTiebreak.isWithdrawn && (
                      <span className="text-[9px] font-black uppercase bg-orange-500/15 text-orange-500 px-1.5 py-0.5 rounded">
                        Withdrawn
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--ink-secondary)] font-medium mt-0.5">
                    Rating: {selectedPlayerForTiebreak.initialRating} • Score: <strong className="text-[var(--accent)]">{selectedPlayerForTiebreak.score} Pts</strong>
                  </p>
                </div>
                <button 
                  onClick={() => setSelectedPlayerForTiebreak(null)}
                  className="p-1 rounded-md text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              {/* Metrics Grid */}
              <div className="grid grid-cols-3 gap-2 my-3">
                <div className="bg-[var(--accent)]/10 border border-[var(--accent)]/30 p-2.5 rounded-xl text-center">
                  <span className="block text-[9px] uppercase font-black text-[var(--accent)]">BH Cut-1</span>
                  <span className="text-lg font-black text-[var(--ink-primary)]">{selectedTiebreakDetails.buchholzCut1}</span>
                  <span className="block text-[8px] text-[var(--ink-secondary)]">Lowest opp dropped</span>
                </div>
                <div className="bg-[var(--bg-surface)] border border-[var(--border)] p-2.5 rounded-xl text-center">
                  <span className="block text-[9px] uppercase font-black text-[var(--ink-secondary)]">Full Buchholz</span>
                  <span className="text-lg font-black text-[var(--ink-primary)]">{selectedTiebreakDetails.buchholz}</span>
                  <span className="block text-[8px] text-[var(--ink-secondary)]">All opp scores</span>
                </div>
                <div className="bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-center">
                  <span className="block text-[9px] uppercase font-black text-amber-500">Sonneborn-B.</span>
                  <span className="text-lg font-black text-[var(--ink-primary)]">{selectedTiebreakDetails.sonnebornBerger}</span>
                  <span className="block text-[8px] text-[var(--ink-secondary)]">Wins + ½ Draws</span>
                </div>
              </div>

              {/* Extra details */}
              <div className="flex gap-2 mb-3 text-[10px] font-bold">
                <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg flex justify-between items-center">
                  <span className="text-[var(--ink-secondary)]">Decisive Wins (W):</span>
                  <span className="font-black text-[var(--ink-primary)]">{selectedTiebreakDetails.wins}</span>
                </div>
                <div className="flex-1 bg-[var(--bg-surface)] border border-[var(--border)] px-3 py-1.5 rounded-lg flex justify-between items-center">
                  <span className="text-[var(--ink-secondary)]">Games as Black (B):</span>
                  <span className="font-black text-[var(--ink-primary)]">{selectedTiebreakDetails.blackGames}</span>
                </div>
              </div>

              {/* Direct Encounter if any */}
              {selectedTiebreakDetails.headToHeadNotes.length > 0 && (
                <div className="mb-3 bg-blue-500/10 border border-blue-500/30 p-2.5 rounded-xl">
                  <div className="text-[10px] font-black uppercase tracking-wider text-blue-400 mb-1 flex items-center gap-1.5">
                    <Swords size={12} /> Direct Encounter (vs Tied Rivals)
                  </div>
                  <div className="space-y-1">
                    {selectedTiebreakDetails.headToHeadNotes.map((note, idx) => (
                      <div key={idx} className="text-xs text-blue-300 font-medium">
                        • {note}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Opponent list with Cut-1 and SB formulas */}
              <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--border)] rounded-xl">
                <div className="bg-[var(--bg-muted)] p-2 border-b border-[var(--border)] flex justify-between items-center text-[9px] font-black uppercase text-[var(--ink-secondary)]">
                  <span>Opponent</span>
                  <span>Result</span>
                  <span>Opp Pts (BH)</span>
                  <span>SB Pts</span>
                </div>
                <div className="divide-y divide-[var(--border)]">
                  {selectedTiebreakDetails.opponents.map((opp, idx) => (
                    <div key={idx} className={`p-2.5 flex items-center justify-between text-xs ${opp.isCut ? 'bg-red-500/10' : ''}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`w-3.5 h-3.5 rounded border border-[var(--border)] text-[8px] flex items-center justify-center font-bold shrink-0 ${opp.color === 'W' ? 'bg-[var(--chess-white)] text-black' : 'bg-[var(--chess-black)] text-white'}`}>
                          {opp.color}
                        </span>
                        <span className="font-bold truncate max-w-[130px]">{opp.name}</span>
                      </div>
                      <div className="flex items-center gap-3 text-right shrink-0">
                        <span className="font-medium text-[10px] text-[var(--ink-secondary)]">
                          {opp.result} {opp.playerOutcome === 'W' ? '✓ Win' : opp.playerOutcome === 'D' ? '½ Draw' : opp.playerOutcome === 'L' ? '✗ Loss' : ''}
                        </span>
                        <span className={`font-mono text-xs ${opp.isCut ? 'line-through text-red-500 font-bold' : 'font-bold'}`}>
                          {opp.score} pts {opp.isCut && <span className="text-[8px] font-normal no-underline block text-red-400">(Cut)</span>}
                        </span>
                        <span className="font-mono text-xs font-bold text-amber-500 min-w-[36px]">
                          +{opp.sbContribution}
                        </span>
                      </div>
                    </div>
                  ))}
                  {selectedTiebreakDetails.opponents.length === 0 && (
                    <div className="p-6 text-center text-xs text-[var(--ink-secondary)] italic">
                      No completed matches yet.
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 mt-3 border-t border-[var(--border)] flex justify-end">
                <button
                  onClick={() => setSelectedPlayerForTiebreak(null)}
                  className="px-5 py-2 rounded-lg bg-[var(--accent)] text-white font-bold text-xs hover:opacity-90 transition-opacity"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bulk Add Players Modal */}
      <AnimatePresence>
        {showBulkAdd && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 overflow-y-auto"
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[var(--bg-card)] text-[var(--ink-primary)] rounded-2xl shadow-2xl p-6 max-w-lg w-full border border-[var(--border)] my-auto max-h-[90vh] flex flex-col"
            >
              <div className="flex justify-between items-start pb-3 border-b border-[var(--border)]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center shrink-0">
                    <UserPlus size={20} />
                  </div>
                  <div>
                    <h3 className="text-base font-black uppercase tracking-tight">Add Multiple Players</h3>
                    <p className="text-[11px] text-[var(--ink-secondary)]">Paste a list of names. ELO / rating is not required!</p>
                  </div>
                </div>
                <button 
                  onClick={() => {
                    setShowBulkAdd(false);
                    setBulkNamesText('');
                  }}
                  className="p-1 rounded-md text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] transition-colors"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="my-4 flex-1 flex flex-col min-h-0 space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <label className="text-[10px] uppercase font-black text-[var(--ink-secondary)] tracking-wider">
                    Paste Names List
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setBulkNamesText(`Magnus Carlsen\nHikaru Nakamura\nFabiano Caruana\nAlireza Firouzja\nIan Nepomniachtchi\nDing Liren\nGukesh D\nNodirbek Abdusattorov`)}
                      className="text-[10px] text-[var(--accent)] hover:underline font-bold flex items-center gap-1"
                    >
                      <Sparkles size={11} /> Load Sample Names
                    </button>
                    {bulkNamesText && (
                      <button
                        type="button"
                        onClick={() => setBulkNamesText('')}
                        className="text-[10px] text-[var(--ink-secondary)] hover:text-red-500 font-bold"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>

                <textarea
                  rows={8}
                  className="w-full p-3 text-xs border border-[var(--border)] rounded-xl bg-[var(--bg-input)] text-[var(--ink-primary)] focus:bg-[var(--bg-surface)] focus:ring-2 focus:ring-[var(--accent)] outline-none font-medium leading-relaxed resize-none"
                  placeholder={`Paste player names here (one per line or separated by commas)...\n\nSupported formats:\n• One name per line\n• Numbered lists (1. Alice, 2. Bob)\n• Comma-separated (Alice, Bob, Charlie)\n• Excel/Sheets copied columns`}
                  value={bulkNamesText}
                  onChange={e => setBulkNamesText(e.target.value)}
                  autoFocus
                />

                {/* Real-time Preview Counter & Optional Starting ELO */}
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-[11px] text-[var(--ink-primary)] flex items-center gap-1.5">
                    <Users size={13} className="text-[var(--accent)]" />
                    {parsedBulkNames.length} {parsedBulkNames.length === 1 ? 'player' : 'players'} ready to add
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-[var(--ink-secondary)]">Starting ELO:</span>
                    <input
                      type="number"
                      value={bulkDefaultRating}
                      onChange={e => setBulkDefaultRating(e.target.value)}
                      className="w-16 p-1 text-center text-xs font-bold border border-[var(--border)] rounded bg-[var(--bg-input)] text-[var(--ink-primary)]"
                      title="Default ELO for all players (defaults to 1200)"
                    />
                  </div>
                </div>

                {parsedBulkNames.length > 0 && (
                  <div className="max-h-28 overflow-y-auto p-2 bg-[var(--bg-muted)] border border-[var(--border)] rounded-xl flex flex-wrap gap-1.5">
                    {parsedBulkNames.map((name, i) => (
                      <span 
                        key={i} 
                        className="inline-flex items-center gap-1 text-[11px] font-bold bg-[var(--bg-card)] text-[var(--ink-primary)] px-2 py-0.5 rounded-md border border-[var(--border)] shadow-xs"
                      >
                        <span className="text-[9px] text-[var(--ink-secondary)] font-mono">{i + 1}.</span> {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[var(--border)] flex gap-2.5">
                <button 
                  onClick={() => {
                    setShowBulkAdd(false);
                    setBulkNamesText('');
                  }}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-xs border border-[var(--border)] hover:bg-[var(--bg-muted)] text-[var(--ink-primary)] transition-colors"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleAddBulkPlayers}
                  disabled={parsedBulkNames.length === 0}
                  className="flex-1 px-4 py-2.5 rounded-lg font-bold text-xs bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-sm"
                >
                  <UserPlus size={15} /> Add {parsedBulkNames.length > 0 ? `${parsedBulkNames.length} Players` : 'Players'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="h-16 bg-[#16181f] text-white flex items-center justify-between px-4 lg:px-8 border-b-4 border-[var(--accent)] shrink-0 z-30">
        <div className="flex items-center gap-2 font-extrabold text-lg lg:text-xl tracking-tighter uppercase">
          ENSA-M SWISS<span className="text-[var(--accent)]">MASTER</span>
        </div>
        {state.currentRoundNumber > 0 && (
          <div className="hidden sm:block text-[10px] lg:text-sm uppercase tracking-widest bg-white/10 px-3 py-1 rounded">
            Round {state.currentRoundNumber} / {state.totalRounds}
          </div>
        )}
        <div className="flex items-center gap-2.5">
          <div className="hidden md:block text-[10px] lg:text-sm opacity-80 font-medium truncate">Tournament Manager</div>
          <button
            onClick={toggleTheme}
            className="p-2 px-2.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-all flex items-center gap-1.5 cursor-pointer text-xs font-semibold"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          >
            {theme === 'dark' ? (
              <>
                <Sun size={15} className="text-amber-400" />
                <span className="hidden sm:inline text-[11px] font-medium text-amber-200">Light</span>
              </>
            ) : (
              <>
                <Moon size={15} className="text-blue-200" />
                <span className="hidden sm:inline text-[11px] font-medium text-blue-100">Dark</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Mobile Tab Navigation */}
      <nav className="lg:hidden flex bg-[var(--bg-card)] border-b border-[var(--border)] sticky top-0 z-20">
        {(['players', 'pairings', 'standings'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-3 text-[10px] font-black uppercase tracking-widest transition-all border-b-2 ${
              activeTab === tab 
                ? 'border-[var(--accent)] text-[var(--accent)] bg-[var(--accent)]/[0.02]' 
                : 'border-transparent text-[var(--ink-secondary)]'
            }`}
          >
            {tab}
          </button>
        ))}
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-[250px_1fr_330px] gap-[1px] bg-[var(--border)] overflow-hidden">
        {/* Left Column: Players */}
        <section className={`bg-[var(--bg-card)] flex flex-col overflow-hidden ${activeTab === 'players' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-3.5 border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <h2 className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)] font-bold flex items-center gap-2">
              <Users size={12} /> Players ({state.players.length})
            </h2>
            {!isTournamentFinished && (
              <button
                onClick={() => setShowBulkAdd(true)}
                className="flex items-center gap-1.5 text-[10px] font-black text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 px-2.5 py-1 rounded transition-colors"
                title="Paste a list of names to add multiple players at once"
              >
                <UserPlus size={12} /> Bulk Add
              </button>
            )}
          </div>
          
          {!isTournamentFinished && (
            <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-main)]/50">
              {state.currentRoundNumber > 0 && (
                <div className="mb-2 text-[8px] uppercase font-black text-[var(--accent)] bg-[var(--accent)]/10 px-2 py-1 rounded inline-block">
                  Late Registration Active
                </div>
              )}
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Player Name"
                  className="w-full p-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-input)] text-[var(--ink-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  value={newPlayerName}
                  onChange={e => setNewPlayerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPlayer()}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Rating"
                    className="flex-1 p-2 text-sm border border-[var(--border)] rounded bg-[var(--bg-input)] text-[var(--ink-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    value={newPlayerRating}
                    onChange={e => setNewPlayerRating(e.target.value)}
                  />
                  <button
                    onClick={addPlayer}
                    className="bg-[var(--accent)] text-white p-2 rounded hover:opacity-90 transition-opacity"
                    title="Add Single Player"
                  >
                    <Plus size={18} />
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setShowBulkAdd(true)}
                  className="text-[10px] text-[var(--accent)] hover:underline font-bold text-center mt-0.5 flex items-center justify-center gap-1"
                >
                  <ClipboardList size={11} /> Or paste multiple names at once →
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4">
            {state.players.map(player => (
              <div key={player.id} className="py-3 border-b border-[var(--border)] flex justify-between items-center last:border-0 gap-2">
                <div className="flex flex-col min-w-0 pr-1">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`text-sm font-bold truncate ${player.isWithdrawn ? 'line-through opacity-60' : ''}`}>
                      {player.name}
                    </span>
                    {player.isWithdrawn && (
                      <span className="text-[8px] font-black uppercase tracking-wider bg-orange-500/15 text-orange-500 px-1.5 py-0.5 rounded shrink-0">
                        Withdrawn
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-[var(--ink-secondary)] tabular-nums font-medium">
                    Rating: {player.initialRating} {player.score > 0 ? `• ${player.score} pts` : ''}
                  </span>
                </div>
                {!isTournamentFinished && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button 
                      onClick={() => {
                        setEditingPlayer(player);
                        setEditName(player.name);
                        setEditRating(player.initialRating.toString());
                      }}
                      className="p-1.5 text-[var(--ink-secondary)] hover:text-[var(--ink-primary)] hover:bg-[var(--bg-muted)] rounded-md transition-colors"
                      title="Edit Player"
                      aria-label={`Edit ${player.name}`}
                    >
                      <Edit2 size={14} />
                    </button>
                    {!player.isWithdrawn && (
                      <button 
                        onClick={() => setPlayerToDelete(player)}
                        className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-500/10 rounded-md transition-colors"
                        title={state.currentRoundNumber === 0 ? "Delete Player" : "Withdraw / Remove Player"}
                        aria-label={`Delete ${player.name}`}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
            {state.players.length === 0 && (
              <div className="py-10 px-4 text-center flex flex-col items-center justify-center">
                <div className="w-10 h-10 rounded-full bg-[var(--bg-main)] text-[var(--ink-secondary)] flex items-center justify-center mb-3">
                  <Users size={20} />
                </div>
                <p className="text-xs font-bold text-[var(--ink-primary)] mb-1">No players added yet</p>
                <p className="text-[10px] text-[var(--ink-secondary)] mb-4 max-w-[190px] leading-relaxed">
                  Add players individually or paste all names at once. ELO is not required!
                </p>
                {!isTournamentFinished && (
                  <button
                    onClick={() => setShowBulkAdd(true)}
                    className="flex items-center gap-1.5 text-xs font-bold bg-[var(--accent)] text-white px-3.5 py-2 rounded-lg hover:opacity-90 transition-opacity shadow-sm"
                  >
                    <UserPlus size={14} /> Paste Multiple Names
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Center Column: Pairings */}
        <section className={`bg-[var(--bg-surface)] flex flex-col overflow-hidden ${activeTab === 'pairings' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <h2 className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)] font-bold flex items-center gap-2">
              <Swords size={12} /> {isTournamentFinished ? 'Final Results' : 'Current Pairings'}
            </h2>
            {state.currentRoundNumber > 0 && !isTournamentFinished && (
              <span className="text-[10px] text-[var(--ink-secondary)] italic">Enter results below</span>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6 pairing-grid space-y-8">
            {state.currentRoundNumber === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8">
                <div className="w-16 h-16 bg-[var(--bg-main)] rounded-full flex items-center justify-center mb-4 text-[var(--ink-secondary)]">
                  <Users size={32} />
                </div>
                <h3 className="text-lg font-bold mb-2">Ready to Start?</h3>
                <p className="text-sm text-[var(--ink-secondary)] mb-6 max-w-xs">
                  Add at least 2 players and select the number of rounds to begin.
                </p>
                
                <div className="mb-4 w-full max-w-[220px]">
                  <label className="block text-[10px] uppercase font-bold text-[var(--ink-secondary)] mb-2">Number of Rounds</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="w-full p-2 text-center border border-[var(--border)] rounded bg-[var(--bg-input)] text-[var(--ink-primary)] font-bold"
                    value={totalRoundsInput}
                    onChange={e => setTotalRoundsInput(e.target.value)}
                  />
                </div>

                <div className="mb-6 w-full max-w-[280px] bg-[var(--bg-card)] p-3.5 rounded-xl border border-[var(--border)] shadow-sm text-left">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={randomizeFirstRound}
                      onChange={e => setRandomizeFirstRound(e.target.checked)}
                      className="mt-1 w-4 h-4 text-[var(--accent)] rounded border-[var(--border)] focus:ring-[var(--accent)] cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-black flex items-center gap-1.5 text-[var(--ink-primary)]">
                        <Shuffle size={14} className="text-[var(--accent)]" />
                        Random Pairing (Round 1)
                      </div>
                      <p className="text-[10px] text-[var(--ink-secondary)] leading-normal mt-0.5">
                        Randomly pair players at the beginning instead of sorting by initial rating.
                      </p>
                    </div>
                  </label>
                </div>

                <div className="flex flex-col gap-2.5 w-full max-w-[220px]">
                  <button
                    onClick={startTournament}
                    disabled={activePlayersCount < 2}
                    className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed shadow-md w-full"
                  >
                    Start Tournament
                  </button>
                  {activePlayersCount < 2 && (
                    <button
                      type="button"
                      onClick={() => setShowBulkAdd(true)}
                      className="px-4 py-2.5 rounded-lg font-bold text-xs border border-[var(--border)] bg-[var(--bg-card)] text-[var(--ink-primary)] hover:bg-[var(--bg-muted)] transition-colors flex items-center justify-center gap-1.5 shadow-xs"
                    >
                      <UserPlus size={14} className="text-[var(--accent)]" /> Paste Player List
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex flex-col-reverse gap-8">
                {state.rounds.map((round, rIdx) => {
                  const isCurrent = rIdx === state.rounds.length - 1 && !isTournamentFinished;
                  
                  return (
                    <div key={round.number} className={`flex flex-col gap-3 p-4 rounded-xl transition-all ${
                      isCurrent 
                        ? 'bg-[var(--accent)]/[0.03] border-2 border-[var(--accent)]/20 ring-4 ring-[var(--accent)]/[0.02]' 
                        : 'opacity-70 grayscale-[0.5]'
                    }`}>
                      <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                        <h3 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                          isCurrent ? 'text-[var(--accent)]' : 'text-[var(--ink-secondary)]'
                        }`}>
                          Round {round.number} 
                          {isCurrent && <span className="bg-[var(--accent)] text-white px-1.5 py-0.5 rounded text-[8px] animate-pulse">ACTIVE</span>}
                          {round.isRandomPaired && (
                            <span className="bg-purple-500/15 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded text-[8px] flex items-center gap-1 font-bold">
                              <Shuffle size={10} /> RANDOMIZED
                            </span>
                          )}
                          {round.isCompleted && <span className="text-[var(--success)] flex items-center gap-1"><CheckCircle2 size={10} /> COMPLETED</span>}
                        </h3>

                        {round.number === 1 && isCurrent && round.matches.every(m => m.result === null) && (
                          <button
                            onClick={reshuffleRound1}
                            className="flex items-center gap-1.5 text-[10px] font-black text-[var(--accent)] bg-[var(--accent)]/10 hover:bg-[var(--accent)]/20 px-2.5 py-1 rounded transition-colors"
                            title="Re-randomize initial pairings"
                          >
                            <Shuffle size={12} /> Reshuffle Pairings
                          </button>
                        )}
                      </div>

                      <div className="grid gap-2">
                        {round.matches.map((match, mIdx) => {
                          const white = state.players.find(p => p.id === match.whitePlayerId);
                          const black = match.blackPlayerId === 'BYE' ? null : state.players.find(p => p.id === match.blackPlayerId);
                          const whiteName = white?.name || match.whitePlayerName || 'Unknown Player';
                          const blackName = match.blackPlayerId === 'BYE' ? 'BYE' : (black?.name || match.blackPlayerName || 'Unknown Player');

                          return (
                            <motion.div
                              initial={isCurrent ? { opacity: 0, y: 10 } : false}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: mIdx * 0.05 }}
                              key={match.id}
                              className={`bg-[var(--bg-card)] text-[var(--ink-primary)] border rounded-lg flex items-center overflow-hidden shadow-sm transition-all ${
                                isCurrent ? 'border-[var(--accent)]/40 ring-1 ring-[var(--accent)]/10' : 'border-[var(--border)]'
                              }`}
                            >
                              <div className={`w-8 h-12 flex items-center justify-center font-bold text-[10px] border-r shrink-0 ${
                                isCurrent ? 'bg-[var(--accent)]/10 border-[var(--accent)]/20 text-[var(--accent)]' : 'bg-[var(--bg-main)] border-[var(--border)]'
                              }`}>
                                {mIdx + 1}
                              </div>
                              <div className="flex-1 grid grid-cols-[1fr_30px_1fr] items-center px-4">
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-4 h-4 rounded-sm border border-[var(--border)] bg-[var(--chess-white)] shrink-0" />
                                  <span className={`text-xs truncate ${match.result === '1-0' ? 'font-black' : 'font-medium'}`}>
                                    {whiteName}
                                  </span>
                                </div>
                                <div className="text-center text-[8px] font-black text-[var(--ink-secondary)] opacity-40">VS</div>
                                <div className="flex items-center gap-2 justify-end min-w-0">
                                  <span className={`text-xs truncate text-right ${match.result === '0-1' ? 'font-black' : 'font-medium'}`}>
                                    {blackName === 'BYE' ? <span className="italic text-[var(--ink-secondary)]">BYE</span> : blackName}
                                  </span>
                                  <div className="w-4 h-4 rounded-sm border border-[var(--border)] bg-[var(--chess-black)] shrink-0" />
                                </div>
                              </div>
                              
                              {match.blackPlayerId !== 'BYE' && (
                                <div className={`flex gap-1 px-3 border-l py-2 ${isCurrent ? 'border-[var(--accent)]/20' : 'border-[var(--border)]'}`}>
                                  {isCurrent ? (
                                    (['1-0', '0.5-0.5', '0-1'] as MatchResult[]).map(res => (
                                      <button
                                        key={res}
                                        onClick={() => updateMatchResult(rIdx, match.id, res)}
                                        className={`px-2 py-1 border border-[var(--border)] rounded text-[9px] font-bold cursor-pointer transition-all ${
                                          match.result === res 
                                            ? 'bg-[var(--accent)] text-white border-[var(--accent)]' 
                                            : 'bg-[var(--bg-main)] hover:bg-[var(--border)]'
                                        }`}
                                      >
                                        {res === '0.5-0.5' ? '½-½' : res}
                                      </button>
                                    ))
                                  ) : (
                                    <div className="px-2 py-1 text-[10px] font-black bg-[var(--bg-main)] rounded border border-[var(--border)]">
                                      {match.result === '0.5-0.5' ? '½-½' : match.result}
                                    </div>
                                  )}
                                </div>
                              )}
                              {match.blackPlayerId === 'BYE' && (
                                <div className="px-3 border-l border-[var(--border)] py-2 flex items-center gap-1 text-[var(--success)] font-bold text-[9px]">
                                  <CheckCircle2 size={12} /> BYE
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {isTournamentFinished && (
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="bg-amber-500/10 border-2 border-amber-500/30 p-8 rounded-2xl text-center shadow-lg"
                  >
                    <div className="w-16 h-16 bg-amber-500/20 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trophy size={32} />
                    </div>
                    <h3 className="text-xl font-black mb-1">Tournament Complete!</h3>
                    <p className="text-xs text-amber-500/80 mb-6">Final standings have been calculated.</p>
                    <div className="bg-[var(--bg-card)] p-5 rounded-xl border border-amber-500/30 inline-flex flex-col gap-1.5 min-w-[220px] shadow-sm">
                      <span className="text-[10px] uppercase font-black tracking-widest text-amber-500">Champion</span>
                      <span className="text-xl font-black text-[var(--ink-primary)]">{standings[0]?.name}</span>
                      <div className="flex items-center justify-center gap-2 text-xs font-bold text-[var(--ink-secondary)]">
                        <span className="text-[var(--accent)] font-black">{standings[0]?.score} Pts</span>
                        <span>•</span>
                        <span>BH-1: {standings[0]?.buchholzCut1 ?? standings[0]?.buchholz}</span>
                        <span>•</span>
                        <span>SB: {standings[0]?.sonnebornBerger ?? 0}</span>
                      </div>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Standings */}
        <section className={`bg-[var(--bg-card)] flex flex-col overflow-hidden ${activeTab === 'standings' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-3.5 border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <div className="flex flex-col">
              <h2 className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)] font-bold flex items-center gap-1.5">
                <Trophy size={13} className="text-amber-500" /> Standings
              </h2>
              <span className="text-[8px] text-[var(--ink-secondary)] font-semibold">FIDE Swiss Tiebreaks</span>
            </div>
            <button
              onClick={() => setShowTiebreakRules(true)}
              className="flex items-center gap-1 text-[9px] font-bold text-[var(--accent)] hover:bg-[var(--accent)]/10 px-2 py-1 rounded transition-colors"
              title="View FIDE Tiebreak Rules"
            >
              <HelpCircle size={12} /> Rules
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-[var(--bg-card)] z-10">
                <tr className="text-[var(--ink-secondary)] uppercase text-[9px] tracking-tighter">
                  <th className="text-center p-2.5 border-b border-[var(--border)] font-bold w-7" title="Rank">RK</th>
                  <th className="text-left p-2.5 border-b border-[var(--border)] font-bold" title="Player Name">Name</th>
                  <th className="text-right p-2.5 border-b border-[var(--border)] font-black text-[var(--accent)]" title="Score (Total Points)">Pts</th>
                  <th className="text-right p-2.5 border-b border-[var(--border)] font-bold" title="Buchholz Cut-1 (lowest opponent score dropped)">BH-1</th>
                  <th className="text-right p-2.5 border-b border-[var(--border)] font-bold text-amber-500" title="Sonneborn-Berger (scores of defeated + 50% drawn)">SB</th>
                  <th className="text-right p-2.5 border-b border-[var(--border)] font-bold pr-3" title="Total Wins">W</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((player, idx) => (
                  <tr 
                    key={player.id} 
                    onClick={() => setSelectedPlayerForTiebreak(player)}
                    className="hover:bg-[var(--accent)]/5 cursor-pointer transition-colors group"
                    title="Click to view complete tiebreak breakdown and opponent list"
                  >
                    <td className="p-2.5 border-b border-[var(--border)] text-[var(--ink-secondary)] font-bold text-center">{idx + 1}</td>
                    <td className="p-2.5 border-b border-[var(--border)] font-bold truncate max-w-[105px]">
                      <div className="flex items-center gap-1 truncate">
                        <span className={`truncate group-hover:text-[var(--accent)] transition-colors ${player.isWithdrawn ? 'line-through opacity-60' : ''}`}>
                          {player.name}
                        </span>
                        {player.isWithdrawn && <span className="text-[7px] text-orange-500 font-bold shrink-0">(W)</span>}
                      </div>
                    </td>
                    <td className="p-2.5 border-b border-[var(--border)] font-black text-[var(--accent)] text-right tabular-nums">{player.score}</td>
                    <td className="p-2.5 border-b border-[var(--border)] font-medium text-[var(--ink-primary)] text-right tabular-nums">{player.buchholzCut1 ?? player.buchholz}</td>
                    <td className="p-2.5 border-b border-[var(--border)] font-medium text-amber-500 text-right tabular-nums">{player.sonnebornBerger ?? 0}</td>
                    <td className="p-2.5 border-b border-[var(--border)] font-medium text-[var(--ink-secondary)] text-right tabular-nums pr-3">{player.wins ?? 0}</td>
                  </tr>
                ))}
                {standings.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-8 text-center italic text-[var(--ink-secondary)]">
                      No data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="p-2.5 bg-[var(--bg-muted)] border-t border-[var(--border)] text-[9px] text-[var(--ink-secondary)] text-center flex items-center justify-center gap-1 shrink-0">
            <Info size={11} className="text-[var(--accent)]" /> Click any player to inspect tiebreak details
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="min-h-[72px] bg-[var(--bg-card)] text-[var(--ink-primary)] border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-end px-4 lg:px-8 py-4 gap-4 shrink-0 z-30">
        {state.currentRoundNumber > 0 && (
          <div className="mr-auto flex items-center gap-2 text-[10px] font-bold text-[var(--success)]">
            <div className={`w-2 h-2 rounded-full ${allResultsSubmitted ? 'bg-[var(--success)] animate-pulse' : 'bg-orange-400'}`} />
            <span className="truncate max-w-[200px]">
              {isTournamentFinished 
                ? 'Tournament Finished' 
                : allResultsSubmitted 
                  ? 'All results submitted' 
                  : `${currentRound?.matches.filter(m => m.result !== null).length} / ${currentRound?.matches.length} results`}
            </span>
          </div>
        )}
        
        <div className="flex w-full sm:w-auto gap-3">
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs lg:text-sm font-bold border border-[var(--border)] rounded-md hover:bg-[var(--bg-muted)] text-[var(--ink-primary)] transition-colors"
          >
            <RotateCcw size={14} /> Reset
          </button>

          {state.currentRoundNumber > 0 && !isTournamentFinished && (
            <button
              onClick={generateNextRound}
              disabled={!allResultsSubmitted}
              className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-6 py-2 text-xs lg:text-sm font-bold bg-[var(--accent)] text-white rounded-md hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-[var(--accent)]/20"
            >
              <Play size={14} fill="currentColor" /> 
              <span className="truncate">
                {state.currentRoundNumber === state.totalRounds ? 'Finish' : `Round ${state.currentRoundNumber + 1}`}
              </span>
            </button>
          )}
        </div>
      </footer>

      <style>{`
        .btn-primary {
          @apply bg-[var(--accent)] text-white px-6 py-3 rounded-md font-bold text-sm hover:opacity-90 transition-opacity;
        }
      `}</style>
    </div>
  );
}
