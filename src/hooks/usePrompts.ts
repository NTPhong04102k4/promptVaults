import { useCallback, useEffect, useRef, useState } from 'react'
import * as Clipboard from 'expo-clipboard'
import { useFocusEffect } from 'expo-router'

import { listPrompts, type Prompt, recordCopy, setFavorite } from '@/lib/prompts'
import { useSpaceStore } from '@/store'

type Options = { favoritesOnly?: boolean }

// How long to wait after the last keystroke before re-querying SQLite for search.
const SEARCH_DEBOUNCE_MS = 300

// Shared list state for Home / Search / Favorites: category + text filter over
// the local SQLite prompts table, reloaded whenever the screen regains focus
// (e.g. after creating/editing a prompt in the sheet) or the current space changes.
export function usePrompts({ favoritesOnly = false }: Options = {}) {
  const spaceId = useSpaceStore((state) => state.currentSpaceId)
  const [category, setCategory] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [prompts, setPrompts] = useState<Prompt[]>([])
  const [loading, setLoading] = useState(true)

  // Bumped on every reload; a resolved query only commits its result if it's
  // still the most recent one, so an earlier (stale) response can never
  // overwrite what a later request already put in state.
  const requestIdRef = useRef(0)

  const reload = useCallback(async () => {
    const requestId = ++requestIdRef.current
    setLoading(true)
    try {
      const result = await listPrompts(spaceId, { category, query, favoritesOnly })
      if (requestId !== requestIdRef.current) return // superseded by a newer reload
      setPrompts(result)
    } finally {
      if (requestId === requestIdRef.current) setLoading(false)
    }
  }, [spaceId, category, query, favoritesOnly])

  // Always points at the latest `reload` closure (current query included) so the
  // focus effect and the debounce timer below never call a stale one.
  const reloadRef = useRef(reload)
  useEffect(() => {
    reloadRef.current = reload
  }, [reload])

  // Focus regain and space/category/favoritesOnly changes reload immediately —
  // these aren't high-frequency, unlike keystrokes in the search box.
  useFocusEffect(
    useCallback(() => {
      reloadRef.current()
      // eslint-disable-next-line react-hooks/exhaustive-deps -- reloadRef.current() always uses the latest reload
    }, [spaceId, category, favoritesOnly]),
  )

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    },
    [],
  )

  // Update the input immediately (so typing stays smooth) but debounce the
  // actual SQLite reload, so rapid typing doesn't fire a query per keystroke.
  const setQueryDebounced = useCallback((next: string) => {
    setQuery(next)
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
    debounceTimerRef.current = setTimeout(() => {
      reloadRef.current()
    }, SEARCH_DEBOUNCE_MS)
  }, [])

  // Stable (never re-created), used by both mutators below, so screens can pass
  // them straight into a memoized PromptCard without defeating React.memo. Kept
  // in sync with `prompts` via an effect instead of being a useCallback dependency
  // (which would give the callbacks a new identity on every list change).
  const promptsRef = useRef<Prompt[]>(prompts)
  useEffect(() => {
    promptsRef.current = prompts
  }, [prompts])

  // Reads the current favorite state from the ref *before* calling setPrompts:
  // the updater function passed to setPrompts isn't guaranteed to run synchronously,
  // so computing nextIsFavorite from inside it (and reading it back right after)
  // isn't reliable — it could still be unset by the time setFavorite() is called.
  const toggleFavorite = useCallback(async (id: string) => {
    const prompt = promptsRef.current.find((p) => p.id === id)
    if (!prompt) return
    const nextIsFavorite = !prompt.isFavorite
    // Optimistic local update: flip just this row, no full reload.
    setPrompts((current) =>
      current.map((p) => (p.id === id ? { ...p, isFavorite: nextIsFavorite } : p)),
    )
    try {
      await setFavorite(id, nextIsFavorite)
    } catch (error) {
      // Revert the optimistic flip if the write failed.
      setPrompts((current) =>
        current.map((p) => (p.id === id ? { ...p, isFavorite: !nextIsFavorite } : p)),
      )
      throw error
    }
  }, [])

  const copyToClipboard = useCallback(async (id: string) => {
    const prompt = promptsRef.current.find((p) => p.id === id)
    if (!prompt) return
    await Clipboard.setStringAsync(prompt.content)
    await recordCopy(id)
  }, [])

  return {
    prompts,
    loading,
    category,
    setCategory,
    query,
    setQuery: setQueryDebounced,
    reload,
    toggleFavorite,
    copyToClipboard,
  }
}
