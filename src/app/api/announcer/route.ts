import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const validKinds = new Set(['point', 'shot', 'long-rally']);
const validShots = new Set(['normal', 'slice', 'stopspin', 'power']);
const validPlayers = new Set(['PLAYER', 'CPU', 'P1', 'P2']);
const validReads = new Set(['', 'high', 'middle', 'low']);

export function GET() {
  return NextResponse.json({ enabled: Boolean(process.env.OPENAI_API_KEY) });
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: 'AI announcer is not configured.' }, { status: 503 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  if (!validKinds.has(String(body.kind)) || !validShots.has(String(body.shot)) || !validPlayers.has(String(body.shooter)) || !validReads.has(String(body.playerRead ?? ''))) {
    return NextResponse.json({ error: 'Invalid announcer event.' }, { status: 400 });
  }

  const gameState = {
    kind: body.kind,
    shooter: body.shooter,
    shot: body.shot,
    score: `${Math.min(11, Math.max(0, Number(body.scoreLeft) || 0))}-${Math.min(11, Math.max(0, Number(body.scoreRight) || 0))}`,
    rallyHits: Math.min(100, Math.max(0, Number(body.rallyHits) || 0)),
    playerRead: body.playerRead,
  };

  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_ANNOUNCER_MODEL || 'gpt-6-luna',
        instructions: 'You are the energetic, concise play-by-play announcer for a friendly arcade tennis game. Write one vivid sentence under 18 words. Use only the supplied game facts. Keep it fun, varied, and family-friendly. Do not mention being an AI or invent events.',
        input: JSON.stringify(gameState),
        max_output_tokens: 48,
        store: false,
      }),
      signal: AbortSignal.timeout(6500),
    });

    if (!response.ok) return NextResponse.json({ error: 'Commentary service unavailable.' }, { status: 502 });
    const data = await response.json() as { output?: Array<{ type?: string; content?: Array<{ type?: string; text?: string }> }> };
    const commentary = data.output
      ?.filter(item => item.type === 'message')
      .flatMap(item => item.content ?? [])
      .find(item => item.type === 'output_text')?.text
      ?.replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);

    if (!commentary) return NextResponse.json({ error: 'Commentary service returned no text.' }, { status: 502 });
    return NextResponse.json({ commentary });
  } catch {
    return NextResponse.json({ error: 'Commentary service timed out.' }, { status: 502 });
  }
}
