This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## How it plays

A tennis game with a 3D ball, a broadcast camera, and real scoring (15-30-40, deuce, faults, first to 3 games).

- **Move and aim:** arrow keys run around the court. The direction you hold at the swing aims the shot.
- **Shots:** `V` topspin, `C` flat, `Z` slice, `B` lob, `X` drop shot. Each has its own pace, arc, and bounce.
- **Timing:** hold a shot to wind up, then release as the marker hits the green. Early sails long, late finds the net, and way off misses the ball.
- **Serve:** hold `Space` or a shot key to toss, and release in the green at the top of the toss.
- **Timing practice:** a coach feeds balls with no score, and your perfect-shot streak is saved in the browser.
- **Two players:** P1 (far end) uses `WASD` with `E` `R` `Q` `G` `F`. P2 (near end) uses the arrows with `V` `C` `Z` `B` `X`.
- **Controller:** stick moves and aims, `A` topspin, `X` flat, `B` slice, `Y` lob, `RB`/`RT` drop, `Start` pauses. In two-player, the first controller is P1.
- **Touch:** drag on the court to move, and hold and release the on-screen shot buttons.
- Toggle spoken play-by-play with the Voice button.

## Optional AI announcer

Local event-based commentary works by default. To enable model-generated callouts, copy `.env.example` to `.env.local`, add a server-side `OPENAI_API_KEY`, and restart Next.js. The announcer sends only the current score, shot type, rally length, and a coarse player aim tendency when a point or special shot occurs. It uses the OpenAI Responses API and defaults to `gpt-6-luna`; set `OPENAI_ANNOUNCER_MODEL` to choose another model. Keep the API key on the server and out of browser code.
