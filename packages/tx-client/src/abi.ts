import { bytesToHex, concatBytes, hexToBytes } from './hex.js';
import { functionSelector } from './keccak.js';

export type AbiPrimitive =
  | { kind: 'uint'; bits: number }
  | { kind: 'int'; bits: number }
  | { kind: 'address' }
  | { kind: 'bool' }
  | { kind: 'bytesN'; size: number }
  | { kind: 'bytes' }
  | { kind: 'string' };

const WORD = 32;

export function parseAbiType(type: string): AbiPrimitive {
  const trimmed = type.trim();

  const uintMatch = /^uint(\d*)$/.exec(trimmed);
  if (uintMatch) {
    return { kind: 'uint', bits: uintMatch[1] ? Number(uintMatch[1]) : 256 };
  }

  const intMatch = /^int(\d*)$/.exec(trimmed);
  if (intMatch) {
    return { kind: 'int', bits: intMatch[1] ? Number(intMatch[1]) : 256 };
  }

  if (trimmed === 'address') {
    return { kind: 'address' };
  }
  if (trimmed === 'bool') {
    return { kind: 'bool' };
  }

  const bytesNMatch = /^bytes(\d+)$/.exec(trimmed);
  if (bytesNMatch) {
    return { kind: 'bytesN', size: Number(bytesNMatch[1]) };
  }

  if (trimmed === 'bytes') {
    return { kind: 'bytes' };
  }
  if (trimmed === 'string') {
    return { kind: 'string' };
  }

  throw new Error(`Unsupported ABI type: "${type}".`);
}

export function isDynamicType(type: string): boolean {
  const primitive = parseAbiType(type);
  return primitive.kind === 'bytes' || primitive.kind === 'string';
}

function toBigInt(value: unknown, label: string): bigint {
  if (typeof value === 'bigint') {
    return value;
  }
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`${label} must be an integer.`);
    }
    return BigInt(value);
  }
  if (typeof value === 'string') {
    return BigInt(value);
  }
  throw new Error(`${label} must be a bigint, integer, or numeric string.`);
}

function encodeUintWord(value: bigint): Uint8Array {
  if (value < 0n) {
    throw new Error('Unsigned integer value cannot be negative.');
  }
  if (value >= 1n << 256n) {
    throw new Error('Unsigned integer value exceeds 256 bits.');
  }
  const out = new Uint8Array(WORD);
  const hex = value.toString(16).padStart(WORD * 2, '0');
  out.set(hexToBytes(hex));
  return out;
}

function encodeIntWord(value: bigint): Uint8Array {
  if (value >= 1n << 255n || value < -(1n << 255n)) {
    throw new Error('Signed integer value exceeds 256 bits.');
  }
  const encoded = value < 0n ? (1n << 256n) + value : value;
  return encodeUintWord(encoded);
}

function padRightToWord(bytes: Uint8Array): Uint8Array {
  const remainder = bytes.length % WORD;
  if (remainder === 0) {
    return bytes;
  }
  return concatBytes(bytes, new Uint8Array(WORD - remainder));
}

function encodeDynamicBytes(bytes: Uint8Array): Uint8Array {
  return concatBytes(encodeUintWord(BigInt(bytes.length)), padRightToWord(bytes));
}

function encodeSingle(primitive: AbiPrimitive, value: unknown, label: string): Uint8Array {
  switch (primitive.kind) {
    case 'uint': {
      const parsed = toBigInt(value, label);
      if (primitive.bits !== 256) {
        const max = (1n << BigInt(primitive.bits)) - 1n;
        if (parsed > max) {
          throw new Error(`${label} exceeds uint${primitive.bits} range.`);
        }
      }
      return encodeUintWord(parsed);
    }
    case 'int':
      return encodeIntWord(toBigInt(value, label));
    case 'bool':
      if (typeof value !== 'boolean') {
        throw new Error(`${label} must be a boolean.`);
      }
      return encodeUintWord(value ? 1n : 0n);
    case 'address': {
      if (typeof value !== 'string' || !/^0x[a-fA-F0-9]{40}$/.test(value)) {
        throw new Error(`${label} must be a 20-byte hex address.`);
      }
      return concatBytes(new Uint8Array(12), hexToBytes(value));
    }
    case 'bytesN': {
      if (typeof value !== 'string') {
        throw new Error(`${label} must be a hex string.`);
      }
      const bytes = hexToBytes(value);
      if (bytes.length !== primitive.size) {
        throw new Error(`${label} must be exactly ${primitive.size} bytes.`);
      }
      return padRightToWord(bytes);
    }
    case 'bytes': {
      if (typeof value !== 'string') {
        throw new Error(`${label} must be a hex string.`);
      }
      return encodeDynamicBytes(hexToBytes(value));
    }
    case 'string': {
      if (typeof value !== 'string') {
        throw new Error(`${label} must be a string.`);
      }
      return encodeDynamicBytes(new TextEncoder().encode(value));
    }
    default: {
      const exhaustive: never = primitive;
      throw new Error(`Unreachable ABI primitive: ${JSON.stringify(exhaustive)}`);
    }
  }
}

export function encodeAbiParameters(types: string[], values: unknown[]): Uint8Array {
  if (types.length !== values.length) {
    throw new Error(`Expected ${types.length} values but received ${values.length}.`);
  }

  const primitives = types.map(parseAbiType);
  const headSize = primitives.length * WORD;

  const head: Uint8Array[] = [];
  const tail: Uint8Array[] = [];
  let tailLength = 0;

  primitives.forEach((primitive, index) => {
    const label = `argument ${index} (${types[index]})`;
    if (isDynamicType(types[index]!)) {
      head.push(encodeUintWord(BigInt(headSize + tailLength)));
      const encoded = encodeSingle(primitive, values[index], label);
      tail.push(encoded);
      tailLength += encoded.length;
    } else {
      head.push(encodeSingle(primitive, values[index], label));
    }
  });

  return concatBytes(...head, ...tail);
}

export interface ParsedSignature {
  name: string;
  parameterTypes: string[];
}

export function parseFunctionSignature(signature: string): ParsedSignature {
  const match = /^([A-Za-z_$][A-Za-z0-9_$]*)\((.*)\)$/.exec(signature.trim());
  if (!match) {
    throw new Error(`Malformed function signature: "${signature}".`);
  }
  const rawParams = match[2]!.trim();
  const parameterTypes = rawParams.length === 0 ? [] : rawParams.split(',').map((part) => part.trim());
  parameterTypes.forEach(parseAbiType);
  return { name: match[1]!, parameterTypes };
}

export function encodeFunctionData(signature: string, args: unknown[] = []): string {
  const { parameterTypes } = parseFunctionSignature(signature);
  const selector = functionSelector(canonicalSignature(signature));
  const body = encodeAbiParameters(parameterTypes, args);
  return `0x${bytesToHex(concatBytes(selector, body))}`;
}

/** Normalizes a signature so uint/int default to 256 bits before hashing the selector. */
export function canonicalSignature(signature: string): string {
  const { name, parameterTypes } = parseFunctionSignature(signature);
  const normalized = parameterTypes.map((type) => {
    if (type === 'uint') return 'uint256';
    if (type === 'int') return 'int256';
    return type;
  });
  return `${name}(${normalized.join(',')})`;
}

export function decodeAbiUint(hex: string): bigint {
  const bytes = hexToBytes(hex);
  if (bytes.length < WORD) {
    throw new Error('Expected at least one 32-byte word to decode.');
  }
  let value = 0n;
  for (let i = 0; i < WORD; i += 1) {
    value = (value << 8n) | BigInt(bytes[i]!);
  }
  return value;
}

export function decodeAbiBool(hex: string): boolean {
  return decodeAbiUint(hex) !== 0n;
}

function readWord(bytes: Uint8Array, offset: number): bigint {
  let value = 0n;
  for (let i = 0; i < WORD; i += 1) {
    value = (value << 8n) | BigInt(bytes[offset + i] ?? 0);
  }
  return value;
}

function wordOffset(index: number): number {
  return index * WORD;
}

/**
 * Decodes return data for a list of ABI output types. Supports the same
 * primitives as the encoder; dynamic offsets follow the standard head/tail
 * layout used by the EVM ABI.
 */
export function decodeAbiParameters(types: string[], hex: string): unknown[] {
  const data = hexToBytes(hex.startsWith('0x') ? hex : `0x${hex}`);
  const primitives = types.map(parseAbiType);

  return primitives.map((primitive, index) => {
    const head = wordOffset(index);

    switch (primitive.kind) {
      case 'uint':
        return readWord(data, head);
      case 'int': {
        const raw = readWord(data, head);
        const bits = BigInt(primitive.bits);
        const limit = 1n << (bits - 1n);
        return raw >= limit ? raw - (1n << bits) : raw;
      }
      case 'bool':
        return readWord(data, head) !== 0n;
      case 'address': {
        const raw = readWord(data, head);
        return `0x${raw.toString(16).padStart(40, '0')}`;
      }
      case 'bytesN': {
        const slice = data.slice(head, head + primitive.size);
        return `0x${bytesToHex(slice)}`;
      }
      case 'bytes':
      case 'string': {
        const offset = wordOffset(index);
        const pointer = Number(readWord(data, offset));
        const length = Number(readWord(data, pointer));
        const start = pointer + WORD;
        const slice = data.slice(start, start + length);
        return primitive.kind === 'bytes'
          ? `0x${bytesToHex(slice)}`
          : new TextDecoder().decode(slice);
      }
      default: {
        const exhaustive: never = primitive;
        throw new Error(`Unreachable ABI primitive: ${JSON.stringify(exhaustive)}`);
      }
    }
  });
}
