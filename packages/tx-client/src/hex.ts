const HEX_CHARS = '0123456789abcdef';

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) {
    out += HEX_CHARS[byte >>> 4]! + HEX_CHARS[byte & 0x0f]!;
  }
  return out;
}

export function hexToBytes(hex: string): Uint8Array {
  const normalized = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (normalized.length % 2 !== 0) {
    throw new Error('Hex value must have an even number of digits.');
  }
  const out = new Uint8Array(normalized.length / 2);
  for (let i = 0; i < out.length; i += 1) {
    const byte = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    if (Number.isNaN(byte)) {
      throw new Error('Hex value contains non-hexadecimal characters.');
    }
    out[i] = byte;
  }
  return out;
}

export function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function bigIntToMinimalBytes(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error('Cannot encode a negative value as an unsigned integer.');
  }
  if (value === 0n) {
    return new Uint8Array(0);
  }
  let hex = value.toString(16);
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  return hexToBytes(hex);
}

export function bigIntToPaddedBytes(value: bigint, byteLength: number): Uint8Array {
  const out = new Uint8Array(byteLength);
  let hex = value.toString(16);
  if (hex.length > byteLength * 2) {
    throw new Error(`Value does not fit in ${byteLength} bytes.`);
  }
  if (hex.length % 2 !== 0) {
    hex = `0${hex}`;
  }
  const bytes = hexToBytes(hex);
  out.set(bytes, byteLength - bytes.length);
  return out;
}
