package main

import (
	"context"
	"database/sql"
	"encoding/json"

	"github.com/heroiclabs/nakama-common/runtime"
)

const leaderboardID   = "tictactoe_wins"
const statsCollection = "player_stats"
const statsKey        = "stats"

type PlayerStats struct {
	Wins          int `json:"wins"`
	Losses        int `json:"losses"`
	Draws         int `json:"draws"`
	CurrentStreak int `json:"current_streak"`
	BestStreak    int `json:"best_streak"`
}

type LeaderboardEntry struct {
	Rank          int    `json:"rank"`
	UserID        string `json:"user_id"`
	Username      string `json:"username"`
	Wins          int    `json:"wins"`
	Losses        int    `json:"losses"`
	Draws         int    `json:"draws"`
	CurrentStreak int    `json:"current_streak"`
	BestStreak    int    `json:"best_streak"`
}

// recordGameResult records the outcome of a completed game (normal win, draw, or timeout).
// For draws, pass isDraw=true; both XPlayer and OPlayer are treated as participants.
func recordGameResult(ctx context.Context, nk runtime.NakamaModule, logger runtime.Logger, game *GameState, isDraw bool) {
	if isDraw {
		updateStats(ctx, nk, logger, game.XPlayer, false, true)
		updateStats(ctx, nk, logger, game.OPlayer, false, true)
		return
	}

	var winnerID, loserID, winnerName string
	if game.Winner == "X" {
		winnerID, loserID, winnerName = game.XPlayer, game.OPlayer, game.XName
	} else if game.Winner == "O" {
		winnerID, loserID, winnerName = game.OPlayer, game.XPlayer, game.OName
	} else {
		return // unrecognised winner mark — skip
	}

	if _, err := nk.LeaderboardRecordWrite(ctx, leaderboardID, winnerID, winnerName, 1, 0, nil, nil); err != nil {
		logger.Error("LeaderboardRecordWrite failed for %s: %v", winnerID, err)
	}
	updateStats(ctx, nk, logger, winnerID, true, false)
	updateStats(ctx, nk, logger, loserID, false, false)
}

// recordDisconnectResult records a mid-game disconnect win for the remaining player.
// Looks up the winner's display name from their Nakama account.
func recordDisconnectResult(ctx context.Context, nk runtime.NakamaModule, logger runtime.Logger, winnerID, loserID string) {
	winnerName := ""
	if account, err := nk.AccountGetId(ctx, winnerID); err == nil {
		winnerName = account.GetUser().GetDisplayName()
		if winnerName == "" {
			winnerName = account.GetUser().GetUsername()
		}
	}
	if _, err := nk.LeaderboardRecordWrite(ctx, leaderboardID, winnerID, winnerName, 1, 0, nil, nil); err != nil {
		logger.Error("LeaderboardRecordWrite failed for %s: %v", winnerID, err)
	}
	updateStats(ctx, nk, logger, winnerID, true, false)
	updateStats(ctx, nk, logger, loserID, false, false)
}

// updateStats reads, mutates, and writes back PlayerStats for a single user.
func updateStats(ctx context.Context, nk runtime.NakamaModule, logger runtime.Logger, userID string, win, draw bool) {
	existing, err := nk.StorageRead(ctx, []*runtime.StorageRead{
		{Collection: statsCollection, Key: statsKey, UserID: userID},
	})
	stats := &PlayerStats{}
	if err == nil && len(existing) > 0 {
		if jsonErr := json.Unmarshal([]byte(existing[0].Value), stats); jsonErr != nil {
			logger.Error("Failed to unmarshal stats for %s: %v", userID, jsonErr)
		}
	}

	if win {
		stats.Wins++
		stats.CurrentStreak++
		if stats.CurrentStreak > stats.BestStreak {
			stats.BestStreak = stats.CurrentStreak
		}
	} else if draw {
		stats.Draws++ // streak unchanged on draw
	} else {
		stats.Losses++
		stats.CurrentStreak = 0
	}

	data, _ := json.Marshal(stats)
	if _, err := nk.StorageWrite(ctx, []*runtime.StorageWrite{
		{
			Collection:      statsCollection,
			Key:             statsKey,
			UserID:          userID,
			Value:           string(data),
			PermissionRead:  2, // public read
			PermissionWrite: 0, // server-only writes
		},
	}); err != nil {
		logger.Error("StorageWrite failed for %s: %v", userID, err)
	}
}

// GetLeaderboard is an RPC handler that returns the top 10 players by wins,
// enriched with full stats (losses, draws, streaks) from Storage.
func GetLeaderboard(ctx context.Context, logger runtime.Logger, db *sql.DB, nk runtime.NakamaModule, payload string) (string, error) {
	records, _, _, _, err := nk.LeaderboardRecordsList(ctx, leaderboardID, nil, 10, "", 0)
	if err != nil {
		logger.Error("LeaderboardRecordsList failed: %v", err)
		return "", err
	}

	entries := make([]LeaderboardEntry, 0, len(records))
	for i, r := range records {
		entry := LeaderboardEntry{
			Rank:     i + 1,
			UserID:   r.OwnerId,
			Username: r.Username.GetValue(),
			Wins:     int(r.Score),
		}
		storageRecords, err := nk.StorageRead(ctx, []*runtime.StorageRead{
			{Collection: statsCollection, Key: statsKey, UserID: r.OwnerId},
		})
		if err == nil && len(storageRecords) > 0 {
			var stats PlayerStats
			if json.Unmarshal([]byte(storageRecords[0].Value), &stats) == nil {
				entry.Losses        = stats.Losses
				entry.Draws         = stats.Draws
				entry.CurrentStreak = stats.CurrentStreak
				entry.BestStreak    = stats.BestStreak
			}
		}
		entries = append(entries, entry)
	}

	resp, _ := json.Marshal(map[string]interface{}{"entries": entries})
	return string(resp), nil
}
