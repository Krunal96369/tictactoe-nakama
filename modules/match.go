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
	Game    GameState
	Players map[string]string // presenceID -> "X" or "O"
}

type MoveMessage struct {
	Position int `json:"position"`
}

func (m *Match) MatchInit(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, params map[string]interface{}) (interface{}, int, string) {
	state := &MatchState{
		Players: make(map[string]string),
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
		if len(mState.Players) == 0 {
			mState.Players[p.GetUserId()] = "X"
			mState.Game.XPlayer = p.GetUserId()
		} else {
			mState.Players[p.GetUserId()] = "O"
			mState.Game.OPlayer = p.GetUserId()
		}
	}
	broadcastState(dispatcher, &mState.Game)
	return mState
}

func (m *Match) MatchLeave(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, presences []runtime.Presence) interface{} {
	mState := state.(*MatchState)
	for _, p := range presences {
		delete(mState.Players, p.GetUserId())
	}
	if len(mState.Players) < 2 && mState.Game.Winner == "" && !mState.Game.Draw {
		mState.Game.Winner = "disconnect"
		broadcastState(dispatcher, &mState.Game)
	}
	return mState
}

func (m *Match) MatchLoop(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, messages []runtime.MatchData) interface{} {
	mState := state.(*MatchState)

	if mState.Game.Winner != "" || mState.Game.Draw {
		return mState
	}

	for _, msg := range messages {
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
	return state
}

func (m *Match) MatchSignal(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, dispatcher runtime.MatchDispatcher, tick int64, state interface{}, data string) (interface{}, string) {
	return state, ""
}

func broadcastState(dispatcher runtime.MatchDispatcher, game *GameState) {
	data, _ := json.Marshal(game)
	dispatcher.BroadcastMessage(1, data, nil, nil, true)
}
