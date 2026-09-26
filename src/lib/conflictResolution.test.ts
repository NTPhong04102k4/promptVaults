// Pure decision logic behind the conflict screen (src/app/conflict.tsx), tested here without
// rendering — this repo has no RN component-test harness (no other src/app/*.tsx has tests),
// so the orchestration a screen would otherwise need e2e coverage for is extracted into plain,
// dependency-injected functions instead.

import { ApiError } from '@/services/apiClient'

import { runResolution, visibleResolutionButtons } from './conflictResolution'
import type { ResolveOutcome } from './conflicts'

describe('runResolution', () => {
  function action(outcome: ResolveOutcome | Error) {
    return jest.fn(async () => {
      if (outcome instanceof Error) throw outcome
      return outcome
    })
  }

  it('reports success and never refetches when the resolve is applied', async () => {
    const refetch = jest.fn(async () => undefined)
    const result = await runResolution(action('resolved'), refetch)
    expect(result).toEqual({ kind: 'success' })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('reports forbidden and never refetches (the conflict record itself is unchanged)', async () => {
    const refetch = jest.fn(async () => undefined)
    const result = await runResolution(action('forbidden'), refetch)
    expect(result).toEqual({ kind: 'forbidden' })
    expect(refetch).not.toHaveBeenCalled()
  })

  it('re-fetches the current conflict state on requeued, so the screen never shows stale data', async () => {
    const refetch = jest.fn(async () => undefined)
    const result = await runResolution(action('requeued'), refetch)
    expect(result).toEqual({ kind: 'requeued' })
    expect(refetch).toHaveBeenCalledTimes(1)
  })

  it('catches a thrown 422 (validation error) as a displayable error, not a crash', async () => {
    const refetch = jest.fn(async () => undefined)
    const error = new ApiError(422, 'ValidationError', 'Du lieu khong hop le.')
    const result = await runResolution(action(error), refetch)
    expect(result.kind).toBe('error')
    expect(refetch).not.toHaveBeenCalled()
  })

  it('catches a non-ApiError throw (e.g. offline) as a displayable error too', async () => {
    const refetch = jest.fn(async () => undefined)
    const result = await runResolution(action(new Error('offline')), refetch)
    expect(result.kind).toBe('error')
  })
})

describe('visibleResolutionButtons', () => {
  it('shows all three actions for a normal edit-vs-edit conflict', () => {
    expect(visibleResolutionButtons({ deletedLocally: false, forbidden: false })).toEqual({
      keepLocal: true,
      keepRemote: true,
      merge: true,
    })
  })

  it('hides merge for a local delete (nothing local to merge from)', () => {
    expect(visibleResolutionButtons({ deletedLocally: true, forbidden: false })).toEqual({
      keepLocal: true,
      keepRemote: true,
      merge: false,
    })
  })

  it('shows only "Giữ bản máy chủ" when a prior attempt came back forbidden', () => {
    expect(visibleResolutionButtons({ deletedLocally: false, forbidden: true })).toEqual({
      keepLocal: false,
      keepRemote: true,
      merge: false,
    })
  })

  it('forbidden + local delete still shows only keep_remote', () => {
    expect(visibleResolutionButtons({ deletedLocally: true, forbidden: true })).toEqual({
      keepLocal: false,
      keepRemote: true,
      merge: false,
    })
  })
})
