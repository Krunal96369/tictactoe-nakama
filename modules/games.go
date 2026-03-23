package main

type Board [9]string

type GameState struct {
	Board   Board  `json:"board"`
	Turn    string `json:"turn"`
	Winner  string `json:"winner"`
	Draw    bool   `json:"draw"`
	XPlayer string `json:"x_player"`
	OPlayer string `json:"o_player"`
}

func checkWinner(b Board) string {
	lines := [][3]int{
		{0, 1, 2}, {3, 4, 5}, {6, 7, 8},
		{0, 3, 6}, {1, 4, 7}, {2, 5, 8},
		{0, 4, 8}, {2, 4, 6},
	}
	for _, l := range lines {
		if b[l[0]] != "" && b[l[0]] == b[l[1]] && b[l[1]] == b[l[2]] {
			return b[l[0]]
		}
	}
	return ""
}

func isDraw(b Board) bool {
	for _, cell := range b {
		if cell == "" {
			return false
		}
	}
	return true
}
