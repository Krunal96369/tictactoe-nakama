import { useEffect, useRef, useState } from 'react'
import { client } from '../nakama'
import type { Session, Socket } from '@heroiclabs/nakama-js'
import type { MatchInfo } from '../App'
import { motion } from 'framer-motion'

interface Props {
  session: Session
  onMatchFound: (info: MatchInfo, earlyState?: string) => void
  onCancel: () => void
}

export default function Matchmaking({ session, onMatchFound, onCancel }: Props) {
  const [status, setStatus] = useState('Finding a random player...')
  const socketRef = useRef<Socket | null>(null)
  const matchFoundRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    async function startMatchmaking() {
      const useSSL = typeof client.useSSL !== 'undefined' ? client.useSSL : window.location.protocol === 'https:'
      const socket = client.createSocket(useSSL, false)
      socketRef.current = socket
      await socket.connect(session, true)

      socket.onmatchmakermatched = (matched) => {
        if (cancelled) return
        let earlyState: string | undefined

        // Capture any state broadcast that arrives before Game mounts
        socket.onmatchdata = (data) => {
          earlyState = new TextDecoder().decode(data.data)
        }

        socket.joinMatch(matched.match_id ?? '', matched.token).then(match => {
          matchFoundRef.current = true
          onMatchFound({ matchId: match.match_id, session, socket }, earlyState)
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
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-3xl p-10 w-80 flex flex-col gap-8 items-center shadow-2xl"
    >
      <div className="relative flex items-center justify-center w-24 h-24">
        {/* Soft elegant pulsing ring */}
        <motion.div 
          animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
          transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
          className="absolute inset-0 rounded-full border border-zinc-500"
        />
        {/* Fast subtle spinner */}
        <motion.div
           animate={{ rotate: 360 }}
           transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
           className="absolute inset-2 rounded-full border-t-2 border-r-2 border-zinc-100"
        />
      </div>
      
      <div className="text-center">
        <h2 className="text-xl font-semibold text-zinc-100 mb-2">Searching</h2>
        <p className="text-zinc-400 text-sm whitespace-pre-line leading-relaxed">
          {status}
        </p>
      </div>

      <button
        className="text-zinc-500 hover:text-zinc-200 text-sm transition-colors uppercase tracking-widest font-semibold mt-4"
        onClick={onCancel}
      >
        Cancel
      </button>
    </motion.div>
  )
}
