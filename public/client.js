const socket = io();

let myId = null;
let myTeam = null;
let myRole = null;
let currentRoomCode = null;
let lastLobby = null;
let timerInterval = null;

function show(screenId) {
  document.querySelectorAll(".screen").forEach((s) => s.classList.remove("active"));
  document.getElementById(screenId).classList.add("active");
}

socket.on("connect", () => {
  myId = socket.id;
});

// ---------- HOME ----------
document.getElementById("btn-create").onclick = () => {
  const name = document.getElementById("name-input").value.trim() || "Player";
  socket.emit("create_room", { name, settings: {} }, (res) => {
    if (!res.success) return setErr("home-error", res.error);
    currentRoomCode = res.code;
    show("screen-lobby");
  });
};

document.getElementById("btn-join").onclick = () => {
  const name = document.getElementById("name-input").value.trim() || "Player";
  const code = document.getElementById("code-input").value.trim().toUpperCase();
  if (!code) return setErr("home-error", "Enter a room code.");
  socket.emit("join_room", { name, code }, (res) => {
    if (!res.success) return setErr("home-error", res.error);
    currentRoomCode = res.code;
    show("screen-lobby");
  });
};

function setErr(id, msg) {
  document.getElementById(id).textContent = msg || "";
}

// ---------- LOBBY ----------
document.querySelectorAll(".join-team").forEach((btn) => {
  btn.onclick = () => socket.emit("choose_team", btn.dataset.team);
});
document.querySelectorAll(".join-role").forEach((btn) => {
  btn.onclick = () => socket.emit("choose_role", btn.dataset.role);
});

document.getElementById("chk-double").onchange = (e) =>
  socket.emit("toggle_setting", { key: "doubleAgentMode", value: e.target.checked });
document.getElementById("chk-timer").onchange = (e) => {
  socket.emit("toggle_setting", { key: "timerMode", value: e.target.checked });
  document.getElementById("timer-sec-wrap").style.display = e.target.checked ? "inline-flex" : "none";
};
document.getElementById("timer-sec").onchange = (e) =>
  socket.emit("toggle_setting", { key: "timerSeconds", value: e.target.value });

document.getElementById("btn-start").onclick = () => {
  socket.emit("start_game", (res) => {
    if (!res.success) setErr("lobby-error", res.error);
  });
};

socket.on("lobby_update", (state) => {
  lastLobby = state;
  currentRoomCode = state.code;
  if (document.getElementById("screen-game").classList.contains("active")) return;
  show("screen-lobby");
  renderLobby(state);
});

function renderLobby(state) {
  document.getElementById("lobby-code").textContent = state.code;
  const me = state.players.find((p) => p.id === myId);
  myTeam = me ? me.team : null;
  myRole = me ? me.role : null;

  const isHost = state.hostId === myId;
  document.getElementById("host-settings").style.display = isHost ? "flex" : "none";
  document.getElementById("guest-settings").style.display = isHost ? "none" : "block";
  document.getElementById("guest-settings").textContent = isHost
    ? ""
    : `Double Agent: ${state.settings.doubleAgentMode ? "ON" : "OFF"} · Timer: ${
        state.settings.timerMode ? state.settings.timerSeconds + "s" : "OFF"
      }`;
  if (isHost) {
    document.getElementById("chk-double").checked = state.settings.doubleAgentMode;
    document.getElementById("chk-timer").checked = state.settings.timerMode;
    document.getElementById("timer-sec").value = state.settings.timerSeconds;
    document.getElementById("timer-sec-wrap").style.display = state.settings.timerMode ? "inline-flex" : "none";
  }

  ["red", "blue"].forEach((team) => {
    const el = document.getElementById(`${team}-players`);
    el.innerHTML = "";
    state.players
      .filter((p) => p.team === team)
      .forEach((p) => {
        const div = document.createElement("div");
        div.className = "p";
        div.innerHTML = `<span>${escapeHtml(p.name)}${p.id === myId ? " (you)" : ""}</span><span class="role-tag">${
          p.role ? p.role : ""
        }</span>`;
        el.appendChild(div);
      });
  });

  document.getElementById("role-pick").style.display = myTeam ? "flex" : "none";
  document.getElementById("btn-start").style.display = isHost ? "block" : "none";
  setErr("lobby-error", "");
}

function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

// ---------- GAME ----------
socket.on("game_started", () => {
  show("screen-game");
});

let currentBoard = [];

socket.on("board_update", (board) => {
  currentBoard = board;
  renderBoard();
});

socket.on("state_update", (state) => {
  renderState(state);
});

function renderBoard() {
  const boardEl = document.getElementById("board");
  boardEl.innerHTML = "";
  currentBoard.forEach((tile, i) => {
    const div = document.createElement("div");
    div.className = "tile";
    if (tile.revealed) {
      div.classList.add("revealed", `color-${tile.color}`);
    } else if (tile.color) {
      // spymaster/double-agent peek: color known but not revealed
      div.classList.add(`peek-${tile.color === "neutral" ? "" : tile.color}`);
    }
    div.textContent = tile.word;
    div.onclick = () => {
      if (myRole === "operative" && !tile.revealed) socket.emit("guess_tile", i);
    };
    boardEl.appendChild(div);
  });
}

function renderState(state) {
  const banner = document.getElementById("turn-banner");
  banner.textContent = state.gameOver
    ? "Game Over"
    : `${state.turnTeam.toUpperCase()}'s turn — ${state.phase === "clue" ? "waiting for clue" : "guessing"}`;
  banner.className = "turn-banner " + (state.turnTeam || "");

  document.getElementById("red-remaining").textContent = state.remaining.red;
  document.getElementById("blue-remaining").textContent = state.remaining.blue;

  const me = lastLobby ? lastLobby.players.find((p) => p.id === myId) : null;
  let roleMsg = myRole ? `You are ${myTeam} ${myRole}.` : "";
  document.getElementById("role-banner").textContent = roleMsg;

  renderCluePanel(state);
  renderLog(state.log);

  if (state.timerEndsAt) {
    startCountdown(state.timerEndsAt);
  } else {
    stopCountdown();
  }

  if (state.gameOver) {
    stopCountdown();
    document.getElementById("go-title").textContent =
      state.winner === myTeam ? "Your team wins!" : `${state.winner.toUpperCase()} team wins`;
    document.getElementById("go-reason").textContent = state.winReason || "";
    const daEl = document.getElementById("go-double-agents");
    if (state.doubleAgents && state.doubleAgents.length) {
      daEl.innerHTML =
        "<h3>Double Agents revealed:</h3>" +
        state.doubleAgents.map((d) => `<div>${escapeHtml(d.name)} (${d.team})</div>`).join("");
    } else {
      daEl.innerHTML = "";
    }
    setTimeout(() => show("screen-gameover"), 900);
  }
}

function renderCluePanel(state) {
  const panel = document.getElementById("clue-panel");
  panel.innerHTML = "";
  if (state.gameOver) return;

  if (state.clue) {
    const p = document.createElement("div");
    p.className = "clue-current";
    p.textContent = `Clue: "${state.clue.word}" — ${state.clue.count}  (guesses used ${state.clue.guessesUsed}/${state.clue.guessesAllowed})`;
    panel.appendChild(p);
    if (myRole === "operative" && myTeam === state.turnTeam) {
      const passBtn = document.createElement("button");
      passBtn.textContent = "Pass Turn";
      passBtn.onclick = () => socket.emit("pass_turn");
      panel.appendChild(passBtn);
    }
    return;
  }

  if (myRole === "spymaster" && myTeam === state.turnTeam && state.phase === "clue") {
    const wordInput = document.createElement("input");
    wordInput.placeholder = "Clue word";
    const countInput = document.createElement("input");
    countInput.type = "number";
    countInput.min = 0;
    countInput.max = 9;
    countInput.value = 1;
    countInput.style.width = "70px";
    const btn = document.createElement("button");
    btn.textContent = "Give Clue";
    btn.onclick = () => {
      if (!wordInput.value.trim()) return;
      socket.emit("submit_clue", { word: wordInput.value, count: countInput.value });
    };
    panel.appendChild(wordInput);
    panel.appendChild(countInput);
    panel.appendChild(btn);
  } else {
    const waiting = document.createElement("div");
    waiting.className = "clue-current";
    waiting.textContent = `Waiting for ${state.turnTeam} spymaster to give a clue...`;
    panel.appendChild(waiting);
  }
}

function renderLog(log) {
  const el = document.getElementById("log");
  el.innerHTML = log.map((l) => `<div>${escapeHtml(l.text)}</div>`).join("");
  el.scrollTop = el.scrollHeight;
}

function startCountdown(endsAt) {
  stopCountdown();
  const el = document.getElementById("timer-display");
  const tick = () => {
    const secsLeft = Math.max(0, Math.round((endsAt - Date.now()) / 1000));
    el.textContent = `⏱ ${secsLeft}s`;
    if (secsLeft <= 0) stopCountdown();
  };
  tick();
  timerInterval = setInterval(tick, 500);
}

function stopCountdown() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  document.getElementById("timer-display").textContent = "";
}

// ---------- GAME OVER ----------
document.getElementById("btn-again").onclick = () => {
  socket.emit("leave_room");
  location.reload();
};
