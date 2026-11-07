import type { AnnouncerEvent } from './types';

const pick = (lines: string[], seed: number) => lines[Math.abs(seed) % lines.length];

export function fallbackCommentary(event: AnnouncerEvent) {
  const seed = event.scoreLeft * 17 + event.scoreRight * 31 + event.rallyHits * 7;
  if (event.kind === 'point') {
    if (event.rallyHits >= 8) return pick([
      `What a rally! ${event.shooter} takes the point after ${event.rallyHits} hits.`,
      `They kept it alive—and ${event.shooter} finishes the exchange!`,
      `A marathon point ends in ${event.shooter}'s favor.`,
    ], seed);
    return pick([
      `${event.shooter} finds the opening. Point on the board.`,
      `Clean finish from ${event.shooter}. The pressure is on.`,
      `${event.shooter} takes it. The next serve is coming up.`,
    ], seed);
  }
  if (event.kind === 'long-rally') return `${event.rallyHits} hits and counting—neither player is giving an inch.`;
  if (event.shot === 'topspin') return `${event.shooter} brushes up the back of the ball—heavy topspin pulls it down into court.`;
  if (event.shot === 'slice') return `${event.shooter} carves a slice across the court.`;
  if (event.shot === 'stopspin') return `${event.shooter} takes the pace off. That's a stop-spin return.`;
  if (event.shot === 'power' && event.timing === 'perfect') return `Perfect timing! ${event.shooter} unloads a laser-guided power shot.`;
  if (event.shot === 'power' && (event.timing === 'early' || event.timing === 'late')) return `${event.shooter} powers up the return. A little off the sweet spot, but still dangerous.`;
  if (event.shot === 'power') return `Power shot! ${event.shooter} unloads a full-charge return.`;
  return `${event.shooter} sends it back. ${event.playerRead ? `The CPU is reading your ${event.playerRead} targets.` : ''}`.trim();
}
