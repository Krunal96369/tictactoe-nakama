import type { Session, Socket } from '@heroiclabs/nakama-js'
import { useEffect, useRef, useState } from 'react'
import type { MatchInfo } from '../App'
import { client } from '../nakama'
import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../ThemeContext'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

interface GameState {
    board: string[]
    turn: string
    winner: string
    draw: boolean
    x_player: string
    o_player: string
    x_name: string
    o_name: string
    turn_time_left: number
    timed_out: boolean
}

interface Props {
    session: Session
    matchInfo: MatchInfo
    onPlayAgain: () => void
    onLeave: () => void
    pendingStateRef: React.MutableRefObject<string | null>
}

export default function Game({ session, matchInfo, onPlayAgain, onLeave, pendingStateRef }: Props) {
    const { palette } = useTheme()
    const [gameState, setGameState] = useState<GameState | null>(null)
    const [rematchRequested, setRematchRequested] = useState(false)
    const [opponentLeft, setOpponentLeft] = useState(false)
    const socketRef = useRef<Socket | null>(matchInfo.socket)
    const myUserId = session.user_id!

    const [connectionLost, setConnectionLost] = useState(false)
    const [reconnectFailed, setReconnectFailed] = useState(false)
    const gameOverRef = useRef(false)
    const intentionalLeaveRef = useRef(false)

    useEffect(() => {
        if (gameState?.winner || gameState?.draw) gameOverRef.current = true
    }, [gameState?.winner, gameState?.draw])

    useEffect(() => {
        const socket = matchInfo.socket
        socketRef.current = socket

        socket.onmatchdata = (data) => {
            if (data.op_code === 4) return // rematch vote count
            if (data.op_code === 5) {
                setOpponentLeft(true)
                return
            }

            const state = JSON.parse(new TextDecoder().decode(data.data)) as GameState
            setGameState(state)

            if (state.winner === '' && !state.draw) {
                setRematchRequested(false)
            }
        }

        socket.ondisconnect = () => {
            if (gameOverRef.current || intentionalLeaveRef.current) return

            setConnectionLost(true)
            let retries = 0
            const maxRetries = 3

            const tryReconnect = async () => {
                if (retries >= maxRetries) {
                    setConnectionLost(false)
                    setReconnectFailed(true)
                    return
                }
                retries++
                try {
                    const useSSL = typeof client.useSSL !== 'undefined' ? client.useSSL : window.location.protocol === 'https:'
                    const newSocket = client.createSocket(useSSL, false)
                    await newSocket.connect(session, true)
                    await newSocket.joinMatch(matchInfo.matchId)
                    socketRef.current = newSocket
                    matchInfo.socket = newSocket

                    newSocket.onmatchdata = socket.onmatchdata
                    newSocket.ondisconnect = socket.ondisconnect
                    newSocket.sendMatchState(matchInfo.matchId, 0, '')
                    setConnectionLost(false)
                } catch {
                    setTimeout(tryReconnect, 2000 * retries)
                }
            }
            setTimeout(tryReconnect, 1000)
        }

        if (pendingStateRef.current) {
            setGameState(JSON.parse(pendingStateRef.current) as GameState)
            pendingStateRef.current = null
        }

        socket.sendMatchState(matchInfo.matchId, 0, '')

        const onUnload = () => socket.disconnect(true)
        window.addEventListener('beforeunload', onUnload)
        return () => window.removeEventListener('beforeunload', onUnload)
    }, [matchInfo, session, pendingStateRef])

    function handlePlayAgain() {
        if (!socketRef.current) return
        socketRef.current.sendMatchState(matchInfo.matchId, 3, '')
        setRematchRequested(true)
    }

    function cancelRematch() {
        setRematchRequested(false)
    }

    function handleLeave() {
        intentionalLeaveRef.current = true
        matchInfo.socket.disconnect(true)
        onLeave()
    }

    function handleNewMatch() {
        intentionalLeaveRef.current = true
        matchInfo.socket.disconnect(true)
        onPlayAgain()
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
            <div className="flex items-center justify-center p-12">
                <motion.div
                   animate={{ rotate: 360 }}
                   transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                   className="w-8 h-8 rounded-full border-t-2 border-r-2 border-zinc-100"
                />
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
        if (gameState!.draw) return "It's a Draw"
        if (gameState!.winner === 'disconnect') return `${oppName || 'Opponent'} disconnected`
        if (gameState!.timed_out) {
            return gameState!.winner === myMark ? "Opponent timed out" : "Time's up"
        }
        return gameState!.winner === myMark ? 'Victory' : 'Defeat'
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            className="bg-zinc-900/40 backdrop-blur-3xl border border-zinc-800/60 rounded-3xl p-8 w-[380px] flex flex-col gap-6 shadow-2xl"
        >
            <AnimatePresence>
                {connectionLost && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-yellow-500/10 border border-yellow-500/20 text-yellow-500 text-sm px-4 py-3 rounded-xl text-center">
                        Connection lost. Reconnecting...
                    </motion.div>
                )}
                {reconnectFailed && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="bg-red-500/10 border border-red-500/20 text-red-500 text-sm px-4 py-3 rounded-xl text-center">
                        Could not reconnect.
                        <button onClick={handleLeave} className="underline ml-2 font-medium">Return</button>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="flex justify-between items-center px-1">
                <div className="flex flex-col">
                    <span className={cn("text-xs font-semibold tracking-widest uppercase mb-1", myMark === 'X' ? palette.xColor : palette.oColor)}>You ({myMark})</span>
                    <span className="text-zinc-100 font-medium truncate max-w-[120px]">{myName || 'Player'}</span>
                </div>
                <div className="text-zinc-700 text-lg font-light italic">vs</div>
                <div className="flex flex-col text-right">
                    <span className={cn("text-xs font-semibold tracking-widest uppercase mb-1", opponentMark === 'X' ? palette.xColor : palette.oColor)}>Opp ({opponentMark})</span>
                    <span className="text-zinc-400 font-medium truncate max-w-[120px]">{oppName || 'Opponent'}</span>
                </div>
            </div>

            <div className="h-14 flex items-center justify-center">
                {!gameOver ? (
                    <div className="flex flex-col items-center">
                        <motion.span 
                            key={isMyTurn ? "my" : "opp"}
                            initial={{ opacity: 0, y: 5 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={cn("text-sm font-medium tracking-wide mb-1", isMyTurn ? "text-zinc-100" : "text-zinc-500")}
                        >
                            {isMyTurn ? 'Your turn' : "Opponent's turn"}
                        </motion.span>
                        <span className={cn(
                            "text-xl font-light tabular-nums transition-colors duration-300",
                            gameState.turn_time_left <= 5 ? "text-red-400" :
                            gameState.turn_time_left <= 10 ? "text-orange-300" : "text-zinc-400"
                        )}>
                            0:{gameState.turn_time_left.toString().padStart(2, '0')}
                        </span>
                    </div>
                ) : (
                    <motion.div
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="text-2xl font-semibold tracking-tight text-white"
                    >
                        {getResult()}
                    </motion.div>
                )}
            </div>

            <div className="grid grid-cols-3 grid-rows-3 gap-3 w-full aspect-square">
                {gameState.board.map((cell, i) => {
                    const isEmpty = cell === ''
                    const isInteractable = isEmpty && isMyTurn && !gameOver
                    return (
                        <button
                            key={i}
                            onClick={() => sendMove(i)}
                            disabled={!isInteractable}
                            className={cn(
                                "rounded-2xl flex items-center justify-center text-5xl font-light shadow-inner transition-colors duration-300",
                                isInteractable ? "bg-zinc-800/40 hover:bg-zinc-700/50 cursor-pointer" : "bg-zinc-900/40 cursor-default",
                            )}
                        >
                            <AnimatePresence>
                                {cell && (
                                    <motion.span
                                        initial={{ scale: 0.3, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 1 }}
                                        transition={{ type: "spring", stiffness: 350, damping: 25 }}
                                        className={cell === 'X' ? palette.xColor : palette.oColor}
                                    >
                                        {cell}
                                    </motion.span>
                                )}
                            </AnimatePresence>
                        </button>
                    )
                })}
            </div>

            {gameOver && (
                <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center gap-3 mt-2"
                >
                    {(opponentLeft || gameState.winner === 'disconnect') ? (
                        <>
                            <p className="text-zinc-500 text-sm">Opponent left the match</p>
                            <div className="flex gap-3 w-full">
                                <button
                                    className="flex-1 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 rounded-xl transition duration-200"
                                    onClick={handleNewMatch}
                                >
                                    New Match
                                </button>
                                <button
                                    className="flex-1 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-300 font-medium py-3 rounded-xl transition duration-200"
                                    onClick={handleLeave}
                                >
                                    Leave
                                </button>
                            </div>
                        </>
                    ) : rematchRequested ? (
                        <div className="flex flex-col items-center w-full gap-3">
                            <p className="text-zinc-400 text-sm animate-pulse">Waiting for opponent...</p>
                            <button
                                className="text-zinc-500 hover:text-zinc-300 text-sm tracking-widest font-semibold uppercase transition"
                                onClick={cancelRematch}
                            >
                                Cancel
                            </button>
                        </div>
                    ) : (
                        <div className="flex gap-3 w-full">
                            <button
                                className="flex-1 bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 flex items-center justify-center rounded-xl transition duration-200"
                                onClick={handlePlayAgain}
                                disabled={gameState.winner === 'disconnect'}
                            >
                                Rematch
                            </button>
                            <button
                                className="flex-1 bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-300 font-medium py-3 rounded-xl transition duration-200"
                                onClick={handleLeave}
                            >
                                Leave
                            </button>
                        </div>
                    )}
                </motion.div>
            )}
        </motion.div>
    )
}
