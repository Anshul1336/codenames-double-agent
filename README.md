# Codenames: Double Agent

A real-time multiplayer word-guessing game for 4-8 players, built on classic Codenames rules — plus a hidden-traitor twist.

**Play now:** https://codenames-double-agent.onrender.com

> Free hosting tier — if the link is slow on first load (~30-50s), the server is just waking up from idle. It's instant after that.

Built with the help of AI (Claude Code / Claude Opus) — game design, backend, frontend, and deployment.

## How to play

- Split into two teams, Red and Blue. Each team needs one **spymaster** and at least one **operative**.
- One player creates a room and shares the 4-letter room code. Everyone else joins from their own phone/laptop.
- The spymaster sees the color of all 25 cards on the board. Operatives see only the words.
- On your team's turn, the spymaster gives a one-word clue and a number (e.g. "OCEAN — 2"), meaning two cards on the board relate to that word.
- Operatives click cards to guess. A correct guess lets you keep guessing (up to clue-number + 1 total). A wrong guess — enemy card or neutral — ends your turn immediately. The black **assassin** card is an instant loss.
- First team to reveal all of their own cards wins.

## The twist: Double Agent

Toggle it on when creating a room (needs 3+ players on a team to activate). One operative per team is secretly made a **Double Agent** — they can see the full board like a spymaster, but their job is to quietly mislead their own team without getting caught. Identities are revealed when the game ends.

There's also an optional turn timer for a faster-paced game.

## Tech

Node.js, Express, Socket.io for real-time sync, vanilla HTML/CSS/JS on the frontend. No database — game state lives in memory per room. Deployed on Render's free tier.

## How it works (no-code explanation)

**The "live together" part:** everyone opens the same link. One person creates a room and gets a 4-letter code; others type that code in to join. All devices connect to one server over a WebSocket — a connection that stays open the whole time, like a phone call instead of texting back and forth. Whenever someone gives a clue or clicks a card, that action goes to the server, the server updates the shared game state, and instantly pushes the update out to everyone else's screen. That's why nobody needs to refresh.

**The board and roles:** the server picks 25 random words and secretly assigns each one a color (Red's, Blue's, neutral, or the assassin) — only the server knows the full picture at first. Spymasters get sent the full color key. Operatives only ever get sent the words — their browser literally never receives the colors, so there's no way to peek by inspecting the page. Double Agents secretly get the same full-color view as a spymaster, without their teammates knowing.

**Getting it online:** the code lives here on GitHub. [Render](https://render.com) runs it on a small server and gives it a public address — that's the live link above. Free tier means it naps after 15 minutes of no traffic and takes ~30s to wake up on the next visit; after that it's instant.

## Built with AI

This project was designed and built with [Claude Code](https://claude.com/claude-code) (Anthropic). The game concept (Codenames + a hidden-traitor twist) was described in plain English — all the code (server logic, game rules, real-time sync, UI, deployment) was written, tested, and deployed by AI. No prior coding experience was needed to make this.

## Running locally

```
npm install
npm start
```

Then open `http://localhost:3000`.
