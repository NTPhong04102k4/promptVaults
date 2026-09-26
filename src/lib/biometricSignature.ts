// AioKin verifies with DSASignatureFormat.Rfc3279DerSequence (biometric plan, B-AUTH §7).
// The chosen native library does not document its output encoding, so normalise here.

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  bytes.forEach((b) => {
    binary += String.fromCharCode(b)
  })
  return btoa(binary)
}

function derInteger(value: Uint8Array): number[] {
  let start = 0
  while (start < value.length - 1 && value[start] === 0) start += 1
  const trimmed = Array.from(value.slice(start))
  if ((trimmed[0] ?? 0) & 0x80) trimmed.unshift(0) // keep it positive
  return [0x02, trimmed.length, ...trimmed]
}

export function rawToDer(raw: Uint8Array): Uint8Array {
  const r = derInteger(raw.slice(0, 32))
  const s = derInteger(raw.slice(32, 64))
  return Uint8Array.from([0x30, r.length + s.length, ...r, ...s])
}

export function isDerSignature(bytes: Uint8Array): boolean {
  if (bytes.length < 8 || bytes[0] !== 0x30 || bytes[1] !== bytes.length - 2) return false
  let offset = 2
  for (let k = 0; k < 2; k += 1) {
    if (bytes[offset] !== 0x02) return false
    const length = bytes[offset + 1] ?? 0
    if (length < 1 || length > 33) return false
    offset += 2 + length
  }
  return offset === bytes.length
}

export function ensureDerSignature(base64: string): string {
  const bytes = base64ToBytes(base64)
  if (isDerSignature(bytes)) return base64
  if (bytes.length === 64) return bytesToBase64(rawToDer(bytes))
  throw new Error('unsupported_signature_format')
}
