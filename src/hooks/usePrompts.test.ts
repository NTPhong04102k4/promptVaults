import { createElement } from 'react'
import { act, create } from 'react-test-renderer'

// expo-router's real useFocusEffect needs a NavigationContainer; this test only cares
// about the dependency-driven refresh behavior it triggers, so stand in with a plain
// useEffect keyed on the same deps expo-router would key focus-regain on (the effect's
// own identity, which is exactly what usePrompts relies on for "focus/category/space
// changes reload immediately"). `require`'d lazily inside the factory since jest.mock
// factories can't close over out-of-scope imports.
jest.mock('expo-router', () => ({
  useFocusEffect: (effect: () => void) => {
    require('react').useEffect(effect, [effect])
  },
}))

jest.mock('@/store', () => ({
  useSpaceStore: (selector: (state: { currentSpaceId: string }) => unknown) =>
    selector({ currentSpaceId: 'space-1' }),
}))

jest.mock('expo-clipboard', () => ({
  setStringAsync: jest.fn(),
}))

jest.mock('@/lib/prompts', () => ({
  listPrompts: jest.fn(),
  setFavorite: jest.fn(),
  recordCopy: jest.fn(),
}))

import { listPrompts, type Prompt, setFavorite } from '@/lib/prompts'

import { usePrompts } from './usePrompts'

const listPromptsMock = listPrompts as jest.Mock
const setFavoriteMock = setFavorite as jest.Mock

function makePrompt(overrides: Partial<Prompt> = {}): Prompt {
  return {
    id: 'p1',
    spaceId: 'space-1',
    title: 'Title',
    content: 'Content',
    category: null,
    isFavorite: false,
    copyCount: 0,
    createdAt: 0,
    updatedAt: 0,
    version: 0,
    hasConflict: false,
    ...overrides,
  }
}

// Renders usePrompts in a throwaway host component and exposes the latest hook
// result via `getHook()`, so tests can drive it (setQuery, toggleFavorite, …)
// and assert on state without needing @testing-library/react-native. Uses
// createElement instead of JSX so this stays a plain .ts file, matching every
// other test in this repo (none use .tsx).
function renderUsePrompts(options?: Parameters<typeof usePrompts>[0]) {
  let latest!: ReturnType<typeof usePrompts>
  function Harness() {
    latest = usePrompts(options)
    return null
  }
  act(() => {
    create(createElement(Harness))
  })
  return {
    getHook: () => latest,
  }
}

beforeEach(() => {
  jest.clearAllMocks()
  listPromptsMock.mockResolvedValue([])
})

describe('usePrompts search debounce', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('does not query on every keystroke, only once after the debounce window', async () => {
    const { getHook } = renderUsePrompts()
    // Initial focus-driven reload on mount.
    expect(listPromptsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      getHook().setQuery('a')
    })
    await act(async () => {
      getHook().setQuery('ab')
    })
    await act(async () => {
      getHook().setQuery('abc')
    })

    // Typing fast must not have fired a query per keystroke.
    expect(listPromptsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      jest.advanceTimersByTime(300)
    })

    // Exactly one more query, for the final query value only.
    expect(listPromptsMock).toHaveBeenCalledTimes(2)
    expect(listPromptsMock).toHaveBeenLastCalledWith(
      'space-1',
      expect.objectContaining({ query: 'abc' }),
    )
  })

  it('never lets a stale (earlier) response overwrite a newer one', async () => {
    const slowFirst = makePrompt({ id: 'old', title: 'Old result' })
    const fastSecond = makePrompt({ id: 'new', title: 'New result' })

    let resolveFirst!: (value: Prompt[]) => void
    listPromptsMock
      .mockImplementationOnce(
        () => new Promise<Prompt[]>((resolve) => { resolveFirst = resolve }),
      )
      .mockImplementationOnce(() => Promise.resolve([fastSecond]))

    const { getHook } = renderUsePrompts()
    expect(listPromptsMock).toHaveBeenCalledTimes(1) // initial mount reload (the "slow" one)

    await act(async () => {
      getHook().setQuery('second')
      jest.advanceTimersByTime(300)
    })
    // The second (fast) request has already resolved and committed its result.
    expect(getHook().prompts).toEqual([fastSecond])

    // Now the first (slow, stale) request finally resolves — it must be ignored.
    await act(async () => {
      resolveFirst([slowFirst])
    })
    expect(getHook().prompts).toEqual([fastSecond])
  })

  it('reloads immediately (no debounce) on category change', async () => {
    const { getHook } = renderUsePrompts()
    expect(listPromptsMock).toHaveBeenCalledTimes(1)

    await act(async () => {
      getHook().setCategory('Marketing')
    })

    // No timer advance needed — category changes aren't debounced.
    expect(listPromptsMock).toHaveBeenCalledTimes(2)
    expect(listPromptsMock).toHaveBeenLastCalledWith(
      'space-1',
      expect.objectContaining({ category: 'Marketing' }),
    )
  })
})

describe('usePrompts optimistic favorite toggle', () => {
  it('flips isFavorite in local state without waiting for a reload', async () => {
    const prompt = makePrompt({ id: 'p1', isFavorite: false })
    listPromptsMock.mockResolvedValueOnce([prompt])
    let resolveSetFavorite!: () => void
    setFavoriteMock.mockImplementationOnce(
      () => new Promise<void>((resolve) => { resolveSetFavorite = resolve }),
    )

    const { getHook } = renderUsePrompts()
    await act(async () => {}) // flush the initial reload
    expect(getHook().prompts[0]!.isFavorite).toBe(false)

    let togglePromise!: Promise<void>
    act(() => {
      togglePromise = getHook().toggleFavorite('p1')
    })

    // Local state updates immediately, before setFavorite's write resolves.
    expect(getHook().prompts[0]!.isFavorite).toBe(true)
    expect(listPromptsMock).toHaveBeenCalledTimes(1) // no extra full reload

    await act(async () => {
      resolveSetFavorite()
      await togglePromise
    })
    expect(getHook().prompts[0]!.isFavorite).toBe(true)
    expect(listPromptsMock).toHaveBeenCalledTimes(1) // still no reload after settling
  })

  it('reverts the optimistic flip if the write fails', async () => {
    const prompt = makePrompt({ id: 'p1', isFavorite: false })
    listPromptsMock.mockResolvedValueOnce([prompt])
    setFavoriteMock.mockRejectedValueOnce(new Error('write failed'))

    const { getHook } = renderUsePrompts()
    await act(async () => {}) // flush the initial reload

    await act(async () => {
      await getHook().toggleFavorite('p1').catch(() => {})
    })

    expect(getHook().prompts[0]!.isFavorite).toBe(false)
  })
})
