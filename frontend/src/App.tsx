import type { Session, Socket } from '@heroiclabs/nakama-js'
import { useCallback, useState } from 'react'
import Game from './components/Game'
import Lobby from './components/Lobby'
import Matchmaking from './components/Matchmaking'

export type Screen = 'lobby' | 'matchmaking' | 'game'

export interface MatchInfo {
  matchId: string
  session: Session
  socket: Socket
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [session, setSession] = useState<Session | null>(null)

  const handleMatchFound = useCallback((info: MatchInfo) => {
    setMatchInfo(info)
    setScreen('game')
  }, [])

  const handleCancel = useCallback(() => setScreen('lobby'), [])
  const handlePlayAgain = useCallback(() => setScreen('matchmaking'), [])

  return (
    <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center">
      {screen === 'lobby' && (
        <Lobby onJoin={(s) => { setSession(s); setScreen('matchmaking') }} />
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
        />
      )}
    </div>
  )
}
