export const GEN = (n) => BigInt(Math.round(n * 10 ** 18));
export const ATTO = 10n ** 18n;

export function toGen(atto) {
  try {
    return Number(BigInt(atto) / 10n ** 15n) / 1000;
  } catch {
    return 0;
  }
}

export function truncateHash(h, lead = 6, tail = 4) {
  if (!h) return '';
  const s = String(h);
  if (s.length <= lead + tail + 2) return s;
  return `${s.slice(0, lead)}…${s.slice(-tail)}`;
}

export function winnerLabel(w) {
  if (w === 'home') return 'Home win';
  if (w === 'away') return 'Away win';
  if (w === 'draw') return 'Draw';
  return '—';
}

export function statusClass(status) {
  if (status === 'final' || status === 'resolved') return 'ok';
  if (status === 'upcoming' || status === 'open') return 'open';
  return '';
}

export function explorerAddressUrl(addr) {
  return `https://explorer-studio.genlayer.com/address/${addr}`;
}

export function explorerTxUrl(hash) {
  return `https://explorer-studio.genlayer.com/tx/${hash}`;
}

export function pct(part, whole) {
  const p = BigInt(whole);
  if (p === 0n) return 0;
  return Number((BigInt(part) * 10000n) / p) / 100;
}
