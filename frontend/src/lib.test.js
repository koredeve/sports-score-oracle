import { describe, it, expect } from 'vitest';
import {
  GEN,
  toGen,
  truncateHash,
  winnerLabel,
  statusClass,
  explorerAddressUrl,
  explorerTxUrl,
  pct,
} from './lib.js';

describe('GEN unit conversions', () => {
  it('converts GEN to atto', () => {
    expect(GEN(1)).toBe(1000000000000000000n);
    expect(GEN(2.5)).toBe(2500000000000000000n);
    expect(GEN(0)).toBe(0n);
  });

  it('converts atto back to GEN', () => {
    expect(toGen(1000000000000000000n)).toBe(1);
    expect(toGen('2000000000000000000')).toBe(2);
    expect(toGen(500000000000000000n)).toBe(0.5);
  });

  it('roundtrips', () => {
    expect(toGen(GEN(7.25))).toBe(7.25);
  });

  it('handles junk input safely', () => {
    expect(toGen(undefined)).toBe(0);
    expect(toGen('not-a-number')).toBe(0);
  });
});

describe('truncateHash', () => {
  it('shortens long hashes', () => {
    const h = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
    expect(truncateHash(h)).toBe('0x1234…cdef');
  });

  it('leaves short strings alone', () => {
    expect(truncateHash('0x1234')).toBe('0x1234');
    expect(truncateHash('')).toBe('');
  });
});

describe('winnerLabel', () => {
  it('maps winner codes', () => {
    expect(winnerLabel('home')).toBe('Home win');
    expect(winnerLabel('away')).toBe('Away win');
    expect(winnerLabel('draw')).toBe('Draw');
    expect(winnerLabel('')).toBe('—');
  });
});

describe('statusClass', () => {
  it('maps statuses to css classes', () => {
    expect(statusClass('final')).toBe('ok');
    expect(statusClass('upcoming')).toBe('open');
    expect(statusClass('weird')).toBe('');
  });
});

describe('explorer urls', () => {
  it('builds address and tx links', () => {
    expect(explorerAddressUrl('0xabc')).toBe(
      'https://explorer-studio.genlayer.com/address/0xabc'
    );
    expect(explorerTxUrl('0xdef')).toBe(
      'https://explorer-studio.genlayer.com/tx/0xdef'
    );
  });
});

describe('pct', () => {
  it('computes pool shares', () => {
    expect(pct(6, 10)).toBe(60);
    expect(pct(2, 8)).toBe(25);
    expect(pct(1, 0)).toBe(0);
  });
});
