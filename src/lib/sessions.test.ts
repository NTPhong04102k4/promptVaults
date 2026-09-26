jest.mock('@/services/apiClient', () => ({ apiClient: { get: jest.fn(), delete: jest.fn() } }))

import { apiClient } from '@/services/apiClient'

import { describeSession, listSessions, revokeSession } from './sessions'

describe('sessions', () => {
  it('lists the current device first, then newest', async () => {
    ;(apiClient.get as jest.Mock).mockResolvedValue([
      { id: 'a', deviceName: 'Old', platform: 'ios', issuedAt: 100, isCurrent: false },
      { id: 'b', deviceName: 'This', platform: 'android', issuedAt: 50, isCurrent: true },
      { id: 'c', deviceName: 'New', platform: 'web', issuedAt: 200, isCurrent: false },
    ])
    expect((await listSessions()).map((s) => s.id)).toEqual(['b', 'c', 'a'])
    expect(apiClient.get).toHaveBeenCalledWith('/account/sessions', { auth: true })
  })

  it('revokes by public id', async () => {
    await revokeSession('abc123def456')
    expect(apiClient.delete).toHaveBeenCalledWith('/account/sessions/abc123def456', { auth: true })
  })

  it('describes unknown devices and platforms', () => {
    const now = 1_000_000_000_000
    expect(
      describeSession({ id: 'x', deviceName: null, platform: null, issuedAt: now / 1000 - 30, isCurrent: false }, now),
    ).toEqual({ title: 'Thiết bị không rõ', subtitle: 'Không rõ · Đăng nhập Vừa xong' })
    expect(
      describeSession({ id: 'y', deviceName: 'Pixel', platform: 'android', issuedAt: now / 1000 - 30, isCurrent: true }, now).subtitle,
    ).toBe('Android · Đăng nhập Vừa xong')
  })
})
