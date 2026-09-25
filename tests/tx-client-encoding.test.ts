import { describe, expect, it } from 'vitest';
import {
  bytesToHex,
  encodeFunctionData,
  formatEther,
  functionSelector,
  keccak256Hex,
  parseEther
} from '../packages/tx-client/src/index';

const encoder = new TextEncoder();

describe('keccak256', () => {
  it('matches known Ethereum hash vectors', () => {
    expect(keccak256Hex(new Uint8Array())).toBe(
      '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
    );
    expect(keccak256Hex(encoder.encode('abc'))).toBe(
      '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
    );
  });

  it('derives canonical function selectors', () => {
    expect(bytesToHex(functionSelector('transfer(address,uint256)'))).toBe('a9059cbb');
    expect(bytesToHex(functionSelector('mint(uint256)'))).toBe('a0712d68');
    expect(bytesToHex(functionSelector('approve(address,uint256)'))).toBe('095ea7b3');
  });
});

describe('ABI encoding', () => {
  it('encodes a uint256 argument', () => {
    expect(encodeFunctionData('mint(uint256)', [1])).toBe(
      '0xa0712d680000000000000000000000000000000000000000000000000000000000000001'
    );
  });

  it('encodes an address argument', () => {
    expect(encodeFunctionData('transfer(address,uint256)', ['0x1111111111111111111111111111111111111111', 5])).toBe(
      '0xa9059cbb' +
        '0000000000000000000000001111111111111111111111111111111111111111' +
        '0000000000000000000000000000000000000000000000000000000000000005'
    );
  });

  it('normalizes uint to uint256 in the selector', () => {
    expect(encodeFunctionData('transfer(address,uint)', ['0x1111111111111111111111111111111111111111', 5])).toBe(
      encodeFunctionData('transfer(address,uint256)', ['0x1111111111111111111111111111111111111111', 5])
    );
  });

  it('encodes a dynamic string argument with offset and length', () => {
    const data = encodeFunctionData('setName(string)', ['hi']);
    expect(data).toBe(
      '0x' +
        'c47f0027' +
        '0000000000000000000000000000000000000000000000000000000000000020' +
        '0000000000000000000000000000000000000000000000000000000000000002' +
        '6869000000000000000000000000000000000000000000000000000000000000'
    );
  });

  it('rejects unsupported types and out-of-range values', () => {
    expect(() => encodeFunctionData('weird(tuple)', [[]])).toThrow(/Unsupported ABI type/);
    expect(() => encodeFunctionData('mint(uint8)', [999])).toThrow(/exceeds uint8 range/);
    expect(() => encodeFunctionData('mint(uint256)', [1n, 2n])).toThrow(/Expected 1 values/);
  });
});

describe('ether formatting', () => {
  it('formats and parses wei', () => {
    expect(formatEther(1_000_000_000_000_000_000n)).toBe('1');
    expect(formatEther(1_500_000_000_000_000_000n)).toBe('1.5');
    expect(parseEther('1.5')).toBe(1_500_000_000_000_000_000n);
    expect(formatEther(0n)).toBe('0');
  });
});
