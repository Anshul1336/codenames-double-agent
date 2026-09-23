const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");
const WORDS = require("./words");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

const rooms = {}; // code -> room

function makeCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  let code;
  do {
    code = Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  } while (rooms[code]);
  return code;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function publicPlayers(room) {
  return Object.values(room.players).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    role: p.role,
  }));
}

function lobbyState(room) {
  return {
    code: room.code,
    hostId: room.hostId,
    players: publicPlayers(room),
    settings: room.settings,
    phase: room.phase,
  };
}

function operativeBoard(room) {
  return room.board.map((t) => ({
    word: t.word,
    revealed: t.revealed,
    color: t.revealed ? t.color : null,
  }));
}

function spymasterBoard(room) {
  return room.board.map((t) => ({
    word: t.word,
    revealed: t.revealed,
    color: t.color,
  }));
}

function remainingCounts(room) {
  const counts = { red: 0, blue: 0 };
  room.board.forEach((t) => {
    if (!t.revealed && (t.color === "red" || t.color === "blue")) counts[t.color]++;
  });
  return counts;
}

function publicState(room) {
  return {
    phase: room.phase,
    turnTeam: room.turnTeam,
    clue: room.currentClue,
    log: room.log.slice(-30),
    remaining: remainingCounts(room),
    gameOver: room.gameOver,
    winner: room.winner || null,
    winReason: room.winReason || null,
    timerEndsAt: room.timerEndsAt || null,
    doubleAgents: room.gameOver ? room.doubleAgentReveal : null,
  };
}

function broadcastBoards(room) {
  Object.values(room.players).forEach((p) => {
    const sock = io.sockets.sockets.get(p.socketId);
    if (!sock) return;
    const seesFull =
      room.gameOver ||
      p.role === "spymaster" ||
      (room.settings.doubleAgentMode && p.isDoubleAgent);
    sock.emit("board_update", seesFull ? spymasterBoard(room) : operativeBoard(room));
  });
  io.to(room.code).emit("state_update", publicState(room));
}

function addLog(room, text) {
  room.log.push({ text, ts: Date.now() });
}

function clearTimer(room) {
  if (room.timerHandle) {
    clearTimeout(room.timerHandle);
    room.timerHandle = null;
  }
  room.timerEndsAt = null;
}

function armTimer(room) {
  clearTimer(room);
  if (!room.settings.timerMode) return;
  room.timerEndsAt = Date.now() + room.settings.timerSeconds * 1000;
  room.timerHandle = setTimeout(() => {
    if (room.gameOver) return;
    addLog(room, `Time ran out — turn passed to ${otherTeam(room.turnTeam)}.`);
    endTurn(room);
    broadcastBoards(room);
  }, room.settings.timerSeconds * 1000);
}

function otherTeam(team) {
  return team === "red" ? "blue" : "red";
}

function checkWinByReveal(room) {
  const counts = remainingCounts(room);
  if (counts.red === 0) {
    room.gameOver = true;
    room.winner = "red";
    room.winReason = "All red agents found.";
  } else if (counts.blue === 0) {
    room.gameOver = true;
    room.winner = "blue";
    room.winReason = "All blue agents found.";
  }
}

function finishGameOverExtras(room) {
  if (!room.gameOver) return;
  clearTimer(room);
  room.phase = "gameover";
  room.doubleAgentReveal = Object.values(room.players)
    .filter((p) => p.isDoubleAgent)
    .map((p) => ({ name: p.name, team: p.team }));
}

function endTurn(room) {
  room.currentClue = null;
  room.turnTeam = otherTeam(room.turnTeam);
  room.phase = "clue";
  armTimer(room);
}

function startGame(room) {
  const shuffledWords = shuffle(WORDS).slice(0, 25);
  const startingTeam = Math.random() < 0.5 ? "red" : "blue";
  const counts = { [startingTeam]: 9, [otherTeam(startingTeam)]: 8, neutral: 7, assassin: 1 };
  let colorPool = [];
  Object.entries(counts).forEach(([color, n]) => {
    for (let i = 0; i < n; i++) colorPool.push(color);
  });
  colorPool = shuffle(colorPool);

  room.board = shuffledWords.map((word, i) => ({ word, color: colorPool[i], revealed: false }));
  room.startingTeam = startingTeam;
  room.turnTeam = startingTeam;
  room.currentClue = null;
  room.log = [];
  room.gameOver = false;
  room.winner = null;
  room.winReason = null;
  room.doubleAgentReveal = null;
  room.phase = "clue";

  // Double agent assignment
  ["red", "blue"].forEach((team) => {
    const teamPlayers = Object.values(room.players).filter((p) => p.team === team);
    teamPlayers.forEach((p) => (p.isDoubleAgent = false));
    if (room.settings.doubleAgentMode && teamPlayers.length >= 3) {
      const operatives = teamPlayers.filter((p) => p.role === "operative");
      if (operatives.length > 0) {
        const chosen = operatives[Math.floor(Math.random() * operatives.length)];
        chosen.isDoubleAgent = true;
      }
    }
  });

  addLog(room, `Game started. ${startingTeam.toUpperCase()} team goes first.`);
  armTimer(room);
}

io.on("connection", (socket) => {
  socket.on("create_room", ({ name, settings }, ack) => {
    const code = makeCode();
    const room = {
      code,
      hostId: socket.id,
      players: {},
      settings: {
        doubleAgentMode: !!(settings && settings.doubleAgentMode),
        timerMode: !!(settings && settings.timerMode),
        timerSeconds: (settings && settings.timerSeconds) || 90,
      },
      phase: "lobby",
      board: [],
      log: [],
      gameOver: false,
    };
    room.players[socket.id] = {
      id: socket.id,
      socketId: socket.id,
      name: (name || "Player").slice(0, 20),
      team: null,
      role: null,
      isDoubleAgent: false,
    };
    rooms[code] = room;
    socket.join(code);
    socket.data.roomCode = code;
    ack && ack({ success: true, code });
    io.to(code).emit("lobby_update", lobbyState(room));
  });

  socket.on("join_room", ({ name, code }, ack) => {
    const room = rooms[(code || "").toUpperCase()];
    if (!room) return ack && ack({ success: false, error: "Room not found." });
    if (room.phase !== "lobby") return ack && ack({ success: false, error: "Game already in progress." });
    if (Object.keys(room.players).length >= 8) return ack && ack({ success: false, error: "Room full (max 8)." });

    room.players[socket.id] = {
      id: socket.id,
      socketId: socket.id,
      name: (name || "Player").slice(0, 20),
      team: null,
      role: null,
      isDoubleAgent: false,
    };
    socket.join(room.code);
    socket.data.roomCode = room.code;
    ack && ack({ success: true, code: room.code });
    io.to(room.code).emit("lobby_update", lobbyState(room));
  });

  socket.on("choose_team", (team) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.phase !== "lobby") return;
    const p = room.players[socket.id];
    if (!p || (team !== "red" && team !== "blue")) return;
    p.team = team;
    p.role = null;
    io.to(room.code).emit("lobby_update", lobbyState(room));
  });

  socket.on("choose_role", (role) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.phase !== "lobby") return;
    const p = room.players[socket.id];
    if (!p || !p.team || (role !== "spymaster" && role !== "operative")) return;
    if (role === "spymaster") {
      const taken = Object.values(room.players).some(
        (o) => o.team === p.team && o.role === "spymaster" && o.id !== p.id
      );
      if (taken) return;
    }
    p.role = role;
    io.to(room.code).emit("lobby_update", lobbyState(room));
  });

  socket.on("toggle_setting", ({ key, value }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.phase !== "lobby" || socket.id !== room.hostId) return;
    if (key === "doubleAgentMode") room.settings.doubleAgentMode = !!value;
    if (key === "timerMode") room.settings.timerMode = !!value;
    if (key === "timerSeconds") room.settings.timerSeconds = Math.max(30, Math.min(300, Number(value) || 90));
    io.to(room.code).emit("lobby_update", lobbyState(room));
  });

  socket.on("start_game", (ack) => {
    const room = rooms[socket.data.roomCode];
    if (!room || socket.id !== room.hostId) return ack && ack({ success: false, error: "Only host can start." });
    for (const team of ["red", "blue"]) {
      const teamPlayers = Object.values(room.players).filter((p) => p.team === team);
      const spymasters = teamPlayers.filter((p) => p.role === "spymaster");
      if (teamPlayers.length < 2) return ack && ack({ success: false, error: `${team} team needs at least 2 players.` });
      if (spymasters.length !== 1) return ack && ack({ success: false, error: `${team} team needs exactly 1 spymaster.` });
    }
    startGame(room);
    io.to(room.code).emit("game_started");
    broadcastBoards(room);
    ack && ack({ success: true });
  });

  socket.on("submit_clue", ({ word, count }) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.gameOver || room.phase !== "clue") return;
    const p = room.players[socket.id];
    if (!p || p.team !== room.turnTeam || p.role !== "spymaster") return;
    const n = Math.max(0, Math.min(9, parseInt(count, 10) || 0));
    const cleanWord = (word || "").trim().toUpperCase().slice(0, 20);
    if (!cleanWord) return;
    room.currentClue = { word: cleanWord, count: n, guessesUsed: 0, guessesAllowed: n === 0 ? 25 : n + 1 };
    room.phase = "guess";
    addLog(room, `${p.name} (${p.team}) gave clue: "${cleanWord}" — ${n}`);
    armTimer(room);
    broadcastBoards(room);
  });

  socket.on("guess_tile", (index) => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.gameOver || room.phase !== "guess") return;
    const p = room.players[socket.id];
    if (!p || p.team !== room.turnTeam || p.role !== "operative") return;
    const tile = room.board[index];
    if (!tile || tile.revealed) return;

    tile.revealed = true;
    room.currentClue.guessesUsed++;

    if (tile.color === "assassin") {
      addLog(room, `${p.name} revealed the ASSASSIN (${tile.word})! ${p.team} loses.`);
      room.gameOver = true;
      room.winner = otherTeam(p.team);
      room.winReason = `${p.team} hit the assassin.`;
      finishGameOverExtras(room);
      broadcastBoards(room);
      return;
    }

    if (tile.color === p.team) {
      addLog(room, `${p.name} correctly found ${tile.word} (${p.team}).`);
      checkWinByReveal(room);
      if (room.gameOver) {
        finishGameOverExtras(room);
        broadcastBoards(room);
        return;
      }
      if (room.currentClue.guessesUsed >= room.currentClue.guessesAllowed) {
        addLog(room, `Guess limit reached — turn passes to ${otherTeam(room.turnTeam)}.`);
        endTurn(room);
      }
      broadcastBoards(room);
      return;
    }

    if (tile.color === "neutral") {
      addLog(room, `${p.name} revealed a neutral card (${tile.word}). Turn ends.`);
    } else {
      addLog(room, `${p.name} revealed an enemy card (${tile.word})! Turn ends.`);
      checkWinByReveal(room);
      if (room.gameOver) {
        finishGameOverExtras(room);
        broadcastBoards(room);
        return;
      }
    }
    endTurn(room);
    broadcastBoards(room);
  });

  socket.on("pass_turn", () => {
    const room = rooms[socket.data.roomCode];
    if (!room || room.gameOver || room.phase !== "guess") return;
    const p = room.players[socket.id];
    if (!p || p.team !== room.turnTeam || p.role !== "operative") return;
    addLog(room, `${p.name} passed the turn.`);
    endTurn(room);
    broadcastBoards(room);
  });

  socket.on("leave_room", () => cleanupPlayer(socket));
  socket.on("disconnect", () => cleanupPlayer(socket));

  function cleanupPlayer(socket) {
    const code = socket.data.roomCode;
    const room = rooms[code];
    if (!room) return;
    delete room.players[socket.id];
    if (Object.keys(room.players).length === 0) {
      clearTimer(room);
      delete rooms[code];
      return;
    }
    if (room.hostId === socket.id) {
      room.hostId = Object.keys(room.players)[0];
    }
    io.to(code).emit("lobby_update", lobbyState(room));
    if (room.phase !== "lobby") broadcastBoards(room);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Codenames: Double Agent listening on port ${PORT}`));
