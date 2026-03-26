import { useState } from 'react'
import { client, getDeviceId } from '../nakama'
import type { Session } from '@heroiclabs/nakama-js'

interface Props {
  onPlay: (session: Session) => void
  onLeaderboard: (session: Session) => void
}

export default function Lobby({ onPlay, onLeaderboard }: Props) {
  const [nickname, setNickname] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function authenticate() {
    const deviceId = getDeviceId()
    const session = await client.authenticateDevice(deviceId, true, nickname)
    await client.updateAccount(session, { display_name: nickname })
    return session
  }

  async function handlePlay() {
    if (!nickname.trim()) return
    setLoading(true)
    setError('')
    try {
      onPlay(await authenticate())
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
    <div className="bg-gray-900 rounded-2xl p-8 w-80 flex flex-col gap-4 shadow-xl">
      <h1 className="text-2xl font-bold text-center text-teal-400">Tic Tac Toe</h1>
      <p className="text-gray-400 text-center text-sm">Enter your nickname to play</p>
      <input
        className="bg-gray-800 rounded-lg px-4 py-2 text-white outline-none focus:ring-2 focus:ring-teal-500"
        placeholder="Nickname"
        value={nickname}
        onChange={e => setNickname(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && handlePlay()}
        maxLength={20}
      />
      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
      <button
        className="bg-teal-500 hover:bg-teal-400 text-black font-bold py-2 rounded-lg transition disabled:opacity-50"
        onClick={handlePlay}
        disabled={loading || !nickname.trim()}
      >
        {loading ? 'Connecting...' : 'Play'}
      </button>
      <button
        className="bg-gray-700 hover:bg-gray-600 text-white font-bold py-2 rounded-lg transition disabled:opacity-50"
        onClick={handleLeaderboard}
        disabled={loading || !nickname.trim()}
      >
        Leaderboard
      </button>
    </div>
  )
}
