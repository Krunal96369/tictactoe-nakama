import type { Session, Socket } from '@heroiclabs/nakama-js'
import { useEffect, useRef, useState } from 'react'
import type { MatchInfo } from '../App'

interface GameState {
    board: string[]
    turn: string
    winner: string
    draw: boolean
    x_player: string
    o_player: string
}

interface Props {
    session: Session
    matchInfo: MatchInfo
    onPlayAgain: () => void
}

export default function Game({ session, matchInfo, onPlayAgain }: Props) {
    const [gameState, setGameState] = useState<GameState | null>(null)
    const socketRef = useRef<Socket | null>(matchInfo.socket)
    const myUserId = session.user_id!

    useEffect(() => {
        const socket = matchInfo.socket
        socketRef.current = socket

        socket.onmatchdata = (data) => {
            const state = JSON.parse(new TextDecoder().decode(data.data)) as GameState
            setGameState(state)
        }

        // Ask server to re-send current state now that our handler is ready
        socket.sendMatchState(matchInfo.matchId, 0, '')

        return () => {
            socket.disconnect(true)
        }
    }, [matchInfo])

    function sendMove(position: number) {
        if (!gameState || !socketRef.current) return
        if (gameState.winner || gameState.draw) return
        const myMark = gameState.x_player === myUserId ? 'X' : 'O'
        if (gameState.turn !== myMark) return
        if (gameState.board[position] !== '') return

        socketRef.current.sendMatchState(
            matchInfo.matchId,
            1,
            JSON.stringify({ position })
        )
    }

    if (!gameState) {
        return (
            <div className="flex items-center justify-center h-screen">
                <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
            </div>
        )
    }

    const myMark = gameState.x_player === myUserId ? 'X' : 'O'
    const opponentMark = myMark === 'X' ? 'O' : 'X'
    const isMyTurn = gameState.turn === myMark
    const gameOver = gameState.winner !== '' || gameState.draw

    function getResult() {
        if (gameState!.draw) return "It's a Draw!"
        if (gameState!.winner === 'disconnect') return 'Opponent disconnected. You win!'
        return gameState!.winner === myMark ? 'You Win!' : 'You Lose!'
    }

    return (
        <div className="bg-gray-900 rounded-2xl p-8 w-80 flex flex-col gap-4 shadow-xl items-center">
            <div className="flex justify-between w-full text-sm text-gray-400">
                <span className="text-teal-400 font-bold">You ({myMark})</span>
                <span>vs</span>
                <span className="font-bold">Opp ({opponentMark})</span>
            </div>

            {!gameOver && (
                <p className="text-sm text-gray-300">
                    {isMyTurn ? 'Your turn' : "Opponent's turn"}
                </p>
            )}

            <div className="grid grid-cols-3 gap-2 w-full">
                {gameState.board.map((cell, i) => (
                    <button
                        key={i}
                        onClick={() => sendMove(i)}
                        className={`h-20 rounded-xl text-3xl font-bold transition
              ${cell === 'X' ? 'text-teal-400' : 'text-orange-400'}
              ${!cell && isMyTurn && !gameOver ? 'bg-gray-700 hover:bg-gray-600 cursor-pointer' : 'bg-gray-800 cursor-default'}
            `}
                    >
                        {cell}
                    </button>
                ))}
            </div>

            {gameOver && (
                <div className="flex flex-col items-center gap-3 mt-2">
                    <p className="text-xl font-bold text-teal-400">{getResult()}</p>
                    <button
                        className="bg-teal-500 hover:bg-teal-400 text-black font-bold py-2 px-6 rounded-lg transition"
                        onClick={onPlayAgain}
                    >
                        Play Again
                    </button>
                </div>
            )}
        </div>
    )
}
