package main

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

const tickRate = 1

type Match struct{}

type MatchState struct {
	Game         GameState
	Players      map[string]string // userID -> "X" or "O"
	RematchVotes map[string]bool   // userID -> voted for rematch
	Ending       bool
}

type MoveMessage struct {
	Position int `json:"position"`
}

func (m *Match) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	state := &MatchState{
		Players:      make(map[string]string),
		RematchVotes: make(map[string]bool),
		Game: GameState{
			Board: Board{},
			Turn:  "X",
		},
	}
	return state, tickRate, ""
}

func (m *Match) MatchJoinAttempt(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presence runtime.Presence, metadata map[string]string) (interface{}, bool, string) {
	mState := state.(*MatchState)
	if len(mState.Players) >= 2 {
		return state, false, "match full"
	}
	return state, true, ""
}

func (m *Match) MatchJoin(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	mState := state.(*MatchState)
	for _, p := range presences {
		// Look up the display name from the account (updated each login)
		displayName := p.GetUsername()
		if account, err := nk.AccountGetId(ctx, p.GetUserId()); err == nil && account.User.DisplayName != "" {
			displayName = account.User.DisplayName
		}

		if len(mState.Players) == 0 {
			mState.Players[p.GetUserId()] = "X"
			mState.Game.XPlayer = p.GetUserId()
			mState.Game.XName = displayName
		} else {
			mState.Players[p.GetUserId()] = "O"
			mState.Game.OPlayer = p.GetUserId()
			mState.Game.OName = displayName
		}
	}
	broadcastState(dispatcher, &mState.Game)
	return mState
}

func (m *Match) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	mState := state.(*MatchState)
	for _, p := range presences {
		delete(mState.Players, p.GetUserId())
		delete(mState.RematchVotes, p.GetUserId())
	}
	if len(mState.Players) < 2 {
		if mState.Game.Winner == "" && !mState.Game.Draw {
			// Mid-game disconnect
			mState.Game.Winner = "disconnect"
			broadcastState(dispatcher, &mState.Game)
		} else {
			// Post-game leave — notify remaining player (opcode 5)
			dispatcher.BroadcastMessage(5, []byte(`{"reason":"opponent_left"}`), nil, nil, true)
		}
		// Give the remaining player a moment to receive the message,
		// then kill the match on the next tick
		mState.Ending = true
	}
	return mState
}

func (m *Match) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	mState := state.(*MatchState)

	// Kill match if it's winding down
	if mState.Ending {
		return nil // returning nil terminates the match
	}

	for _, msg := range messages {
		// Opcode 0 = state request (client ready) — reply only to sender
		if msg.GetOpCode() == 0 {
			data, _ := json.Marshal(&mState.Game)
			dispatcher.BroadcastMessage(1, data, []runtime.Presence{msg}, nil, true)
			continue
		}

		// Opcode 3 = rematch request
		if msg.GetOpCode() == 3 {
			mState.RematchVotes[msg.GetUserId()] = true
			// Notify all players about the pending rematch vote (opcode 4)
			voteData, _ := json.Marshal(map[string]int{"votes": len(mState.RematchVotes)})
			dispatcher.BroadcastMessage(4, voteData, nil, nil, true)
			// If both players voted, reset the game
			if len(mState.RematchVotes) >= 2 {
				mState.Game.Board = Board{}
				mState.Game.Turn = "X"
				mState.Game.Winner = ""
				mState.Game.Draw = false
				mState.RematchVotes = make(map[string]bool)
				broadcastState(dispatcher, &mState.Game)
			}
			continue
		}

		// Skip move processing if game is over
		if mState.Game.Winner != "" || mState.Game.Draw {
			continue
		}

		var move MoveMessage
		if err := json.Unmarshal(msg.GetData(), &move); err != nil {
			continue
		}

		playerMark, ok := mState.Players[msg.GetUserId()]
		if !ok {
			continue
		}
		if playerMark != mState.Game.Turn {
			continue
		}
		if move.Position < 0 || move.Position > 8 {
			continue
		}
		if mState.Game.Board[move.Position] != "" {
			continue
		}

		mState.Game.Board[move.Position] = playerMark

		if winner := checkWinner(mState.Game.Board); winner != "" {
			mState.Game.Winner = winner
		} else if isDraw(mState.Game.Board) {
			mState.Game.Draw = true
		} else {
			if mState.Game.Turn == "X" {
				mState.Game.Turn = "O"
			} else {
				mState.Game.Turn = "X"
			}
		}

		broadcastState(dispatcher, &mState.Game)
	}

	return mState
}

func (m *Match) MatchTerminate(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, graceSeconds int) interface{} {
	return nil
}

func (m *Match) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
}

func broadcastState(dispatcher runtime.MatchDispatcher, game *GameState) {
	data, _ := json.Marshal(game)
	dispatcher.BroadcastMessage(1, data, nil, nil, true)
}
