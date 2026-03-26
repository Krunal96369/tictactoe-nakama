# Multiplayer Tic-Tac-Toe — Nakama Backend

A production-ready, real-time multiplayer Tic-Tac-Toe game with **server-authoritative architecture** using [Nakama](https://heroiclabs.com/nakama/) as the game server.


## Live Demo

- **Frontend:** [https://tictactoe.krunalchauhan.me](https://tictactoe.krunalchauhan.me)
- **Nakama Server:** [https://nakama.krunalchauhan.me](https://nakama.krunalchauhan.me) (Oracle Cloud + Caddy SSL)

---

## Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────────────┐
│   React Client  │ ◄──────────────────────►   │   Nakama Game Server     │
│   (Vite + TS)   │    Intents & State         │   (Go Runtime Plugin)    │
│                 │                            │                          │
│  • Lobby        │                            │  • MatchInit             │
│  • Matchmaking  │                            │  • MatchJoinAttempt      │
│  • Game Board   │                            │  • MatchJoin             │
│                 │                            │  • MatchLoop (tick-based)│
│                 │                            │  • MatchLeave            │
└─────────────────┘                            └────────────┬─────────────┘
                                                            │
                                                   ┌────────┴────────┐
                                                   │  PostgreSQL     │
                                                   │  (User Data)    │
                                                   └────────┴────────┘
```

### Design Decisions

- **Server handles the logic** The client sends move *intents* (e.g., "place at index 4"). The server validates (correct turn? cell empty?), updates state, and broadcasts to all players. No game logic runs on the client.
- **Nakama Matchmaker** pairs players automatically — no manual room codes needed.
- **Device authentication** is used for frictionless onboarding. A known limitation is that clearing browser storage creates a new identity. In production, this would be mitigated by linking accounts to email/social auth via Nakama's account linking APIs.
- **WebSocket communication** uses numbered opcodes for different message types:

| Opcode | Direction | Purpose |
|--------|-----------|---------|
| 0 | Client → Server | Request current game state |
| 1 | Both | Game state broadcast / Move data |
| 3 | Client → Server | Rematch vote |
| 4 | Server → Client | Rematch vote count |
| 5 | Server → Client | Opponent left notification |

`GameState` (opcode 1 payload) includes `turn_time_left` (int, 0–30) and `timed_out` (bool) for the timer feature. The server broadcasts state every tick while a game is active, keeping the client countdown in sync without client-side timers.

| RPC ID | Direction | Purpose |
|--------|-----------|---------|
| `get_leaderboard` | Client → Server (HTTP RPC) | Returns top 10 players: wins, losses, draws, current streak, best streak |

**Persistence layers:**
- **Nakama Leaderboard API** (`tictactoe_wins`) — sorted global ranking by win count
- **Nakama Storage API** (`player_stats/stats` per user) — extended stats: losses, draws, current streak, best streak

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Backend | Nakama 3.22.0, Go 1.22 (runtime plugin) |
| Database | PostgreSQL (managed by Nakama) |
| Deployment | Docker / Docker Compose, Oracle Cloud (OCI) |

---

## Project Structure

```
tictactoe/
├── frontend/                   # React client
│   ├── src/
│   │   ├── components/
│   │   │   ├── Game.tsx        # Game board, moves, rematch UI
│   │   │   ├── Lobby.tsx       # Nickname entry
│   │   │   └── Matchmaking.tsx # Matchmaker queue + socket handoff
│   │   ├── nakama.ts           # Nakama client config
│   │   ├── App.tsx             # Screen routing + state
│   │   └── main.tsx            # Entry point
│   ├── package.json
│   └── vite.config.ts
├── modules/                    # Nakama Go server plugin
│   ├── main.go                 # InitModule (match + matchmaker registration)
│   ├── match.go                # Match interface (join, loop, leave, rematch)
│   └── games.go                # Board type, win/draw detection
├── Dockerfile                  # Multi-stage build for Go plugin
├── go.mod
└── go.sum
```

---

## Setup & Installation

### Prerequisites

- [Go 1.22+](https://go.dev/dl/)
- [Node.js 18+](https://nodejs.org/)
- [Docker & Docker Compose](https://docs.docker.com/get-docker/)

### 1. Clone the Repository

```bash
git clone https://github.com/Krunal96369/tictactoe-nakama.git
cd tictactoe-nakama
```

### 2. Run the Backend (Nakama + PostgreSQL)

Create a `docker-compose.yml` in the project root:

```yaml
version: '3'
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: nakama
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: localdb
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD", "pg_isready", "-U", "postgres"]
      interval: 5s
      timeout: 5s
      retries: 5

  nakama:
    build: .
    depends_on:
      postgres:
        condition: service_healthy
    environment:
      - NAKAMA_CONSOLE_USERNAME=admin
      - NAKAMA_CONSOLE_PASSWORD=${NAKAMA_CONSOLE_PASSWORD:-password}
    ports:
      - "7350:7350"   # Client API (HTTP/WebSocket)
      - "7351:7351"   # Console
      - "7349:7349"   # gRPC
    command: >
      /nakama/nakama migrate up
      --database.address postgres:localdb@postgres:5432/nakama
      && /nakama/nakama
      --database.address postgres:localdb@postgres:5432/nakama
      --runtime.path /nakama/data/modules
      --socket.server_key ${NAKAMA_SERVER_KEY:-defaultkey}

volumes:
  pgdata:
```

Then run:

```bash
docker compose up --build -d
```

Nakama Console will be available at `http://localhost:7351` (admin / password).

### 3. Run the Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in two browser tabs/windows to test.

### 4. Configure Server Address

Edit `frontend/src/nakama.ts` to point to your server (or set `VITE_NAKAMA_KEY` in `.env`):

```typescript
export const client = new Client(
  import.meta.env.VITE_NAKAMA_KEY || "defaultkey", // Server key
  "localhost",        // Host (or your server IP)
  "7350",             // Port
  false,              // SSL (true for production with HTTPS)
);
```

---

## Deployment

### Backend — Oracle Cloud (OCI)

1. **Provision** an OCI Compute instance (Ubuntu 22.04, ARM or AMD).

2. **Open ports** in the VCN Security List (Ingress Rules):
   - `7350/tcp` — Client API (WebSocket)
   - `7351/tcp` — Admin Console
   - `7349/tcp` — gRPC

3. **SSH in and deploy:**

```bash
ssh -i your-key.pem ubuntu@<SERVER_IP>
sudo apt update && sudo apt install -y docker.io docker-compose-v2
git clone https://github.com/Krunal96369/tictactoe-nakama.git
cd tictactoe-nakama
sudo docker compose up --build -d
```

4. **Verify:** Visit `http://<SERVER_IP>:7351` for the Nakama Console.

### Frontend — Vercel *(or any static host)*

```bash
cd frontend
npm run build
# Deploy the `dist/` folder to Vercel, Netlify, or any static host
```

Make sure `nakama.ts` points to your production server IP before building.

---

## How to Test Multiplayer

1. Open the game URL in **two separate browser windows** (or Chrome + Firefox).
2. Enter a different nickname in each.
3. Both click **Play** — the matchmaker pairs them within ~10 seconds.
4. Play the game — moves appear in real-time on both screens.
5. After game over:
   - **Rematch** — both click Rematch to start a new round instantly.
   - **Leave** — returns to lobby for a new opponent.
   - If one player leaves, the other sees "Opponent left the match".
6. Close a browser mid-game — the remaining player wins by disconnect.

---

## Server Configuration

| Setting | Value | Notes |
|---------|-------|-------|
| Server Key | `defaultkey` | Change for production via `--socket.server_key` |
| Client Port | `7350` | HTTP + WebSocket |
| Console Port | `7351` | Admin dashboard |
| gRPC Port | `7349` | Server-to-server |
| Tick Rate | 1/sec | Match loop frequency |
| Min Players | 2 | Matchmaker requirement |
| Max Players | 2 | Enforced in `MatchJoinAttempt` |

---

## Features

### Core
- ✅ Server-authoritative game logic (all validation on server)
- ✅ Automatic matchmaking (Nakama Matchmaker API)
- ✅ Real-time state sync via WebSocket
- ✅ Player nicknames displayed in-game
- ✅ Graceful disconnect handling (auto-win for remaining player)
- ✅ Rematch system (both players vote → instant new game)

### Bonus
- ✅ Timer-based game mode (30s per turn)
- ✅ Leaderboard system (wins, losses, draws, win streaks — Nakama Leaderboard + Storage APIs)
- ✅ Concurrent game support (Nakama handles session isolation)

---

## License

MIT
