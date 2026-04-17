/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Plus, RotateCcw, Play, CheckCircle2, Trophy, Users, Swords, Edit2, X, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Player, Match, Round, TournamentState, MatchResult } from './types';
import { generateNextRoundPairings, calculateStandings } from './lib/pairing';

const STORAGE_KEY = 'swiss-chess-tournament-v1';

export default function App() {
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
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
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
    if (state.players.length < 2) return;
    const rounds = parseInt(totalRoundsInput) || 5;
    const firstRoundPairings = generateNextRoundPairings(state.players, []);
    const firstRound: Round = {
      number: 1,
      matches: firstRoundPairings,
      isCompleted: false,
    };
    setState(prev => ({
      ...prev,
      rounds: [firstRound],
      currentRoundNumber: 1,
      totalRounds: rounds,
    }));
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
      const white = updatedPlayers.find(p => p.id === match.whitePlayerId)!;
      const black = match.blackPlayerId === 'BYE' ? null : updatedPlayers.find(p => p.id === match.blackPlayerId)!;

      if (match.blackPlayerId === 'BYE') {
        white.score += 1;
        white.byeCount += 1;
      } else if (black) {
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

  const standings = useMemo(() => calculateStandings(state.players), [state.players]);
  const currentRound = state.rounds[state.rounds.length - 1];
  const allResultsSubmitted = currentRound?.matches.every(m => m.result !== null);
  const isTournamentFinished = state.rounds.length > 0 && 
                               state.rounds.length === state.totalRounds && 
                               state.rounds[state.rounds.length - 1].isCompleted;

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
              className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full border border-[var(--border)]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-black uppercase tracking-tighter">Edit Player</h3>
                <button onClick={() => setEditingPlayer(null)} className="text-[var(--ink-secondary)] hover:text-black">
                  <X size={20} />
                </button>
              </div>
              
              <div className="space-y-4 mb-8">
                <div>
                  <label className="block text-[10px] uppercase font-black text-[var(--ink-secondary)] mb-1.5">Full Name</label>
                  <input
                    type="text"
                    className="w-full p-3 border border-[var(--border)] rounded-lg bg-[var(--bg-main)] focus:ring-2 focus:ring-[var(--accent)] outline-none font-bold"
                    value={editName}
                    onChange={e => setEditName(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-[var(--ink-secondary)] mb-1.5">Initial Rating</label>
                  <input
                    type="number"
                    className="w-full p-3 border border-[var(--border)] rounded-lg bg-[var(--bg-main)] focus:ring-2 focus:ring-[var(--accent)] outline-none font-bold"
                    value={editRating}
                    onChange={e => setEditRating(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex gap-3">
                <button 
                  onClick={() => setEditingPlayer(null)}
                  className="flex-1 px-4 py-3 rounded-lg font-bold text-sm border border-[var(--border)] hover:bg-[var(--bg-main)] transition-colors"
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
              className="bg-white rounded-xl shadow-2xl p-8 max-w-sm w-full text-center"
            >
              <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <RotateCcw size={32} />
              </div>
              <h3 className="text-xl font-bold mb-2">Reset Tournament?</h3>
              <p className="text-sm text-[var(--ink-secondary)] mb-6">
                This will permanently delete all players, rounds, and results. This action cannot be undone.
              </p>
              <div className="flex gap-3">
                <button 
                  onClick={() => setShowResetConfirm(false)}
                  className="flex-1 px-4 py-2 text-sm font-bold border border-[var(--border)] rounded-md hover:bg-[var(--bg-main)] transition-colors"
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

      {/* Header */}
      <header className="h-16 bg-[var(--ink-primary)] text-white flex items-center justify-between px-4 lg:px-8 border-b-4 border-[var(--accent)] shrink-0 z-30">
        <div className="flex items-center gap-2 font-extrabold text-lg lg:text-xl tracking-tighter uppercase">
          ENSA-M SWISS<span className="text-[var(--accent)]">MASTER</span>
        </div>
        {state.currentRoundNumber > 0 && (
          <div className="hidden sm:block text-[10px] lg:text-sm uppercase tracking-widest bg-white/10 px-3 py-1 rounded">
            Round {state.currentRoundNumber} / {state.totalRounds}
          </div>
        )}
        <div className="hidden md:block text-[10px] lg:text-sm opacity-80 font-medium truncate ml-2">Tournament Manager</div>
      </header>

      {/* Mobile Tab Navigation */}
      <nav className="lg:hidden flex bg-white border-b border-[var(--border)] sticky top-0 z-20">
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
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-[260px_1fr_280px] gap-[1px] bg-[var(--border)] overflow-hidden">
        {/* Left Column: Players */}
        <section className={`bg-[var(--bg-card)] flex flex-col overflow-hidden ${activeTab === 'players' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <h2 className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)] font-bold flex items-center gap-2">
              <Users size={12} /> Players ({state.players.length})
            </h2>
          </div>
          
          {state.currentRoundNumber === 0 && (
            <div className="p-4 border-b border-[var(--border)] bg-[var(--bg-main)]/50">
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Player Name"
                  className="w-full p-2 text-sm border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                  value={newPlayerName}
                  onChange={e => setNewPlayerName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addPlayer()}
                />
                <div className="flex gap-2">
                  <input
                    type="number"
                    placeholder="Rating"
                    className="flex-1 p-2 text-sm border border-[var(--border)] rounded bg-white focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                    value={newPlayerRating}
                    onChange={e => setNewPlayerRating(e.target.value)}
                  />
                  <button
                    onClick={addPlayer}
                    className="bg-[var(--accent)] text-white p-2 rounded hover:opacity-90 transition-opacity"
                  >
                    <Plus size={18} />
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4">
            {state.players.map(player => (
              <div key={player.id} className="group py-3 border-b border-[var(--border)] flex justify-between items-center last:border-0">
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold truncate pr-2">{player.name}</span>
                  <span className="text-[10px] text-[var(--ink-secondary)] tabular-nums font-medium">Rating: {player.initialRating}</span>
                </div>
                {state.currentRoundNumber === 0 && (
                  <button 
                    onClick={() => {
                      setEditingPlayer(player);
                      setEditName(player.name);
                      setEditRating(player.initialRating.toString());
                    }}
                    className="p-2 text-[var(--ink-secondary)] hover:text-[var(--accent)] hover:bg-[var(--accent)]/10 rounded-md transition-all opacity-0 group-hover:opacity-100"
                  >
                    <Edit2 size={14} />
                  </button>
                )}
              </div>
            ))}
            {state.players.length === 0 && (
              <div className="py-8 text-center text-xs text-[var(--ink-secondary)] italic">
                No players added yet.
              </div>
            )}
          </div>
        </section>

        {/* Center Column: Pairings */}
        <section className={`bg-[#fdfdfd] flex flex-col overflow-hidden ${activeTab === 'pairings' ? 'flex' : 'hidden lg:flex'}`}>
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
                
                <div className="mb-6 w-full max-w-[200px]">
                  <label className="block text-[10px] uppercase font-bold text-[var(--ink-secondary)] mb-2">Number of Rounds</label>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="w-full p-2 text-center border border-[var(--border)] rounded bg-white font-bold"
                    value={totalRoundsInput}
                    onChange={e => setTotalRoundsInput(e.target.value)}
                  />
                </div>

                <button
                  onClick={startTournament}
                  disabled={state.players.length < 2}
                  className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Tournament
                </button>
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
                      <div className="flex items-center justify-between mb-1">
                        <h3 className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-2 ${
                          isCurrent ? 'text-[var(--accent)]' : 'text-[var(--ink-secondary)]'
                        }`}>
                          Round {round.number} 
                          {isCurrent && <span className="bg-[var(--accent)] text-white px-1.5 py-0.5 rounded text-[8px] animate-pulse">ACTIVE</span>}
                          {round.isCompleted && <span className="text-[var(--success)] flex items-center gap-1"><CheckCircle2 size={10} /> COMPLETED</span>}
                        </h3>
                      </div>

                      <div className="grid gap-2">
                        {round.matches.map((match, mIdx) => {
                          const white = state.players.find(p => p.id === match.whitePlayerId)!;
                          const black = match.blackPlayerId === 'BYE' ? null : state.players.find(p => p.id === match.blackPlayerId)!;

                          return (
                            <motion.div
                              initial={isCurrent ? { opacity: 0, y: 10 } : false}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: mIdx * 0.05 }}
                              key={match.id}
                              className={`bg-white border rounded-lg flex items-center overflow-hidden shadow-sm transition-all ${
                                isCurrent ? 'border-[var(--accent)]/30' : 'border-[var(--border)]'
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
                                    {white.name}
                                  </span>
                                </div>
                                <div className="text-center text-[8px] font-black text-[var(--ink-secondary)] opacity-40">VS</div>
                                <div className="flex items-center gap-2 justify-end min-w-0">
                                  <span className={`text-xs truncate text-right ${match.result === '0-1' ? 'font-black' : 'font-medium'}`}>
                                    {black ? black.name : <span className="italic text-[var(--ink-secondary)]">BYE</span>}
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
                    className="bg-yellow-50 border-2 border-yellow-200 p-8 rounded-2xl text-center shadow-lg"
                  >
                    <div className="w-16 h-16 bg-yellow-100 text-yellow-600 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Trophy size={32} />
                    </div>
                    <h3 className="text-xl font-black mb-1">Tournament Complete!</h3>
                    <p className="text-xs text-yellow-800/70 mb-6">Final standings have been calculated.</p>
                    <div className="bg-white p-4 rounded-xl border border-yellow-200 inline-flex flex-col gap-1 min-w-[200px]">
                      <span className="text-[10px] uppercase font-black text-yellow-600">Champion</span>
                      <span className="text-lg font-black">{standings[0]?.name}</span>
                      <span className="text-xs font-bold text-[var(--ink-secondary)]">{standings[0]?.score} Points</span>
                    </div>
                  </motion.div>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Standings */}
        <section className={`bg-[var(--bg-card)] flex flex-col overflow-hidden ${activeTab === 'standings' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="p-4 border-b border-[var(--border)] flex justify-between items-center shrink-0">
            <h2 className="text-[10px] uppercase tracking-wider text-[var(--ink-secondary)] font-bold flex items-center gap-2">
              <Trophy size={12} /> Standings
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full border-collapse text-[11px]">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="text-[var(--ink-secondary)] uppercase text-[9px] tracking-tighter">
                  <th className="text-left p-3 border-b border-[var(--border)] font-bold">RK</th>
                  <th className="text-left p-3 border-b border-[var(--border)] font-bold">Name</th>
                  <th className="text-left p-3 border-b border-[var(--border)] font-bold">Pts</th>
                  <th className="text-left p-3 border-b border-[var(--border)] font-bold">BH</th>
                </tr>
              </thead>
              <tbody>
                {standings.map((player, idx) => (
                  <tr key={player.id} className="hover:bg-[var(--bg-main)]/30 transition-colors">
                    <td className="p-3 border-b border-[var(--border)] text-[var(--ink-secondary)] font-medium">{idx + 1}</td>
                    <td className="p-3 border-b border-[var(--border)] font-bold truncate max-w-[120px]">{player.name}</td>
                    <td className="p-3 border-b border-[var(--border)] font-bold text-[var(--accent)]">{player.score}</td>
                    <td className="p-3 border-b border-[var(--border)] text-[var(--ink-secondary)]">{player.buchholz}</td>
                  </tr>
                ))}
                {standings.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-8 text-center italic text-[var(--ink-secondary)]">
                      No data available.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="min-h-[72px] bg-white border-t border-[var(--border)] flex flex-col sm:flex-row items-center justify-end px-4 lg:px-8 py-4 gap-4 shrink-0 z-30">
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
            className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 text-xs lg:text-sm font-bold border border-[var(--border)] rounded-md hover:bg-[var(--bg-main)] transition-colors"
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
