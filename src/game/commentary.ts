// ============================================================
//  Pong Showcase — British match commentary
//  Pure logic: works out which points are big and what to say.
//  Spoken only at the start of play and on big moments.
// ============================================================

import type { End } from './sim';

export interface ScoreState {
  points: Record<End, number>;
  games: Record<End, number>;
  server: End;
  gamesToWin: number;
}

export interface Situation {
  kind: 'match-point' | 'break-point' | 'game-point' | 'deuce';
  /** The player one point from winning; null at deuce. */
  end: End | null;
  /** How many chances in a row they have, such as 3 at 40-0. */
  chances: number;
  advantage: boolean;
  repeatDeuce: boolean;
}

const otherEnd = (end: End): End => (end === 'near' ? 'far' : 'near');

export function pointSituation(score: ScoreState): Situation | null {
  const { near, far } = score.points;
  if (near >= 3 && near === far) {
    return { kind: 'deuce', end: null, chances: 0, advantage: false, repeatDeuce: near > 3 };
  }
  const leader: End = near > far ? 'near' : 'far';
  const mine = score.points[leader], theirs = score.points[otherEnd(leader)];
  if (mine < 3) return null;
  const kind = score.games[leader] + 1 >= score.gamesToWin ? 'match-point' : leader === score.server ? 'game-point' : 'break-point';
  return { kind, end: leader, chances: mine - theirs, advantage: theirs >= 3, repeatDeuce: false };
}

export interface Names { near: string; far: string }

export interface PointResult {
  winner: End;
  reason: string;
  rally: number;
  situation: Situation | null;
  gameWon: boolean;
  matchWon: boolean;
  /** Who served the point just played. */
  server: End;
  games: Record<End, number>;
}

const NUMBER_WORDS = ['nil', 'one', 'two', 'three', 'four', 'five', 'six'];
const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
const count = (n: number) => ['', 'a', 'two', 'three'][n] ?? String(n);

export class Commentator {
  private used: Record<string, number> = {};
  private names: Names;

  constructor(names: Names) {
    this.names = names;
  }

  /** Works through each list in turn, so the same line never comes up twice running. */
  private pick(key: string, lines: string[]) {
    const index = this.used[key] ?? 0;
    this.used[key] = index + 1;
    return lines[index % lines.length];
  }

  opening(practice: boolean, opponentDetail: string) {
    if (practice) {
      return this.pick('practice', [
        'Right then, a spot of practice. Watch the ball, and let us see about that timing.',
      ]);
    }
    return this.pick('opening', [
      `Good afternoon, and welcome to Centre Court. A lovely day for it. ${capitalise(this.names.near)} takes on ${this.names.far}${opponentDetail}. First to three games. Quiet please.`,
    ]);
  }

  situation(situation: Situation) {
    const name = situation.end ? this.names[situation.end] : '';
    if (situation.kind === 'deuce') {
      return situation.repeatDeuce
        ? this.pick('deuce-again', ['Deuce again. Neither of them will give an inch.', 'Back to deuce. This game has everything.', 'Deuce once more. Marvellous stuff.'])
        : this.pick('deuce', ['Deuce. Honours even in this game.', 'And we are at deuce. Tension building here.']);
    }
    const lead = situation.advantage ? `Advantage ${name}. ` : '';
    const plural = situation.chances > 1;
    const number = capitalise(count(situation.chances));
    if (situation.kind === 'match-point') {
      if (situation.advantage) return `${lead}And that is match point.`;
      return plural
        ? `${number} match points for ${name}. Can they finish the job?`
        : this.pick('match-point', [`Match point, ${name}. You could hear a pin drop.`, `And here it is. Match point for ${name}.`]);
    }
    if (situation.kind === 'break-point') {
      if (situation.advantage) return `${lead}That is a break point.`;
      return plural
        ? `${number} break points. Real trouble for the server now.`
        : this.pick('break-point', [`Break point, ${name}. A big moment in this match.`, `Oh, this is a chance. Break point for ${name}.`]);
    }
    if (situation.advantage) return `${lead}Game point.`;
    return plural
      ? `${number} game points for ${name}.`
      : this.pick('game-point', [`Game point, ${name}.`, `${capitalise(name)} just one point away from the game.`]);
  }

  private gameScore(result: PointResult) {
    const mine = result.games[result.winner], theirs = result.games[otherEnd(result.winner)];
    if (mine === theirs) return `${capitalise(NUMBER_WORDS[mine] ?? String(mine))} games all.`;
    const word = (n: number) => NUMBER_WORDS[n] ?? String(n);
    const high = Math.max(mine, theirs), low = Math.min(mine, theirs);
    const leader = this.names[mine > theirs ? result.winner : otherEnd(result.winner)];
    return `${capitalise(word(high))} ${high === 1 ? 'game' : 'games'} to ${word(low)}, ${leader}.`;
  }

  /** The line for a finished point, or null when the point was not a big one. */
  result(result: PointResult): string | null {
    const winner = this.names[result.winner];
    if (result.matchWon) {
      return this.pick('match', [
        `Game, set and match, ${winner}! What a performance on Centre Court, and a thoroughly deserved win.`,
        `And that is that! Game, set and match to ${winner}. They will be talking about this one over the strawberries.`,
      ]);
    }
    if (result.gameWon) {
      const broke = result.winner !== result.server;
      const lead = broke
        ? this.pick('break', [`And there is the break! ${capitalise(winner)} takes it.`, `Oh, well played! ${capitalise(winner)} breaks serve.`])
        : this.pick('hold', [`Game, ${winner}.`, `A solid hold from ${winner}.`, `${capitalise(winner)} serves it out nicely.`]);
      return `${lead} ${this.gameScore(result)}`;
    }
    const big = result.situation;
    // A save only counts as one when it was the last chance, or the stakes were a break or the match.
    if (big && big.kind !== 'deuce' && big.end !== result.winner && (big.chances === 1 || big.kind !== 'game-point')) {
      if (result.reason === 'ace') return this.pick('ace-save', ['An ace! What a time to find one.', 'Oh, I say! An ace, when it mattered most.']);
      if (result.rally >= 8) return this.pick('rally-save', ['Saved, after a magnificent rally! The crowd are on their feet.']);
      return big.kind === 'match-point'
        ? this.pick('match-save', ['Saved! They are not done yet.', 'Oh, what nerve! The match point is saved.'])
        : this.pick('save', ['And that one is saved.', 'Well saved. Nerves of steel.', 'Saved! A vital point, that.']);
    }
    if (result.reason === 'double fault' && big) return this.pick('double-fault', ['A double fault, at the worst possible moment. Oh dear.']);
    if (result.rally >= 10) {
      return this.pick('rally', ['Oh, what a rally! That is tennis of the very highest order.', 'Absolutely superb! The crowd loved every shot of that.', 'Goodness me, what a point. They will want to see that one again.']);
    }
    return null;
  }
}
