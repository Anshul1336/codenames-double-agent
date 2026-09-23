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

## Running locally

```
npm install
npm start
```

Then open `http://localhost:3000`.
