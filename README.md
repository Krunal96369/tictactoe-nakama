# Multiplayer Tic-Tac-Toe

Real-time multiplayer tic-tac-toe built with React and Nakama. All game logic runs on the server, the client just sends intents and renders state.

**Try it:** [tictactoe.krunalchauhan.me](https://tictactoe.krunalchauhan.me)
**Nakama console:** [nakama.krunalchauhan.me:7351](http://nakama.krunalchauhan.me:7351) (Oracle Cloud + Caddy for SSL)

## How it works

```
┌─────────────────┐         WebSocket          ┌──────────────────────────┐
│   React Client  │ <----------------------->  │   Nakama Game Server     │
│   (Vite + TS)   │    Intents & State         │   (Go Runtime Plugin)    │
│                 │                            │                          │
│  - Lobby        │                            │  - MatchInit             │
│  - Matchmaking  │                            │  - MatchJoinAttempt      │
│  - Game Board   │                            │  - MatchJoin             │
│  - Leaderboard  │                            │  - MatchLoop (tick-based)│
│                 │                            │  - MatchLeave            │
└─────────────────┘                            └────────────┬─────────────┘
                                                            │
                                                   ┌────────┴────────┐
                                                   │   PostgreSQL    │
                                                   └─────────────────┘
```

The client never decides if a move is valid. It sends "I want to place at index 4" and the Go server checks if it's that player's turn, if the cell is empty, etc. If valid, the server updates the board and broadcasts the new state to both players. If not, it just ignores the message.

Players are matched through Nakama's built-in matchmaker. No room codes, no lobby browser. You click Play, it finds someone.

For auth, I went with device-based authentication since it's the simplest path for a game like this. The tradeoff is that clearing browser storage loses your identity. In a real product you'd link to email/social accounts through Nakama's account linking, but that felt out of scope here.

### Communication protocol

The client and server talk through WebSocket match data with numbered opcodes:

| Opcode | Direction | What it does |
|--------|-----------|-------------|
| 0 | Client -> Server | "Send me the current state" |
| 1 | Both | Game state payload (board, turn, timer, winner, etc.) |
| 3 | Client -> Server | Rematch vote |
| 4 | Server -> Client | Rematch vote count update |
| 5 | Server -> Client | Opponent left the match |

The game state payload (opcode 1) includes `turn_time_left` (counts down from 30) and `timed_out` (bool). The server broadcasts state every tick while a game is active, so the client timer stays in sync without running its own countdown.

There's also one RPC endpoint:

| RPC | Purpose |
|-----|---------|
| `get_leaderboard` | Returns top 10 players with wins, losses, draws, current streak, and best streak |

Leaderboard data lives in two places: Nakama's Leaderboard API (`tictactoe_wins`) for the ranked list sorted by wins, and Nakama's Storage API (`player_stats/stats` per user) for the extended stats like losses, draws, and streaks.

## Tech stack

| Layer | What |
|-------|------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Backend | Nakama 3.22.0, Go 1.22 (runtime plugin) |
| Database | PostgreSQL (managed by Nakama) |
| Deployment | Docker / Docker Compose on Oracle Cloud |

## Project structure

```
tictactoe/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Game.tsx          # Board, moves, rematch, timer display
│   │   │   ├── Lobby.tsx         # Nickname input + theme picker
│   │   │   ├── Matchmaking.tsx   # Matchmaker queue, socket handoff
│   │   │   └── Leaderboard.tsx   # Top players table (calls get_leaderboard RPC)
│   │   ├── nakama.ts             # Nakama client config
│   │   ├── App.tsx               # Screen routing + state management
│   │   ├── ThemeContext.tsx       # Color theme provider
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── modules/                       # Nakama Go server plugin
│   ├── main.go                    # InitModule, matchmaker registration, leaderboard setup
│   ├── match.go                   # Match interface (join, loop, leave, rematch, timer)
│   ├── games.go                   # Board type, win/draw detection helpers
│   └── leaderboard.go            # Stats persistence + get_leaderboard RPC
├── Dockerfile                     # Multi-stage build for the Go plugin
├── docker-compose.yml             # Nakama + PostgreSQL local/production setup
├── go.mod
└── go.sum
```

## Setup

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Docker and Docker Compose](https://docs.docker.com/get-docker/)

### 1. Clone and start the backend

```bash
git clone https://github.com/Krunal96369/tictactoe-nakama.git
cd tictactoe-nakama
```

The repo includes a `docker-compose.yml` that spins up Nakama + PostgreSQL:

```bash
docker compose up --build -d
```

Nakama Console should be up at `http://localhost:7351` (admin / password).

### 2. Start the frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in two browser tabs to test.

### 3. Point the client at your server

If you're running locally, edit `frontend/src/nakama.ts`:

```typescript
export const client = new Client(
  import.meta.env.VITE_NAKAMA_KEY || "defaultkey",
  "localhost",
  "7350",
  false,  // set to true if you're behind HTTPS
);
```

## Deployment

### Backend (Oracle Cloud)

1. Spin up an OCI Compute instance (I used Ubuntu 22.04).

2. Open these ports in the VCN Security List ingress rules:
   - `7350/tcp` - Client API (WebSocket)
   - `7351/tcp` - Admin Console
   - `7349/tcp` - gRPC

3. SSH in and run:

```bash
ssh -i your-key.pem ubuntu@<SERVER_IP>
sudo apt update && sudo apt install -y docker.io docker-compose-v2
git clone https://github.com/Krunal96369/tictactoe-nakama.git
cd tictactoe-nakama
sudo docker compose up --build -d
```

4. Hit `http://<SERVER_IP>:7351` to confirm the console is up.

### Frontend

```bash
cd frontend
npm run build
```

Deploy the `dist/` folder to Vercel, Netlify, or whatever you prefer. Just make sure `nakama.ts` points to your production server before building.

## Testing multiplayer

1. Open the game in two separate browser windows (or two different browsers).
2. Enter a different nickname in each.
3. Click **Play** in both. The matchmaker pairs them within ~10 seconds.
4. Play a game. Moves show up on both screens in real-time.
5. After the game ends, you can:
   - Click **Rematch** (both players need to click it) for another round
   - Click **Leave** to go back to the lobby
   - If one player leaves, the other gets a notification and can find a new match
6. Try closing a tab mid-game. The remaining player gets the win by disconnect.
7. Check the **Leaderboard** from the lobby to see stats.

## Server config reference

| Setting | Value | Notes |
|---------|-------|-------|
| Server Key | `defaultkey` | Change via `--socket.server_key` in production |
| Client Port | `7350` | HTTP + WebSocket |
| Console Port | `7351` | Admin dashboard |
| gRPC Port | `7349` | Server-to-server |
| Tick Rate | 1/sec | Match loop runs once per second |
| Players per match | 2 | Enforced in `MatchJoinAttempt` |

## What's implemented

**Core:**
- Server-authoritative game logic (all move validation happens on the server)
- Automatic matchmaking via Nakama's Matchmaker API
- Real-time state sync over WebSocket
- Player nicknames
- Disconnect handling (remaining player wins)
- Rematch system (both vote, board resets instantly)

**Bonus:**
- 30-second turn timer with auto-forfeit on timeout
- Leaderboard with wins, losses, draws, and streak tracking
- Concurrent game support (each match is isolated by Nakama's match system)

## License

MIT
