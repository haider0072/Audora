import { SignalingChannel, createRoomCode } from '@/lib/sync/signaling'

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

describe('SignalingChannel', () => {
  const fetchMock = jest.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  it('posts a message tagged with this peer', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }))
    const channel = new SignalingChannel('123456', 'peer-a')

    await channel.send('offer', { sdp: 'x' })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/sync/123456')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({
      peerId: 'peer-a',
      type: 'offer',
      payload: { sdp: 'x' },
    })
  })

  it('returns only the other peer’s messages', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        messages: [
          { peerId: 'peer-a', type: 'offer', payload: 1 },
          { peerId: 'peer-b', type: 'answer', payload: 2 },
        ],
        next: 2,
      }),
    )
    const channel = new SignalingChannel('123456', 'peer-a')

    const messages = await channel.poll()

    expect(messages).toEqual([{ peerId: 'peer-b', type: 'answer', payload: 2 }])
  })

  it('advances its cursor so a message is delivered once', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ messages: [{ peerId: 'peer-b', type: 'ice', payload: 1 }], next: 1 }),
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [], next: 1 }))
    const channel = new SignalingChannel('123456', 'peer-a')

    await channel.poll()
    await channel.poll()

    expect(fetchMock.mock.calls[0][0]).toBe('/api/sync/123456?since=0')
    expect(fetchMock.mock.calls[1][0]).toBe('/api/sync/123456?since=1')
  })

  it('holds its cursor when a poll fails, so nothing is skipped', async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ messages: [{ peerId: 'peer-b', type: 'ice', payload: 1 }], next: 1 }),
    )
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'boom' }, 502))
    fetchMock.mockResolvedValueOnce(jsonResponse({ messages: [], next: 1 }))
    const channel = new SignalingChannel('123456', 'peer-a')

    await channel.poll()
    await expect(channel.poll()).rejects.toThrow('boom')
    await channel.poll()

    expect(fetchMock.mock.calls[2][0]).toBe('/api/sync/123456?since=1')
  })

  it('surfaces the reason a deployment cannot pair', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ error: 'Device sync is not configured on this deployment' }, 503),
    )
    const channel = new SignalingChannel('123456', 'peer-a')

    await expect(channel.poll()).rejects.toThrow('not configured')
  })

  it('falls back to the status code when the body carries no reason', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error('not json')
      },
    } as unknown as Response)
    const channel = new SignalingChannel('123456', 'peer-a')

    await expect(channel.poll()).rejects.toThrow('500')
  })

  it('drops entries that are not signaling messages', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ messages: [null, 'nope', { type: 'offer' }, 42], next: 4 }),
    )
    const channel = new SignalingChannel('123456', 'peer-a')

    expect(await channel.poll()).toEqual([])
  })

  it('goes quiet once stopped', async () => {
    const channel = new SignalingChannel('123456', 'peer-a')
    channel.stop()

    expect(await channel.poll()).toEqual([])
    await channel.send('offer', {})
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('swallows a failed goodbye — the peer is leaving either way', async () => {
    fetchMock.mockRejectedValue(new Error('network gone'))
    const channel = new SignalingChannel('123456', 'peer-a')

    await expect(channel.sendBye()).resolves.toBeUndefined()
  })
})

describe('createRoomCode', () => {
  it('is always six digits, including when the draw is small', () => {
    for (let i = 0; i < 200; i++) {
      expect(createRoomCode()).toMatch(/^\d{6}$/)
    }
  })
})
