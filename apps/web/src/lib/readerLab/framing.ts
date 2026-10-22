export type Framer = {
  push(bytes: Uint8Array, ahoraMs: number): Uint8Array[]
  reset(): void
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  if (a.length === 0) return b
  if (b.length === 0) return a
  const out = new Uint8Array(a.length + b.length)
  out.set(a, 0)
  out.set(b, a.length)
  return out
}

export function createLineFramer(): Framer {
  let buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let skipLf = false
  return {
    push(bytes) {
      const frames: Uint8Array[] = []
      for (const byte of bytes) {
        if (skipLf) {
          skipLf = false
          if (byte === 0x0a) continue
        }
        if (byte === 0x0d || byte === 0x0a) {
          frames.push(buf)
          buf = new Uint8Array(0)
          skipLf = byte === 0x0d
          continue
        }
        const next = new Uint8Array(buf.length + 1)
        next.set(buf)
        next[buf.length] = byte
        buf = next
      }
      return frames
    },
    reset() {
      buf = new Uint8Array(0)
      skipLf = false
    },
  }
}

export function createSilenceFramer(gapMs: number): Framer {
  let buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  let lastMs: number | null = null
  return {
    push(bytes, ahoraMs) {
      const frames: Uint8Array[] = []
      if (lastMs != null && ahoraMs - lastMs > gapMs && buf.length > 0) {
        frames.push(buf)
        buf = new Uint8Array(0)
      }
      if (bytes.length > 0) {
        buf = concat(buf, bytes)
        lastMs = ahoraMs
      }
      return frames
    },
    reset() {
      buf = new Uint8Array(0)
      lastMs = null
    },
  }
}

export function createFixedLengthFramer(n: number): Framer {
  const size = Math.max(1, n)
  let buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  return {
    push(bytes) {
      buf = concat(buf, bytes)
      const frames: Uint8Array[] = []
      while (buf.length >= size) {
        frames.push(buf.slice(0, size))
        buf = buf.slice(size)
      }
      return frames
    },
    reset() {
      buf = new Uint8Array(0)
    },
  }
}

export function createStartEndFramer(start: number, end: number): Framer {
  let collecting = false
  let buf: Uint8Array<ArrayBufferLike> = new Uint8Array(0)
  return {
    push(bytes) {
      const frames: Uint8Array[] = []
      for (const byte of bytes) {
        if (!collecting) {
          if (byte === start) {
            collecting = true
            buf = new Uint8Array(0)
          }
          continue
        }
        if (byte === start) {
          buf = new Uint8Array(0)
          continue
        }
        if (byte === end) {
          frames.push(buf)
          buf = new Uint8Array(0)
          collecting = false
          continue
        }
        const next = new Uint8Array(buf.length + 1)
        next.set(buf)
        next[buf.length] = byte
        buf = next
      }
      return frames
    },
    reset() {
      collecting = false
      buf = new Uint8Array(0)
    },
  }
}

export type FramingKind = 'lineas' | 'silencio' | 'fija' | 'inicio-fin'

export function createFramer(
  kind: FramingKind,
  options: { silenceMs?: number; length?: number; start?: number; end?: number } = {},
): Framer {
  if (kind === 'silencio') return createSilenceFramer(options.silenceMs ?? 40)
  if (kind === 'fija') return createFixedLengthFramer(options.length ?? 8)
  if (kind === 'inicio-fin') {
    return createStartEndFramer(options.start ?? 0x02, options.end ?? 0x03)
  }
  return createLineFramer()
}
