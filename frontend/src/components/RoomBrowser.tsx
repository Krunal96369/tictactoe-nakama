import { useEffect, useRef, useState, useCallback } from 'react'
import { client } from '../nakama'
import type { Session, Socket } from '@heroiclabs/nakama-js'
import type { MatchInfo, GameMode } from '../App'
import { motion, AnimatePresence } from 'framer-motion'
import { cn } from './Lobby'

interface MatchLabel {
  mode: string
  creator: string
  players: number
  open: boolean
}

interface RoomEntry {
  matchId: string
  label: MatchLabel
}

interface Props {
  session: Session
  gameMode: GameMode
  onMatchFound: (info: MatchInfo, earlyState?: string) => void
  onCancel: () => void
}

type View = 'list' | 'waiting'

export default function RoomBrowser({ session, gameMode, onMatchFound, onCancel }: Props) {
  const [rooms, setRooms] = useState<RoomEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [view, setView] = useState<View>('list')
  const socketRef = useRef<Socket | null>(null)
  const matchFoundRef = useRef(false)
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchRooms = useCallback(async () => {
    try {
      // Fetch all authoritative matches and filter client-side.
      // Nakama's query parameter syntax varies by version, so parsing
      // the label JSON ourselves is the most reliable approach.
      const result = await client.listMatches(
        session,
        100,         // limit
        true,        // authoritative
        undefined,   // label
        0,           // minSize
        undefined,   // maxSize
        undefined    // query
      )
      const entries: RoomEntry[] = (result.matches || [])
        .filter(m => {
          if (!m.label || !m.match_id) return false
          try {
            const label = JSON.parse(m.label) as MatchLabel
            return label.open && label.mode === gameMode
          } catch {
            return false
          }
        })
        .map(m => ({
          matchId: m.match_id!,
          label: JSON.parse(m.label!) as MatchLabel,
        }))
      setRooms(entries)
    } catch (err) {
      console.error('Failed to fetch rooms:', err)
    } finally {
      setLoading(false)
    }
  }, [session, gameMode])

  // Poll room list every 4 seconds while on the list view
  useEffect(() => {
    if (view !== 'list') return
    fetchRooms()
    pollingRef.current = setInterval(fetchRooms, 4000)
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
  }, [view, fetchRooms])

  // Clean up socket on unmount if match wasn't found
  useEffect(() => {
    return () => {
      if (!matchFoundRef.current) {
        socketRef.current?.disconnect(true)
      }
    }
  }, [])

  async function connectAndJoin(matchId: string) {
    const useSSL = typeof client.useSSL !== 'undefined' ? client.useSSL : window.location.protocol === 'https:'
    const socket = client.createSocket(useSSL, false)
    socketRef.current = socket
    await socket.connect(session, true)

    let earlyState: string | undefined
    socket.onmatchdata = (data) => {
      earlyState = new TextDecoder().decode(data.data)
    }

    await socket.joinMatch(matchId)
    matchFoundRef.current = true
    onMatchFound({ matchId, session, socket }, earlyState)
  }

  async function handleJoin(matchId: string) {
    setJoining(matchId)
    setError('')
    try {
      await connectAndJoin(matchId)
    } catch {
      setError('Failed to join room. It may be full.')
      setJoining(null)
      fetchRooms() // Refresh the list
    }
  }

  async function handleCreate() {
    setCreating(true)
    setError('')
    try {
      const resp = await client.rpc(session, 'create_room', { mode: gameMode })
      const { match_id: matchId } = resp.payload as unknown as { match_id: string }

      const useSSL = typeof client.useSSL !== 'undefined' ? client.useSSL : window.location.protocol === 'https:'
      const socket = client.createSocket(useSSL, false)
      socketRef.current = socket
      await socket.connect(session, true)

      // Listen for the opponent joining — when we get a game state with both players, transition
      socket.onmatchdata = (data) => {
        if (data.op_code === 1) {
          const state = new TextDecoder().decode(data.data)
          const parsed = JSON.parse(state)
          if (parsed.x_player && parsed.o_player) {
            matchFoundRef.current = true
            onMatchFound({ matchId, session, socket }, state)
          }
        }
      }

      await socket.joinMatch(matchId)
      setView('waiting')
    } catch {
      setError('Failed to create room.')
    } finally {
      setCreating(false)
    }
  }

  function handleCancelWaiting() {
    socketRef.current?.disconnect(true)
    socketRef.current = null
    setView('list')
  }

  // Waiting-for-opponent view (after creating a room)
  if (view === 'waiting') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-3xl p-10 w-80 flex flex-col gap-8 items-center shadow-2xl"
      >
        <div className="relative flex items-center justify-center w-24 h-24">
          <motion.div
            animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.1, 0.3] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="absolute inset-0 rounded-full border border-zinc-500"
          />
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
            className="absolute inset-2 rounded-full border-t-2 border-r-2 border-zinc-100"
          />
        </div>

        <div className="text-center">
          <h2 className="text-xl font-semibold text-zinc-100 mb-2">Room Created</h2>
          <p className="text-zinc-400 text-sm leading-relaxed">
            Waiting for an opponent to join...
          </p>
          <p className="text-zinc-500 text-xs mt-2 uppercase tracking-widest">
            {gameMode} mode
          </p>
        </div>

        <button
          className="text-zinc-500 hover:text-zinc-200 text-sm transition-colors uppercase tracking-widest font-semibold mt-4"
          onClick={handleCancelWaiting}
        >
          Cancel
        </button>
      </motion.div>
    )
  }

  // Room list view
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-3xl p-8 w-96 flex flex-col shadow-2xl"
    >
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-white">Rooms</h2>
          <p className="text-zinc-500 text-xs uppercase tracking-widest mt-1">
            {gameMode} mode
          </p>
        </div>
        <button
          onClick={fetchRooms}
          className="text-zinc-500 hover:text-zinc-200 text-xs uppercase tracking-widest font-semibold transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && (
        <p className="text-red-400 text-sm mb-4">{error}</p>
      )}

      <div className="flex flex-col gap-2 mb-6 max-h-64 overflow-y-auto">
        {loading ? (
          <p className="text-zinc-500 text-sm text-center py-8">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <div className="text-center py-8">
            <p className="text-zinc-500 text-sm">No open rooms</p>
            <p className="text-zinc-600 text-xs mt-1">Create one and wait for an opponent</p>
          </div>
        ) : (
          <AnimatePresence>
            {rooms.map((room) => (
              <motion.div
                key={room.matchId}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-3"
              >
                <div className="flex flex-col min-w-0 mr-3">
                  <span className="text-zinc-100 text-sm font-medium truncate">
                    {room.label.creator || 'Unknown'}
                  </span>
                  <span className="text-zinc-500 text-xs">
                    {room.label.players}/2 players
                  </span>
                </div>
                <button
                  onClick={() => handleJoin(room.matchId)}
                  disabled={joining !== null}
                  className={cn(
                    "px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0",
                    joining === room.matchId
                      ? "bg-zinc-700 text-zinc-400"
                      : "bg-zinc-100 text-zinc-900 hover:bg-white"
                  )}
                >
                  {joining === room.matchId ? 'Joining...' : 'Join'}
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>

      <div className="flex flex-col gap-3">
        <button
          className="bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.05)]"
          onClick={handleCreate}
          disabled={creating || joining !== null}
        >
          {creating ? 'Creating...' : 'Create Room'}
        </button>

        <button
          className="text-zinc-500 hover:text-zinc-200 text-sm transition-colors uppercase tracking-widest font-semibold text-center py-2"
          onClick={onCancel}
        >
          Back
        </button>
      </div>
    </motion.div>
  )
}
