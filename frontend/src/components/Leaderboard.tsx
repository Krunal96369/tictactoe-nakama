import type { Session } from '@heroiclabs/nakama-js'
import { useEffect, useState } from 'react'
import { client } from '../nakama'

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
        <div className="bg-gray-900 rounded-2xl p-6 w-96 flex flex-col gap-4 shadow-xl">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-teal-400">Leaderboard</h2>
                <div className="flex gap-3">
                    <button
                        onClick={fetchLeaderboard}
                        disabled={loading}
                        className="text-gray-400 hover:text-white text-sm underline transition disabled:opacity-50"
                    >
                        Refresh
                    </button>
                    <button
                        onClick={onBack}
                        className="text-gray-400 hover:text-white text-sm underline transition"
                    >
                        ← Back
                    </button>
                </div>
            </div>

            {loading && (
                <div className="flex justify-center py-8">
                    <div className="w-8 h-8 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
                </div>
            )}

            {error && (
                <p className="text-red-400 text-sm text-center">{error}</p>
            )}

            {!loading && !error && entries.length === 0 && (
                <p className="text-gray-500 text-sm text-center py-4">No games played yet.</p>
            )}

            {!loading && entries.length > 0 && (
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-gray-500 border-b border-gray-700">
                                <th className="text-left py-2 pr-2">#</th>
                                <th className="text-left py-2 pr-2">Player</th>
                                <th className="text-center py-2 px-1">W</th>
                                <th className="text-center py-2 px-1">L</th>
                                <th className="text-center py-2 px-1">D</th>
                                <th className="text-center py-2 px-1">Streak</th>
                                <th className="text-center py-2 pl-1">Best</th>
                            </tr>
                        </thead>
                        <tbody>
                            {entries.map((e) => (
                                <tr
                                    key={e.user_id}
                                    className={`border-b border-gray-800 ${
                                        e.user_id === session.user_id ? 'text-teal-400' : 'text-gray-300'
                                    }`}
                                >
                                    <td className="py-2 pr-2 font-bold">
                                        {e.rank === 1 ? '🥇' : e.rank === 2 ? '🥈' : e.rank === 3 ? '🥉' : e.rank}
                                    </td>
                                    <td className="py-2 pr-2 font-medium truncate max-w-[100px]">{e.username || '—'}</td>
                                    <td className="text-center py-2 px-1 text-teal-400 font-bold">{e.wins}</td>
                                    <td className="text-center py-2 px-1 text-orange-400">{e.losses}</td>
                                    <td className="text-center py-2 px-1 text-gray-400">{e.draws}</td>
                                    <td className="text-center py-2 px-1">{e.current_streak}</td>
                                    <td className="text-center py-2 pl-1 text-yellow-400">{e.best_streak}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    )
}
