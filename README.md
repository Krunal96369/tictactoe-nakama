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
│  - Room Browser │                            │  - MatchJoin             │
│  - Game Board   │                            │  - MatchLoop (tick-based)│
│  - Leaderboard  │                            │  - MatchLeave            │
└─────────────────┘                            └────────────┬─────────────┘
                                                            │
                                                   ┌────────┴────────┐
                                                   │   PostgreSQL    │
                                                   └─────────────────┘
```

The client never decides if a move is valid — it sends intents and the server validates, updates, and broadcasts. See [Server-authoritative architecture](#server-authoritative-architecture) for the full rationale.

Before playing, players choose between **Classic** (untimed, relaxed) and **Timed** (30-second turn timer with auto-forfeit). Then they pick how to find an opponent:

- **Quick Play** uses Nakama's Matchmaker API with mode as a string property (`+properties.mode:classic` or `+properties.mode:timed`), so Classic players only match with Classic players and Timed with Timed. You click Play and it finds someone automatically.
- **Browse Rooms** lets players create a named room and wait, or browse open rooms and join one directly. Rooms are Nakama authoritative matches with a JSON label tracking mode, creator name, player count, and open/closed status. The label updates as players join or leave, so full or ended rooms disappear from listings automatically.

### Communication protocol

The client and server talk through WebSocket match data with numbered opcodes:

| Opcode | Direction | What it does |
|--------|-----------|-------------|
| 0 | Client -> Server | "Send me the current state" |
| 1 | Both | Game state payload (board, turn, timer, winner, etc.) |
| 3 | Client -> Server | Rematch vote |
| 4 | Server -> Client | Rematch vote count update |
| 5 | Server -> Client | Opponent left the match |

This is intentionally minimal — each opcode maps to exactly one message type, which makes the protocol easy to reason about and debug. In a production game with more message types, this same pattern scales cleanly since you can add opcodes without changing the transport layer.

The game state payload (opcode 1) includes `turn_time_left` (counts down from 30 in timed mode, stays 0 in classic), `timed_out` (bool), and `game_mode` (`"classic"` or `"timed"`). In timed mode the server broadcasts state every tick so the client timer stays in sync without running its own countdown. In classic mode the timer is disabled and players can take as long as they want.

There are also two RPC endpoints:

| RPC | Purpose |
|-----|---------|
| `get_leaderboard` | Returns top 10 players with wins, losses, draws, current streak, and best streak |
| `create_room` | Creates a new room (authoritative match with a discoverable label) and returns the match ID |

Leaderboard data lives in two places: Nakama's Leaderboard API (`tictactoe_wins`) for the ranked list sorted by wins, and Nakama's Storage API (`player_stats/stats` per user) for the extended stats like losses, draws, and streaks.

## Design Decisions

### Why Go over Lua or TypeScript for the server plugin

Nakama supports three runtime languages: Lua, TypeScript/JavaScript, and Go. I chose Go for the server-side game logic for several reasons:

**Performance and type safety.** Go compiles to a native shared object (`.so`) that runs inside the Nakama process with zero interpreter overhead. Lua and TypeScript both run through embedded interpreters, which adds latency per tick. For a game that broadcasts state every tick (1/sec here, but much faster in production shooters), that overhead compounds. Go also catches type errors at compile time rather than at runtime, which matters when you're serializing game state across the wire.

**Direct access to the Nakama runtime API.** The Go runtime plugin has full low-level access to the server environment through `nakama-common/runtime`. This means match handlers (`MatchInit`, `MatchLoop`, `MatchJoin`, `MatchLeave`) are implemented as Go interfaces rather than dynamically dispatched function calls. The result is cleaner code with IDE support, compile-time interface checks, and no magic string lookups.

**Production game server alignment.** Real-time multiplayer game servers (especially shooters) are overwhelmingly written in Go, C++, or Rust. Using Go for this assignment mirrors the actual production patterns: goroutine-friendly concurrency, predictable GC pauses, and the same language Nakama itself is written in. If this module needed to evolve into something handling physics ticks at 20-60Hz, Go is the natural path forward.

**The tradeoff.** Go plugins require exact version pinning between the plugin and the Nakama binary (same Go toolchain version, same dependency versions). This makes the build process stricter than Lua/TS. I handle this with a multi-stage Dockerfile that uses `heroiclabs/nakama-pluginbuilder` to guarantee version alignment, so the tradeoff is manageable.

### Server-authoritative architecture

The client never evaluates whether a move is valid. It sends an intent ("place at index 4") and the server checks turn order, cell availability, and game phase before applying the move and broadcasting the updated state. Invalid messages are silently dropped. This prevents any client-side manipulation, which is the baseline expectation for competitive multiplayer games.

The server broadcasts the full game state (board, turn, timer, winner) every tick while a match is active. This keeps the client as a thin rendering layer with no local game state to drift out of sync. The client does not run its own countdown timer; it reads `turn_time_left` from each state broadcast, which eliminates timer desync between players.

### Room discovery via match labels

The assignment requires "game room discovery and joining" alongside automatic matchmaking. Both are implemented as parallel paths from the lobby.

**Quick Play** uses Nakama's Matchmaker API — the same automatic pairing that was already in place. **Browse Rooms** uses Nakama's authoritative match system with JSON labels. When a player creates a room, the server creates a match via the `create_room` RPC and sets a label containing `{mode, creator, players, open}`. The label is updated in `MatchJoin` and `MatchLeave` so the room list stays accurate: full rooms set `open: false` and disappear from listings, and if a player leaves a pre-game room it reopens. Matchmaker-created matches set `open: false` from the start so they never appear in the room browser.

The client queries rooms via `client.listMatches()` with Nakama's label query syntax (`+label.open:true +label.mode:classic`), filtered by the selected game mode and capped at rooms with 0-1 players. The list polls every 4 seconds. Join races (two players clicking the same room) are handled naturally by `MatchJoinAttempt` rejecting the third player.

### Device-based authentication

I used Nakama's device authentication (`AuthenticateDevice`) rather than email/password or social login. For this scope, it is the simplest path that still gives each player a persistent identity, leaderboard history, and stats. The tradeoff is that clearing browser storage loses the identity. In production, you would layer on Nakama's account linking to attach email or social accounts, but that adds UI complexity without demonstrating any additional backend capability.

### Leaderboard: dual storage strategy

Player rankings live in two places:

1. **Nakama's Leaderboard API** (`tictactoe_wins`) handles the sorted global ranking by win count. This gives us efficient top-N queries without custom sorting logic.
2. **Nakama's Storage API** (`player_stats/stats` per user) stores extended stats: losses, draws, current streak, and best streak.

The leaderboard API is purpose-built for ranked lists but only tracks a single score value. By pairing it with per-user storage documents, we get rich stats without fighting the leaderboard abstraction. The `get_leaderboard` RPC joins both data sources into a single response for the client.

### Deployment: Oracle Cloud + Docker Compose

I deployed on an Oracle Cloud free-tier Compute instance (Ubuntu 22.04) with Docker Compose running Nakama + PostgreSQL. Caddy handles TLS termination and reverse proxying for the Nakama client API. The frontend is a static Vite build served separately.

This setup is simple and reproducible: `git clone`, `docker compose up --build -d`, and the server is running. For a production game at scale, you would move to Kubernetes with horizontal Nakama nodes behind a load balancer, but for demonstrating the architecture and running concurrent matches, a single-node Docker Compose deployment is sufficient and easy to verify.

### Match isolation and concurrency

Each match runs in its own Nakama match handler instance with isolated state. There is no shared mutable state between matches. Nakama's match registry handles lifecycle management, so spinning up 100 concurrent games requires zero additional code. The `MatchJoinAttempt` handler enforces the 2-player limit per match, and if a player disconnects mid-game, `MatchLeave` awards the win to the remaining player and updates both the leaderboard and per-user stats.

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
│   │   │   ├── Lobby.tsx         # Nickname input, mode select + theme picker
│   │   │   ├── Matchmaking.tsx   # Matchmaker queue (mode-filtered), socket handoff
│   │   │   ├── RoomBrowser.tsx   # Room discovery: create, list, and join rooms
│   │   │   └── Leaderboard.tsx   # Top players table (calls get_leaderboard RPC)
│   │   ├── nakama.ts             # Nakama client config
│   │   ├── App.tsx               # Screen routing + state management
│   │   ├── ThemeContext.tsx       # Color theme provider
│   │   └── main.tsx
│   ├── package.json
│   └── vite.config.ts
├── modules/                       # Nakama Go server plugin
│   ├── main.go                    # InitModule, matchmaker, room creation RPC, leaderboard setup
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

### Frontend (Vercel)

The production frontend is hosted on Vercel at [tictactoe.krunalchauhan.me](https://tictactoe.krunalchauhan.me).

To deploy your own:

```bash
cd frontend
npm run build
```

Deploy the `dist/` folder to Vercel (or any static host). Make sure `nakama.ts` points to your production Nakama server before building.

## Testing multiplayer

1. Open the game in two separate browser windows (or two different browsers).
2. Enter a different nickname in each.
3. **Quick Play:** Click **Quick Play** in both. The matchmaker pairs them within ~10 seconds.
4. **Room Browser:** In one window click **Browse Rooms** → **Create Room**. In the other click **Browse Rooms**, find the room in the list, and click **Join**.
5. Play a game. Moves show up on both screens in real-time.
6. After the game ends, you can:
   - Click **Rematch** (both players need to click it) for another round
   - Click **Leave** to go back to the lobby
   - If one player leaves, the other gets a notification and can find a new match
7. Try closing a tab mid-game. The remaining player gets the win by disconnect.
8. Check the **Leaderboard** from the lobby to see stats.

## Server config reference

| Setting | Value | Notes |
|---------|-------|-------|
| Server Key | `defaultkey` | Change via `--socket.server_key` in production |
| Client Port | `7350` | HTTP + WebSocket |
| Console Port | `7351` | Admin dashboard |
| gRPC Port | `7349` | Server-to-server |
| Tick Rate | 1/sec | Match loop runs once per second |
| Turn Timer | 30s (timed) / off (classic) | Configurable via mode selection |
| Players per match | 2 | Enforced in `MatchJoinAttempt` |

## What's implemented

**Core:**
- Server-authoritative game logic (all move validation happens on the server)
- Automatic matchmaking via Nakama's Matchmaker API (Quick Play)
- Room discovery and joining: create rooms, browse open rooms, join by selection (Browse Rooms)
- Mode selection: **Classic** (untimed) or **Timed** (30s per turn, auto-forfeit)
- Mode-filtered matchmaking and room listing (Classic players only see Classic, Timed see Timed)
- Real-time state sync over WebSocket
- Player nicknames
- Disconnect handling (remaining player wins)
- Rematch system (both vote, board resets instantly)

**Bonus:**
- Leaderboard with wins, losses, draws, and streak tracking
- Concurrent game support (each match is isolated by Nakama's match system)

## License

MIT
