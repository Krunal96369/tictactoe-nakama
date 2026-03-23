package main

import (
	"context"
	"database/sql"
	"github.com/heroiclabs/nakama-common/runtime"
)

func InitModule(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, initializer runtime.Initializer) error {
	if err := initializer.RegisterMatch("tictactoe", func(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule) (runtime.Match, error) {
		return &Match{}, nil
	}); err != nil {
		return err
	}

	if err := initializer.RegisterMatchmakerMatched(MakeMatch); err != nil {
		return err
	}

	logger.Info("TicTacToe module loaded")
	return nil
}

func MakeMatch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, entries []runtime.MatchmakerEntry) (string, error) {
	matchID, err := nk.MatchCreate(ctx, "tictactoe", map[string]interface{}{})
	if err != nil {
		return "", err
	}
	return matchID, nil
}
