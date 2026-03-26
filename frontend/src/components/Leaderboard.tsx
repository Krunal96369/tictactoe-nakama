import type { Session } from '@heroiclabs/nakama-js'
import { useEffect, useState } from 'react'
import { client } from '../nakama'
import { motion } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

interface LeaderboardEntry {
    rank: number
    user_id: string
    username: string
    wins: number
    losses: number
    draws: number
    current_streak: number
    best_streak: number
}

interface Props {
    session: Session
    onBack: () => void
}

const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    visible: { opacity: 1, y: 0 }
}

export default function Leaderboard({ session, onBack }: Props) {
    const [entries, setEntries] = useState<LeaderboardEntry[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState('')

    function fetchLeaderboard() {
        setLoading(true)
        setError('')
        client.rpc(session, 'get_leaderboard', {})
            .then((result) => {
                const data = result.payload as { entries: LeaderboardEntry[] }
                setEntries(data?.entries ?? [])
            })
            .catch(() => setError('Failed to load leaderboard.'))
            .finally(() => setLoading(false))
    }

    useEffect(() => { fetchLeaderboard() }, [session])

    return (
        <motion.div 
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4 }}
            className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-3xl p-8 w-[450px] flex flex-col gap-6 shadow-2xl max-h-[80vh] overflow-hidden"
        >
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold tracking-tight text-white">Standings</h2>
                <div className="flex gap-4">
                    <button
                        onClick={fetchLeaderboard}
                        disabled={loading}
                        className="text-xs font-semibold tracking-widest text-zinc-500 hover:text-zinc-300 uppercase transition-colors disabled:opacity-50"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={onBack}
                        className="text-xs font-semibold tracking-widest text-zinc-300 hover:text-white uppercase transition-colors"
                    >
                        Back
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex justify-center items-center py-20 flex-1">
                    <motion.div
                       animate={{ rotate: 360 }}
                       transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                       className="w-8 h-8 rounded-full border-t-2 border-r-2 border-zinc-100"
                    />
                </div>
            )}

            {error && (
                <div className="flex-1 flex items-center justify-center p-8">
                    <p className="text-red-400 text-sm text-center">{error}</p>
                </div>
            )}

            {!loading && !error && entries.length === 0 && (
                <div className="flex-1 flex items-center justify-center py-20">
                    <p className="text-zinc-500 text-sm text-center">No games played yet.</p>
                </div>
            )}

            {!loading && entries.length > 0 && (
                <div className="overflow-y-auto pr-2 -mr-2 scrollbar-hide flex-1">
                    <table className="w-full text-sm font-medium text-left border-collapse">
                        <thead className="sticky top-0 bg-zinc-900/90 backdrop-blur z-10 text-xs text-zinc-500 uppercase tracking-widest">
                            <tr>
                                <th className="py-3 px-2 font-semibold border-b border-zinc-800/50">#</th>
                                <th className="py-3 px-2 font-semibold border-b border-zinc-800/50">Player</th>
                                <th className="py-3 px-2 font-semibold border-b border-zinc-800/50 text-center text-zinc-100">W</th>
                                <th className="py-3 px-2 font-semibold border-b border-zinc-800/50 text-center">L</th>
                                <th className="py-3 px-2 font-semibold border-b border-zinc-800/50 text-center hidden sm:table-cell">D</th>
                                <th className="py-3 px-2 font-semibold border-b border-zinc-800/50 text-center">Strk</th>
                            </tr>
                        </thead>
                        <motion.tbody
                            initial="hidden"
                            animate="visible"
                            variants={{
                                visible: { transition: { staggerChildren: 0.05 } }
                            }}
                        >
                            {entries.map((e) => (
                                <motion.tr
                                    variants={itemVariants}
                                    key={e.user_id}
                                    className={cn(
                                        "border-b border-zinc-800/30 transition-colors hover:bg-zinc-800/20",
                                        e.user_id === session.user_id ? "text-zinc-100 bg-zinc-800/10" : "text-zinc-400"
                                    )}
                                >
                                    <td className="py-4 px-2">
                                        <span className={cn(
                                            "inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold",
                                            e.rank === 1 ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 
                                            e.rank === 2 ? 'bg-zinc-400/10 text-zinc-300 border border-zinc-400/20' : 
                                            e.rank === 3 ? 'bg-orange-600/10 text-orange-500 border border-orange-600/20' : 
                                            'text-zinc-600'
                                        )}>
                                            {e.rank}
                                        </span>
                                    </td>
                                    <td className="py-4 px-2 truncate max-w-[120px] font-semibold">{e.username || '—'}</td>
                                    <td className="py-4 px-2 text-center text-zinc-200">{e.wins}</td>
                                    <td className="py-4 px-2 text-center opacity-60">{e.losses}</td>
                                    <td className="py-4 px-2 text-center opacity-40 hidden sm:table-cell">{e.draws}</td>
                                    <td className="py-4 px-2 text-center text-zinc-300">
                                        {e.current_streak > 2 ? <span className="text-amber-500 mr-1">🔥</span> : null}
                                        {e.current_streak}
                                    </td>
                                </motion.tr>
                            ))}
                        </motion.tbody>
                    </table>
                </div>
            )}
        </motion.div>
    )
}
