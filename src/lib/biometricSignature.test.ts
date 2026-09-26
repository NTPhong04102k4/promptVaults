import { generateKeyPairSync, randomBytes, sign, verify } from 'crypto'

import { ensureDerSignature } from './biometricSignature'

describe('ensureDerSignature', () => {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })

  it('converts IEEE P1363 (raw r||s) signatures to DER that verifies', () => {
    // 64 iterations hit leading-zero and high-bit r/s values.
    for (let i = 0; i < 64; i += 1) {
      const nonce = randomBytes(32)
      const raw = sign('sha256', nonce, { key: privateKey, dsaEncoding: 'ieee-p1363' })
      const der = Buffer.from(ensureDerSignature(raw.toString('base64')), 'base64')
      // Node 22's createPublicKey() rejects an already-public KeyObject
      // (ERR_CRYPTO_INVALID_KEY_OBJECT_TYPE), so pass publicKey straight through.
      expect(verify('sha256', nonce, { key: publicKey, dsaEncoding: 'der' }, der)).toBe(true)
    }
  })

  it('passes DER signatures through unchanged', () => {
    const der = sign('sha256', randomBytes(32), { key: privateKey, dsaEncoding: 'der' }).toString(
      'base64',
    )
    expect(ensureDerSignature(der)).toBe(der)
  })

  it('rejects anything else', () => {
    expect(() => ensureDerSignature(Buffer.from('nope').toString('base64'))).toThrow(
      'unsupported_signature_format',
    )
  })
})
