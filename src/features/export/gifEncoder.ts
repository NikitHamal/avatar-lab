/**
 * Lightweight, zero-dependency in-browser GIF89a encoder.
 * Supports:
 * - Color quantization with palette indexing
 * - Alpha channel transparency handling
 * - Frame-accurate timing in hundredths of a second
 * - Netscape 2.0 infinite looping
 * - LZW compression with sub-block packet streaming
 */

export type GifFrameOptions = {
  /** Frame duration in milliseconds (e.g. 33 for 30fps) */
  delayMs: number
  /** Whether pixels with alpha < 128 should be transparent */
  transparent?: boolean
  /** Disposal method: 2 = restore to background, 1 = do not dispose */
  disposal?: 1 | 2
}

class ByteWriter {
  private buffer: Uint8Array
  private position = 0

  constructor(initialCapacity = 65536) {
    this.buffer = new Uint8Array(initialCapacity)
  }

  private ensureCapacity(needed: number) {
    if (this.position + needed > this.buffer.length) {
      let nextLen = this.buffer.length * 2
      while (nextLen < this.position + needed) nextLen *= 2
      const nextBuf = new Uint8Array(nextLen)
      nextBuf.set(this.buffer)
      this.buffer = nextBuf
    }
  }

  writeByte(byte: number) {
    this.ensureCapacity(1)
    this.buffer[this.position++] = byte & 0xff
  }

  writeShort(value: number) {
    this.ensureCapacity(2)
    this.buffer[this.position++] = value & 0xff
    this.buffer[this.position++] = (value >> 8) & 0xff
  }

  writeBytes(bytes: Uint8Array | number[]) {
    this.ensureCapacity(bytes.length)
    if (bytes instanceof Uint8Array) {
      this.buffer.set(bytes, this.position)
      this.position += bytes.length
    } else {
      for (let i = 0; i < bytes.length; i++) {
        this.buffer[this.position++] = bytes[i] & 0xff
      }
    }
  }

  writeString(str: string) {
    this.ensureCapacity(str.length)
    for (let i = 0; i < str.length; i++) {
      this.buffer[this.position++] = str.charCodeAt(i) & 0xff
    }
  }

  getUint8Array(): Uint8Array {
    return this.buffer.subarray(0, this.position)
  }
}

/**
 * Builds an indexed palette from RGBA pixel data.
 */
function quantizeRgba(
  rgba: Uint8ClampedArray | Uint8Array,
  width: number,
  height: number,
  transparent: boolean
): {
  palette: number[]
  indexedPixels: Uint8Array
  transparentIndex: number
  colorBits: number
} {
  const pixelCount = width * height
  const indexedPixels = new Uint8Array(pixelCount)
  const palette: number[] = []

  if (transparent) {
    // Reserve index 0 for alpha. A 7 x 7 x 5 RGB cube gives 245 stable opaque
    // colors, avoids frame-by-frame nearest-neighbour searches, and leaves enough
    // room for the transparent entry inside a standard 256-color GIF palette.
    const redLevels = 7
    const greenLevels = 7
    const blueLevels = 5
    palette.push(0, 0, 0)
    for (let r = 0; r < redLevels; r += 1) {
      for (let g = 0; g < greenLevels; g += 1) {
        for (let b = 0; b < blueLevels; b += 1) {
          palette.push(
            Math.round((r * 255) / (redLevels - 1)),
            Math.round((g * 255) / (greenLevels - 1)),
            Math.round((b * 255) / (blueLevels - 1))
          )
        }
      }
    }

    for (let i = 0; i < pixelCount; i += 1) {
      const offset = i * 4
      if (rgba[offset + 3] < 128) {
        indexedPixels[i] = 0
        continue
      }
      const r = Math.min(redLevels - 1, Math.round((rgba[offset] * (redLevels - 1)) / 255))
      const g = Math.min(greenLevels - 1, Math.round((rgba[offset + 1] * (greenLevels - 1)) / 255))
      const b = Math.min(blueLevels - 1, Math.round((rgba[offset + 2] * (blueLevels - 1)) / 255))
      indexedPixels[i] = 1 + (r * greenLevels + g) * blueLevels + b
    }
  } else {
    // Classic 3-3-2 fixed RGB cube: exactly 256 entries and O(1) work per pixel.
    // GIF is already limited to 8-bit indexed color, so this is both faster and
    // more predictable than keeping the first 256 arbitrary anti-aliased colors.
    for (let r = 0; r < 8; r += 1) {
      for (let g = 0; g < 8; g += 1) {
        for (let b = 0; b < 4; b += 1) {
          palette.push(Math.round((r * 255) / 7), Math.round((g * 255) / 7), Math.round((b * 255) / 3))
        }
      }
    }
    for (let i = 0; i < pixelCount; i += 1) {
      const offset = i * 4
      const r = rgba[offset] >> 5
      const g = rgba[offset + 1] >> 5
      const b = rgba[offset + 2] >> 6
      indexedPixels[i] = (r << 5) | (g << 2) | b
    }
  }

  while (palette.length < 256 * 3) palette.push(0, 0, 0)

  return {
    palette,
    indexedPixels,
    transparentIndex: transparent ? 0 : -1,
    colorBits: 8,
  }
}

/**
 * Compresses indexed pixel data with GIF LZW algorithm and writes to ByteWriter.
 */
function writeLzw(writer: ByteWriter, minCodeSize: number, indexedPixels: Uint8Array) {
  writer.writeByte(minCodeSize)

  const clearCode = 1 << minCodeSize
  const eoiCode = clearCode + 1
  let codeSize = minCodeSize + 1
  let maxCode = 1 << codeSize

  const table = new Map<number, number>()

  const resetTable = () => {
    table.clear()
    for (let i = 0; i < clearCode; i++) {
      table.set(i, i)
    }
    codeSize = minCodeSize + 1
    maxCode = 1 << codeSize
  }

  resetTable()

  let curAccum = 0
  let curBits = 0
  const packet = new Uint8Array(256)
  let packetLen = 0

  const flushPacket = () => {
    if (packetLen > 0) {
      writer.writeByte(packetLen)
      for (let i = 0; i < packetLen; i++) {
        writer.writeByte(packet[i])
      }
      packetLen = 0
    }
  }

  const writeBits = (code: number) => {
    curAccum |= code << curBits
    curBits += codeSize
    while (curBits >= 8) {
      packet[packetLen++] = curAccum & 0xff
      if (packetLen >= 254) {
        flushPacket()
      }
      curAccum >>= 8
      curBits -= 8
    }
  }

  // Initial Clear code
  writeBits(clearCode)

  if (indexedPixels.length > 0) {
    let prefix = indexedPixels[0]
    let nextCode = eoiCode + 1

    for (let i = 1; i < indexedPixels.length; i++) {
      const k = indexedPixels[i]
      const key = (prefix << 12) | k

      if (table.has(key)) {
        prefix = table.get(key)!
      } else {
        writeBits(prefix)

        if (nextCode < 4096) {
          table.set(key, nextCode++)
          if (nextCode > maxCode && codeSize < 12) {
            codeSize++
            maxCode = 1 << codeSize
          }
        } else {
          // Table full -> reset
          writeBits(clearCode)
          resetTable()
          nextCode = eoiCode + 1
        }
        prefix = k
      }
    }
    writeBits(prefix)
  }

  // End of Information
  writeBits(eoiCode)

  // Flush remaining bits
  if (curBits > 0) {
    packet[packetLen++] = curAccum & 0xff
  }
  flushPacket()

  // Block terminator
  writer.writeByte(0x00)
}

export class GifEncoder {
  readonly width: number
  readonly height: number
  private writer: ByteWriter
  private hasWrittenHeader = false
  private frameCount = 0

  constructor(width: number, height: number) {
    this.width = Math.max(1, Math.round(width))
    this.height = Math.max(1, Math.round(height))
    this.writer = new ByteWriter()
  }

  private writeHeader(loopCount = 0) {
    if (this.hasWrittenHeader) return
    this.hasWrittenHeader = true

    // GIF89a Header
    this.writer.writeString('GIF89a')

    // Logical Screen Descriptor
    this.writer.writeShort(this.width)
    this.writer.writeShort(this.height)
    this.writer.writeByte(0x70) // No GCT, 8-bit color resolution
    this.writer.writeByte(0x00) // Background color index
    this.writer.writeByte(0x00) // Pixel aspect ratio

    // Netscape 2.0 Loop Extension
    if (loopCount >= 0) {
      this.writer.writeByte(0x21) // Extension Introducer
      this.writer.writeByte(0xff) // Application Extension
      this.writer.writeByte(0x0b) // Block size 11
      this.writer.writeString('NETSCAPE2.0')
      this.writer.writeByte(0x03) // Sub-block size
      this.writer.writeByte(0x01) // Loop sub-block id
      this.writer.writeShort(loopCount) // 0 = infinite
      this.writer.writeByte(0x00) // Block terminator
    }
  }

  /**
   * Adds a single frame from an RGBA buffer (Uint8ClampedArray from Canvas getImageData).
   */
  addFrame(rgba: Uint8ClampedArray | Uint8Array, options: GifFrameOptions = { delayMs: 40 }) {
    this.writeHeader(0)
    this.frameCount++

    const delayMs = Math.max(20, options.delayMs || 40)
    const delayHundredths = Math.round(delayMs / 10)
    const transparent = options.transparent ?? false
    const disposal = options.disposal ?? (transparent ? 2 : 1)

    const { palette, indexedPixels, transparentIndex, colorBits } = quantizeRgba(
      rgba,
      this.width,
      this.height,
      transparent
    )

    // Graphic Control Extension (GCE)
    this.writer.writeByte(0x21) // Extension Introducer
    this.writer.writeByte(0xf9) // Graphic Control Label
    this.writer.writeByte(0x04) // Block size 4

    const hasTransparency = transparent && transparentIndex >= 0
    const packed = (disposal << 2) | (hasTransparency ? 1 : 0)
    this.writer.writeByte(packed)
    this.writer.writeShort(delayHundredths) // Delay time in 1/100s
    this.writer.writeByte(hasTransparency ? transparentIndex : 0)
    this.writer.writeByte(0x00) // Block terminator

    // Image Descriptor
    this.writer.writeByte(0x2c) // Image Separator
    this.writer.writeShort(0) // Left
    this.writer.writeShort(0) // Top
    this.writer.writeShort(this.width)
    this.writer.writeShort(this.height)

    // Local Color Table Flag (0x80) + Size bits
    const lctPacked = 0x80 | (colorBits - 1)
    this.writer.writeByte(lctPacked)

    // Local Color Table
    this.writer.writeBytes(palette)

    // LZW Raster Data
    const minCodeSize = Math.max(2, colorBits)
    writeLzw(this.writer, minCodeSize, indexedPixels)
  }

  /**
   * Finishes encoding and returns the complete GIF file as Uint8Array.
   */
  finish(): Uint8Array {
    if (!this.hasWrittenHeader) {
      this.writeHeader(0)
    }
    // GIF Trailer
    this.writer.writeByte(0x3b)
    return this.writer.getUint8Array()
  }

  /**
   * Returns a Blob ready for download or preview.
   */
  toBlob(): Blob {
    const bytes = this.finish()
    return new Blob([bytes as BlobPart], { type: 'image/gif' })
  }
}
