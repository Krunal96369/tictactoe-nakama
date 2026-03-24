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
    x_name: string
    o_name: string
}

interface Props {
    session: Session
    matchInfo: MatchInfo
    onPlayAgain: () => void
}

export default function Game({ session, matchInfo, onPlayAgain }: Props) {
    const [gameState, setGameState] = useState<GameState | null>(null)
    const [rematchRequested, setRematchRequested] = useState(false)
    const [opponentLeft, setOpponentLeft] = useState(false)
    const socketRef = useRef<Socket | null>(matchInfo.socket)
    const myUserId = session.user_id!

    useEffect(() => {
        const socket = matchInfo.socket
        socketRef.current = socket

        socket.onmatchdata = (data) => {
            if (data.op_code === 4) {
                // Opcode 4 = rematch vote count — ignore, just wait for board reset
                return
            }
            if (data.op_code === 5) {
                // Opcode 5 = opponent left after game over
                setOpponentLeft(true)
                return
            }
            
            // Opcode 1 or 0 response = game state
            const state = JSON.parse(new TextDecoder().decode(data.data)) as GameState
            setGameState(state)
            
            // If the state reflects an in-progress game (no winner, not draw),
            // it means a rematch just started (or it's the first match). Reset our local flag.
            if (state.winner === '' && !state.draw) {
                setRematchRequested(false)
            }
        }

        // Check for state captured by Matchmaking's early handler
        const pending = (socket as any).__pendingState
        if (pending) {
            setGameState(JSON.parse(pending) as GameState)
            delete (socket as any).__pendingState
        }

        // Also ask server to re-send state (belt-and-suspenders)
        socket.sendMatchState(matchInfo.matchId, 0, '')

        // Disconnect on page close (not in cleanup — StrictMode would kill the socket)
        const onUnload = () => socket.disconnect(true)
        window.addEventListener('beforeunload', onUnload)
        return () => window.removeEventListener('beforeunload', onUnload)
    }, [matchInfo])

    function handlePlayAgain() {
        if (!socketRef.current) return
        socketRef.current.sendMatchState(matchInfo.matchId, 3, '')
        setRematchRequested(true)
    }

    function cancelRematch() {
        setRematchRequested(false)
    }

    function handleLeave() {
        matchInfo.socket.disconnect(true)
        onPlayAgain() // App.tsx will go back to matchmaking screen
    }

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
    const myName = myMark === 'X' ? gameState.x_name : gameState.o_name
    const oppName = myMark === 'X' ? gameState.o_name : gameState.x_name
    const isMyTurn = gameState.turn === myMark
    const gameOver = gameState.winner !== '' || gameState.draw

    function getResult() {
        if (gameState!.draw) return "It's a Draw!"
        if (gameState!.winner === 'disconnect') return `${oppName || 'Opponent'} disconnected. You win!`
        return gameState!.winner === myMark ? 'You Win!' : 'You Lose!'
    }

    return (
        <div className="bg-gray-900 rounded-2xl p-8 w-80 flex flex-col gap-4 shadow-xl items-center">
            <div className="flex justify-between w-full text-sm text-gray-400">
                <span className="text-teal-400 font-bold">{myName || 'You'} ({myMark})</span>
                <span>vs</span>
                <span className="font-bold">{oppName || 'Opp'} ({opponentMark})</span>
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
                    {opponentLeft ? (
                        <>
                            <p className="text-gray-400 text-sm">Opponent left the match</p>
                            <button
                                className="bg-teal-500 hover:bg-teal-400 text-black font-bold py-2 px-4 rounded-lg transition"
                                onClick={handleLeave}
                            >
                                Find New Match
                            </button>
                        </>
                    ) : rematchRequested ? (
                        <div className="flex flex-col items-center gap-2">
                            <p className="text-gray-400 text-sm animate-pulse">Waiting for opponent...</p>
                            <button
                                className="text-gray-500 hover:text-white text-sm underline transition"
                                onClick={cancelRematch}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3">
                            <button
                                className="bg-teal-500 hover:bg-teal-400 text-black font-bold py-2 px-4 rounded-lg transition"
                                onClick={handlePlayAgain}
                                disabled={gameState.winner === 'disconnect'}
                            >
                                Rematch
                            </button>
                            <button
                                className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 px-4 rounded-lg transition"
                                onClick={handleLeave}
                            >
                                Leave
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
