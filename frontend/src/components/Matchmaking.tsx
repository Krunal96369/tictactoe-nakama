import { useEffect, useRef, useState } from 'react'
import { client } from '../nakama'
import type { Session, Socket } from '@heroiclabs/nakama-js'
import type { MatchInfo } from '../App'

interface Props {
    session: Session
    onMatchFound: (info: MatchInfo) => void
    onCancel: () => void
}

export default function Matchmaking({ session, onMatchFound, onCancel }: Props) {
    const [status, setStatus] = useState('Finding a random player...')
    const socketRef = useRef<Socket | null>(null)
    const matchFoundRef = useRef(false)

    useEffect(() => {
        let cancelled = false

        async function startMatchmaking() {
            const socket = client.createSocket(false, false)
            socketRef.current = socket
            await socket.connect(session, true)

            socket.onmatchmakermatched = (matched) => {
                if (cancelled) return
                socket.joinMatch(matched.match_id ?? '', matched.token).then(match => {
                    matchFoundRef.current = true
                    onMatchFound({ matchId: match.match_id, session, socket })
                })
            }

            await socket.addMatchmaker('*', 2, 2)
            setStatus('Finding a random player...\nIt usually takes 20 seconds.')
        }

        startMatchmaking()

        return () => {
            cancelled = true
            // Only disconnect if match was NOT found (i.e., user cancelled)
            if (!matchFoundRef.current) {
                socketRef.current?.disconnect(true)
            }
        }
    }, [session, onMatchFound])

    return (
        <div className="bg-gray-900 rounded-2xl p-8 w-80 flex flex-col gap-6 shadow-xl items-center">
            <h1 className="text-2xl font-bold text-teal-400">Tic Tac Toe</h1>
            <div className="w-10 h-10 border-4 border-teal-400 border-t-transparent rounded-full animate-spin" />
            <p className="text-gray-300 text-center whitespace-pre-line text-sm">{status}</p>
            <button
                className="text-gray-500 hover:text-white text-sm underline transition"
                onClick={onCancel}
            >
                Cancel
            </button>
        </div>
    )
}
