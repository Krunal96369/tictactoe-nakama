import type { Session, Socket } from '@heroiclabs/nakama-js'
import { useCallback, useState, useRef } from 'react'
import Game from './components/Game'
import Leaderboard from './components/Leaderboard'
import Lobby from './components/Lobby'
import Matchmaking from './components/Matchmaking'

export type Screen = 'lobby' | 'matchmaking' | 'game' | 'leaderboard'

export interface MatchInfo {
  matchId: string
  session: Session
  socket: Socket
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const pendingStateRef = useRef<string | null>(null)

  const handleMatchFound = useCallback((info: MatchInfo, earlyState?: string) => {
    if (earlyState) pendingStateRef.current = earlyState
    setMatchInfo(info)
    setScreen('game')
  }, [])

  const handleCancel = useCallback(() => setScreen('lobby'), [])
  const handlePlayAgain = useCallback(() => setScreen('matchmaking'), [])
  const handleLeaderboard = useCallback((s: Session) => { setSession(s); setScreen('leaderboard') }, [])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      {screen === 'lobby' && (
        <Lobby
          onPlay={(s) => { setSession(s); setScreen('matchmaking') }}
          onLeaderboard={handleLeaderboard}
        />
      )}
      {screen === 'leaderboard' && session && (
        <Leaderboard session={session} onBack={() => setScreen('lobby')} />
      )}
      {screen === 'matchmaking' && session && (
        <Matchmaking
          session={session}
          onMatchFound={handleMatchFound}
          onCancel={handleCancel}
        />
      )}
      {screen === 'game' && matchInfo && session && (
        <Game
          session={session}
          matchInfo={matchInfo}
          onPlayAgain={handlePlayAgain}
          pendingStateRef={pendingStateRef}
        />
      )}
    </div>
  )
}
