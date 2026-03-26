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

	// Create wins leaderboard — idempotent, safe to call on every startup.
	if err := nk.LeaderboardCreate(ctx, leaderboardID, true, "desc", "incr", "", nil); err != nil {
		logger.Error("LeaderboardCreate failed: %v", err)
		return err
	}

	if err := initializer.RegisterRpc("get_leaderboard", GetLeaderboard); err != nil {
		return err
	}

	logger.Info("TicTacToe module loaded")
	return nil
}

func MakeMatch(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, entries []runtime.MatchmakerEntry) (string, error) {
	// Read game mode from the first entry's string properties (all entries share the same mode via matchmaker query)
	mode := "timed"
	if len(entries) > 0 {
		if m, ok := entries[0].GetProperties()["mode"]; ok {
			if s, ok := m.(string); ok && s == "classic" {
				mode = "classic"
			}
		}
	}

	matchID, err := nk.MatchCreate(ctx, "tictactoe", map[string]interface{}{"mode": mode})
	if err != nil {
		return "", err
	}
	return matchID, nil
}
