import { bytesToHex, concatBytes, hexToBytes } from './hex.js';

// Minimal Keccak-256 (original padding, not SHA3) so the browser runtime carries
// no third-party crypto dependency. Uses 64-bit lanes via BigInt.

const MASK_64 = (1n << 64n) - 1n;

const ROUND_CONSTANTS = [
  0x0000000000000001n,
  0x0000000000008082n,
  0x800000000000808an,
  0x8000000080008000n,
  0x000000000000808bn,
  0x0000000080000001n,
  0x8000000080008081n,
  0x8000000000008009n,
  0x000000000000008an,
  0x0000000000000088n,
  0x0000000080008009n,
  0x000000008000000an,
  0x000000008000808bn,
  0x800000000000008bn,
  0x8000000000008089n,
  0x8000000000008003n,
  0x8000000000008002n,
  0x8000000000000080n,
  0x000000000000800an,
  0x800000008000000an,
  0x8000000080008081n,
  0x8000000000008080n,
  0x0000000080000001n,
  0x8000000080008008n
];

const ROTATION_OFFSETS = [
  [0, 36, 3, 41, 18],
  [1, 44, 10, 45, 2],
  [62, 6, 43, 15, 61],
  [28, 55, 25, 21, 56],
  [27, 20, 39, 8, 14]
];

function rotl(value: bigint, shift: number): bigint {
  const normalized = BigInt(shift % 64);
  if (normalized === 0n) {
    return value & MASK_64;
  }
  return ((value << normalized) | (value >> (64n - normalized))) & MASK_64;
}

function keccakF1600(state: bigint[]): void {
  for (let round = 0; round < 24; round += 1) {
    const c: bigint[] = [];
    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x]! ^ state[x + 5]! ^ state[x + 10]! ^ state[x + 15]! ^ state[x + 20]!;
    }

    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5]! ^ rotl(c[(x + 1) % 5]!, 1);
      for (let y = 0; y < 5; y += 1) {
        const index = x + 5 * y;
        state[index] = state[index]! ^ d;
      }
    }

    const b: bigint[] = new Array<bigint>(25).fill(0n);
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        const nextX = y;
        const nextY = (2 * x + 3 * y) % 5;
        b[nextX + 5 * nextY] = rotl(state[x + 5 * y]!, ROTATION_OFFSETS[x]![y]!);
      }
    }

    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] =
          b[x + 5 * y]! ^ (~b[((x + 1) % 5) + 5 * y]! & b[((x + 2) % 5) + 5 * y]!) & MASK_64;
      }
    }

    state[0] = (state[0]! ^ ROUND_CONSTANTS[round]!) & MASK_64;
  }
}

export function keccak256(input: Uint8Array): Uint8Array {
  const rate = 136; // 1088-bit rate for Keccak-256
  const state: bigint[] = new Array<bigint>(25).fill(0n);

  const padded = new Uint8Array(Math.ceil((input.length + 1) / rate) * rate);
  padded.set(input);
  padded.set([0x01], input.length);
  padded.set([padded[padded.length - 1]! | 0x80], padded.length - 1);

  for (let offset = 0; offset < padded.length; offset += rate) {
    for (let i = 0; i < rate; i += 1) {
      const lane = Math.floor(i / 8);
      const shift = BigInt((i % 8) * 8);
      state[lane] = (state[lane]! ^ (BigInt(padded[offset + i]!) << shift)) & MASK_64;
    }
    keccakF1600(state);
  }

  const output = new Uint8Array(32);
  for (let i = 0; i < 32; i += 1) {
    const lane = Math.floor(i / 8);
    const shift = BigInt((i % 8) * 8);
    output[i] = Number((state[lane]! >> shift) & 0xffn);
  }
  return output;
}

export function keccak256Hex(...inputs: Uint8Array[]): string {
  return `0x${bytesToHex(keccak256(concatBytes(...inputs)))}`;
}

/**
 * Ethereum function selector: the first four bytes of keccak256 of the canonical
 * signature, e.g. `transfer(address,uint256)`.
 */
export function functionSelector(signature: string): Uint8Array {
  return keccak256(new TextEncoder().encode(signature)).slice(0, 4);
}

/**
 * 4-byte event topic0 for a canonical event signature, e.g. `Transfer(address,address,uint256)`.
 */
export function eventTopic(signature: string): Uint8Array {
  return hexToBytes(keccak256Hex(new TextEncoder().encode(signature)));
}
