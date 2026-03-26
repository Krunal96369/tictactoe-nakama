import type { Session, Socket } from '@heroiclabs/nakama-js'
import { useCallback, useState, useRef } from 'react'
import Game from './components/Game'
import Leaderboard from './components/Leaderboard'
import Lobby from './components/Lobby'
import Matchmaking from './components/Matchmaking'
import RoomBrowser from './components/RoomBrowser'

export type Screen = 'lobby' | 'matchmaking' | 'game' | 'leaderboard' | 'rooms'

export interface MatchInfo {
  matchId: string
  session: Session
  socket: Socket
}

export type GameMode = 'classic' | 'timed'

export default function App() {
  const [screen, setScreen] = useState<Screen>('lobby')
  const [matchInfo, setMatchInfo] = useState<MatchInfo | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [gameMode, setGameMode] = useState<GameMode>('timed')
  const pendingStateRef = useRef<string | null>(null)

  const handleMatchFound = useCallback((info: MatchInfo, earlyState?: string) => {
    if (earlyState) pendingStateRef.current = earlyState
    setMatchInfo(info)
    setScreen('game')
  }, [])

  const handleCancel = useCallback(() => setScreen('lobby'), [])
  const handlePlayAgain = useCallback(() => setScreen('matchmaking'), [])
  const handleLeaveLobby = useCallback(() => setScreen('lobby'), [])
  const handleLeaderboard = useCallback((s: Session) => { setSession(s); setScreen('leaderboard') }, [])

  return (
    <div className="min-h-screen w-full relative bg-zinc-950 text-zinc-100 flex items-center justify-center overflow-hidden font-sans">
      {/* Elegant minimalist spotlight background */}
      <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-zinc-800/30 blur-[100px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[40vw] h-[40vw] rounded-full bg-zinc-800/30 blur-[100px] pointer-events-none" />
      
      <div className="relative z-10 w-full flex items-center justify-center">
        {screen === 'lobby' && (
          <Lobby
            onPlay={(s, mode) => { setSession(s); setGameMode(mode); setScreen('matchmaking') }}
            onBrowseRooms={(s, mode) => { setSession(s); setGameMode(mode); setScreen('rooms') }}
            onLeaderboard={handleLeaderboard}
          />
        )}
        {screen === 'leaderboard' && session && (
          <Leaderboard session={session} onBack={() => setScreen('lobby')} />
        )}
        {screen === 'matchmaking' && session && (
          <Matchmaking
            session={session}
            gameMode={gameMode}
            onMatchFound={handleMatchFound}
            onCancel={handleCancel}
          />
        )}
        {screen === 'rooms' && session && (
          <RoomBrowser
            session={session}
            gameMode={gameMode}
            onMatchFound={handleMatchFound}
            onCancel={handleCancel}
          />
        )}
        {screen === 'game' && matchInfo && session && (
          <Game
            session={session}
            matchInfo={matchInfo}
            onPlayAgain={handlePlayAgain}
            onLeave={handleLeaveLobby}
            pendingStateRef={pendingStateRef}
          />
        )}
      </div>
    </div>
  )
}
