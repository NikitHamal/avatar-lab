type EncodedChunk = {
  timestampUs: number
  durationUs: number
  key: boolean
  data: Uint8Array
}

type WebCodecsWindow = Window & {
  VideoEncoder?: any
  VideoFrame?: any
}

const concat = (...parts: Uint8Array[]) => {
  const total = parts.reduce((sum, part) => sum + part.length, 0)
  const result = new Uint8Array(total)
  let offset = 0
  parts.forEach(part => {
    result.set(part, offset)
    offset += part.length
  })
  return result
}

const idBytes = (id: number) => {
  if (id <= 0xff) return Uint8Array.of(id)
  if (id <= 0xffff) return Uint8Array.of((id >>> 8) & 0xff, id & 0xff)
  if (id <= 0xffffff) return Uint8Array.of((id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff)
  return Uint8Array.of((id >>> 24) & 0xff, (id >>> 16) & 0xff, (id >>> 8) & 0xff, id & 0xff)
}

const sizeVint = (value: number) => {
  for (let bytes = 1; bytes <= 8; bytes += 1) {
    const max = 2 ** (7 * bytes) - 2
    if (value <= max) {
      const out = new Uint8Array(bytes)
      let remaining = value
      for (let index = bytes - 1; index >= 0; index -= 1) {
        out[index] = remaining & 0xff
        remaining = Math.floor(remaining / 256)
      }
      out[0] |= 1 << (8 - bytes)
      return out
    }
  }
  throw new Error('EBML element too large')
}

const element = (id: number, data: Uint8Array) => concat(idBytes(id), sizeVint(data.length), data)

const uint = (value: number) => {
  const safe = Math.max(0, Math.floor(value))
  if (safe <= 0xff) return Uint8Array.of(safe)
  if (safe <= 0xffff) return Uint8Array.of((safe >>> 8) & 0xff, safe & 0xff)
  if (safe <= 0xffffff) return Uint8Array.of((safe >>> 16) & 0xff, (safe >>> 8) & 0xff, safe & 0xff)
  return Uint8Array.of((safe >>> 24) & 0xff, (safe >>> 16) & 0xff, (safe >>> 8) & 0xff, safe & 0xff)
}

const text = (value: string) => new TextEncoder().encode(value)

const float64 = (value: number) => {
  const buffer = new ArrayBuffer(8)
  new DataView(buffer).setFloat64(0, value, false)
  return new Uint8Array(buffer)
}

const simpleBlock = (chunk: EncodedChunk, clusterTimeMs: number) => {
  const absoluteMs = Math.round(chunk.timestampUs / 1000)
  const relative = Math.max(-32768, Math.min(32767, absoluteMs - clusterTimeMs))
  const header = new Uint8Array(4)
  header[0] = 0x81 // track 1
  new DataView(header.buffer).setInt16(1, relative, false)
  header[3] = chunk.key ? 0x80 : 0
  return element(0xa3, concat(header, chunk.data))
}

const muxWebm = (
  chunks: EncodedChunk[],
  width: number,
  height: number,
  durationMs: number
): Blob => {
  const ebmlHeader = element(
    0x1a45dfa3,
    concat(
      element(0x4286, uint(1)),
      element(0x42f7, uint(1)),
      element(0x42f2, uint(4)),
      element(0x42f3, uint(8)),
      element(0x4282, text('webm')),
      element(0x4287, uint(4)),
      element(0x4285, uint(2))
    )
  )

  const info = element(
    0x1549a966,
    concat(
      element(0x2ad7b1, uint(1_000_000)), // 1 ms timecode scale
      element(0x4d80, text('Avatar Labs')),
      element(0x5741, text('Avatar Labs WebCodecs Exporter')),
      element(0x4489, float64(durationMs))
    )
  )

  const trackEntry = element(
    0xae,
    concat(
      element(0xd7, uint(1)),
      element(0x73c5, uint(1)),
      element(0x83, uint(1)),
      element(0x86, text('V_VP8')),
      element(0xe0, concat(element(0xb0, uint(width)), element(0xba, uint(height))))
    )
  )
  const tracks = element(0x1654ae6b, trackEntry)

  const clusters: Uint8Array[] = []
  let clusterStartMs = -1
  let blocks: Uint8Array[] = []
  const flushCluster = () => {
    if (clusterStartMs < 0 || !blocks.length) return
    clusters.push(element(0x1f43b675, concat(element(0xe7, uint(clusterStartMs)), ...blocks)))
    blocks = []
  }

  chunks.forEach(chunk => {
    const chunkMs = Math.round(chunk.timestampUs / 1000)
    if (clusterStartMs < 0) clusterStartMs = chunkMs
    if (chunkMs - clusterStartMs > 30_000 || (chunk.key && chunkMs - clusterStartMs > 4_000)) {
      flushCluster()
      clusterStartMs = chunkMs
    }
    blocks.push(simpleBlock(chunk, clusterStartMs))
  })
  flushCluster()

  const segment = element(0x18538067, concat(info, tracks, ...clusters))
  return new Blob([concat(ebmlHeader, segment)], { type: 'video/webm' })
}

export const canUseFastWebmEncoder = async (width: number, height: number, fps: number) => {
  const codecs = window as WebCodecsWindow
  if (!codecs.VideoEncoder || !codecs.VideoFrame) return false
  try {
    const result = await codecs.VideoEncoder.isConfigSupported?.({
      codec: 'vp8',
      width,
      height,
      framerate: fps,
      bitrate: Math.max(1_800_000, Math.round(width * height * fps * 0.28)),
    })
    return result ? result.supported === true : true
  } catch {
    return false
  }
}

export const encodeCanvasFramesToWebm = async ({
  canvas,
  frames,
  fps,
  onFrame,
}: {
  canvas: HTMLCanvasElement
  frames: { timestampMs: number; durationMs: number; draw: () => Promise<void> }[]
  fps: number
  onFrame?: (index: number, total: number) => void
}): Promise<Blob> => {
  const codecs = window as WebCodecsWindow
  if (!codecs.VideoEncoder || !codecs.VideoFrame) throw new Error('WebCodecs unavailable')

  const chunks: EncodedChunk[] = []
  let encoderError: unknown = null
  const bitrate = Math.max(1_800_000, Math.round(canvas.width * canvas.height * fps * 0.28))
  const encoder = new codecs.VideoEncoder({
    output: (chunk: any) => {
      const data = new Uint8Array(chunk.byteLength)
      chunk.copyTo(data)
      chunks.push({
        timestampUs: Number(chunk.timestamp),
        durationUs: Number(chunk.duration || Math.round(1_000_000 / fps)),
        key: chunk.type === 'key',
        data,
      })
    },
    error: (error: unknown) => {
      encoderError = error
    },
  })
  encoder.configure({ codec: 'vp8', width: canvas.width, height: canvas.height, framerate: fps, bitrate })

  const keyFrameEvery = Math.max(1, Math.round(fps * 2))
  try {
    for (let index = 0; index < frames.length; index += 1) {
      const item = frames[index]
      await item.draw()
      if (encoder.encodeQueueSize > 8) await encoder.flush()
      const videoFrame = new codecs.VideoFrame(canvas, {
        timestamp: Math.round(item.timestampMs * 1000),
        duration: Math.max(1, Math.round(item.durationMs * 1000)),
      })
      encoder.encode(videoFrame, { keyFrame: index % keyFrameEvery === 0 })
      videoFrame.close()
      onFrame?.(index + 1, frames.length)
    }
    await encoder.flush()
    if (encoderError) throw encoderError
  } finally {
    encoder.close()
  }

  chunks.sort((a, b) => a.timestampUs - b.timestampUs)
  const durationMs = frames.length
    ? frames[frames.length - 1].timestampMs + frames[frames.length - 1].durationMs
    : 1
  return muxWebm(chunks, canvas.width, canvas.height, durationMs)
}
