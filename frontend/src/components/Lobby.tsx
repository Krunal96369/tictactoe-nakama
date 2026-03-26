import { useState } from 'react'
import { client, getDeviceId } from '../nakama'
import type { Session } from '@heroiclabs/nakama-js'
import { motion, AnimatePresence } from 'framer-motion'
import { Palette as PaletteIcon } from 'lucide-react'
import { useTheme, palettes } from '../ThemeContext'
import type { ThemeId } from '../ThemeContext'
import type { GameMode } from '../App'
import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: (string | undefined | null | false)[]) {
  return twMerge(clsx(inputs))
}

interface Props {
  onPlay: (session: Session, mode: GameMode) => void
  onBrowseRooms: (session: Session, mode: GameMode) => void
  onLeaderboard: (session: Session) => void
}

export default function Lobby({ onPlay, onBrowseRooms, onLeaderboard }: Props) {
  const [nickname, setNickname] = useState(() => localStorage.getItem('ttt_nickname') || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showThemes, setShowThemes] = useState(false)
  const [gameMode, setGameMode] = useState<GameMode>(() => (localStorage.getItem('ttt_mode') as GameMode) || 'timed')

  const { theme, setTheme, palette } = useTheme()

  async function authenticate() {
    const deviceId = getDeviceId()
    const session = await client.authenticateDevice(deviceId, true, nickname)
    await client.updateAccount(session, { display_name: nickname })
    localStorage.setItem('ttt_nickname', nickname)
    return session
  }

  async function handlePlay() {
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      localStorage.setItem('ttt_mode', gameMode)
      onPlay(await authenticate(), gameMode)
    } catch {
      setError('Failed to connect. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleBrowseRooms() {
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      localStorage.setItem('ttt_mode', gameMode)
      onBrowseRooms(await authenticate(), gameMode)
    } catch {
      setError('Failed to connect. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleLeaderboard() {
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      onLeaderboard(await authenticate())
    } catch {
      setError('Failed to connect. Try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="bg-zinc-900/40 backdrop-blur-2xl border border-zinc-800/50 rounded-3xl p-8 w-80 flex flex-col shadow-2xl relative"
    >
      <div className="absolute top-6 right-6">
        <button
          onClick={() => setShowThemes(!showThemes)}
          className="text-zinc-500 hover:text-zinc-200 transition-colors"
          title="Change Theme"
        >
          <PaletteIcon size={20} />
        </button>
      </div>

      <div className="flex flex-col gap-6 mt-2">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-1">
            Tic-Tac-<span className={palette.xColor}>Toe</span>
          </h1>
          <p className="text-zinc-400 text-sm">Enter your nickname to play</p>
        </div>

        <AnimatePresence>
          {showThemes && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="flex justify-between items-center py-2 border-y border-zinc-800/50 overflow-hidden"
            >
              <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">THEME</span>
              <div className="flex gap-2 p-2">
                {(Object.keys(palettes) as ThemeId[]).map((id) => {
                  const p = palettes[id]
                  return (
                    <button
                      key={id}
                      onClick={() => setTheme(id)}
                      className={cn(
                        "w-6 h-6 rounded-full flex overflow-hidden ring-2 ring-offset-2 ring-offset-zinc-900 transition-all cursor-pointer",
                        theme === id ? 'ring-zinc-400 scale-110' : 'ring-transparent hover:scale-110'
                      )}
                      title={p.name}
                    >
                      <div className={cn("w-1/2 h-full", p.xBg)} />
                      <div className={cn("w-1/2 h-full", p.oBg)} />
                    </button>
                  )
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex flex-col gap-3">
          <input
            className="bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-3 text-white outline-none focus:border-zinc-500 focus:ring-1 focus:ring-zinc-500 transition-all placeholder:text-zinc-600 shadow-inner"
            placeholder="Nickname"
            value={nickname}
            onChange={e => setNickname(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handlePlay()}
            maxLength={20}
          />
          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex items-center justify-between bg-zinc-950/50 border border-zinc-800/50 rounded-xl px-4 py-2.5">
            <span className="text-xs text-zinc-500 uppercase tracking-widest font-semibold">MODE</span>
            <div className="flex bg-zinc-900 rounded-lg p-0.5 gap-0.5">
              <button
                onClick={() => setGameMode('classic')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  gameMode === 'classic' ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Classic
              </button>
              <button
                onClick={() => setGameMode('timed')}
                className={cn(
                  "px-3 py-1.5 rounded-md text-xs font-medium transition-all",
                  gameMode === 'timed' ? "bg-zinc-700 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"
                )}
              >
                Timed
              </button>
            </div>
          </div>

          <button
            className="bg-zinc-100 hover:bg-white text-zinc-900 font-semibold py-3 rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(255,255,255,0.05)]"
            onClick={handlePlay}
            disabled={loading || !nickname.trim()}
          >
            {loading ? 'Connecting...' : 'Quick Play'}
          </button>

          <button
            className="bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-300 font-medium py-3 rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleBrowseRooms}
            disabled={loading || !nickname.trim()}
          >
            Browse Rooms
          </button>

          <button
            className="bg-zinc-800/50 hover:bg-zinc-700/50 border border-zinc-700/50 text-zinc-300 font-medium py-3 rounded-xl transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleLeaderboard}
            disabled={loading || !nickname.trim()}
          >
            Leaderboard
          </button>
        </div>
      </div>
    </motion.div>
  )
}
