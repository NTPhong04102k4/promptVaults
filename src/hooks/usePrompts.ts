import { useCallback, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { useFocusEffect } from 'expo-router'

import { PERSONAL_VAULT_ID } from '@/lib/db'
import { listPrompts, type Prompt, recordCopy, setFavorite } from '@/lib/prompts'

type Options = { favoritesOnly?: boolean }

// Shared list state for Home / Search / Favorites: category + text filter over
// the local SQLite prompts table, reloaded whenever the screen regains focus
// (e.g. after creating/editing a prompt in the sheet).
export function usePrompts({ favoritesOnly = false }: Options = {}) {
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setLoading(true)
    try {
      setPrompts(await listPrompts(PERSONAL_VAULT_ID, { category, query, favoritesOnly }))
    } finally {
      setLoading(false)
    }
  }, [category, query, favoritesOnly])

  useFocusEffect(
    useCallback(() => {
      reload()
    }, [reload]),
  )

  async function toggleFavorite(id: string) {
    const prompt = prompts.find((p) => p.id === id)
    if (!prompt) return
    await setFavorite(id, !prompt.isFavorite)
    await reload()
  }

  async function copyToClipboard(id: string) {
    const prompt = prompts.find((p) => p.id === id)
    if (!prompt) return
    await Clipboard.setStringAsync(prompt.content)
    await recordCopy(id)
  }

  return {
    prompts,
    loading,
    category,
    setCategory,
    query,
    setQuery,
    reload,
    toggleFavorite,
    copyToClipboard,
  }
}
