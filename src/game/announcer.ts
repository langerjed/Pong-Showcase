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
  if (event.timing === 'perfect') return `Perfect timing! ${event.shooter} catches that ${event.shot === 'drop' ? 'drop shot' : event.shot} right on the sweet spot.`;
  if (event.shot === 'topspin') return `${event.shooter} brushes up the back of the ball. Heavy topspin dips it into the court.`;
  if (event.shot === 'flat') return `${event.shooter} flattens it out and goes for the line.`;
  if (event.shot === 'slice') return `${event.shooter} carves a low slice that skids through.`;
  if (event.shot === 'lob') return `${event.shooter} sends up a lob. Way up there!`;
  if (event.shot === 'drop') return `${event.shooter} takes all the pace off with a drop shot.`;
  return `${event.shooter} sends it back. ${event.playerRead ? `The CPU is reading your ${event.playerRead} targets.` : ''}`.trim();
}
