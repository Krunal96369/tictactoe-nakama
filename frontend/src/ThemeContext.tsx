import React, { createContext, useContext, useEffect, useState } from 'react'

export type ThemeId = 'monochrome' | 'pastel' | 'midnight' | 'cyberpunk' | 'toxic' | 'sunset'

export interface Palette {
    id: ThemeId
    name: string
    xColor: string // CSS class
    oColor: string // CSS class
    xBg: string // CSS class for selection
    oBg: string // CSS class for selection
}

export const palettes: Record<ThemeId, Palette> = {
    monochrome: {
        id: 'monochrome',
        name: 'Monochrome',
        xColor: 'text-zinc-100',
        oColor: 'text-zinc-400',
        xBg: 'bg-zinc-100',
        oBg: 'bg-zinc-400',
    },
    pastel: {
        id: 'pastel',
        name: 'Pastel',
        xColor: 'text-teal-200',
        oColor: 'text-indigo-300',
        xBg: 'bg-teal-200',
        oBg: 'bg-indigo-300',
    },
    midnight: {
        id: 'midnight',
        name: 'Midnight',
        xColor: 'text-sky-400',
        oColor: 'text-amber-400',
        xBg: 'bg-sky-400',
        oBg: 'bg-amber-400',
    },
    cyberpunk: {
        id: 'cyberpunk',
        name: 'Cyberpunk',
        xColor: 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.5)]',
        oColor: 'text-pink-500 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]',
        xBg: 'bg-cyan-400',
        oBg: 'bg-pink-500',
    },
    toxic: {
        id: 'toxic',
        name: 'Toxic',
        xColor: 'text-green-400 drop-shadow-[0_0_8px_rgba(74,222,128,0.5)]',
        oColor: 'text-purple-500 drop-shadow-[0_0_8px_rgba(168,85,247,0.5)]',
        xBg: 'bg-green-400',
        oBg: 'bg-purple-500',
    },
    sunset: {
        id: 'sunset',
        name: 'Sunset',
        xColor: 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]',
        oColor: 'text-orange-400 drop-shadow-[0_0_8px_rgba(251,146,60,0.5)]',
        xBg: 'bg-rose-400',
        oBg: 'bg-orange-400',
    }
}

interface ThemeContextType {
    theme: ThemeId
    setTheme: (id: ThemeId) => void
    palette: Palette
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
    const [theme, setTheme] = useState<ThemeId>('monochrome')

    useEffect(() => {
        const saved = localStorage.getItem('tictactoe_theme') as ThemeId
        if (saved && palettes[saved]) {
            setTheme(saved)
        }
    }, [])

    const handleSetTheme = (id: ThemeId) => {
        setTheme(id)
        localStorage.setItem('tictactoe_theme', id)
    }

    return (
        <ThemeContext.Provider value={{ theme, setTheme: handleSetTheme, palette: palettes[theme] }}>
            {children}
        </ThemeContext.Provider>
    )
}

export function useTheme() {
    const context = useContext(ThemeContext)
    if (!context) throw new Error('useTheme must be used within ThemeProvider')
    return context
}
