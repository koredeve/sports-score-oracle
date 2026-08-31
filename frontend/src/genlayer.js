import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { explorerAddressUrl } from './lib.js';

export const CONTRACT_ADDRESS = '0x5A647380E6eE3B3761cfC10649e2643CdBa10033';
export const EXPLORER_URL = explorerAddressUrl(CONTRACT_ADDRESS);

export function makeClient(privateKey) {
  const opts = { chain: studionet };
  if (privateKey) opts.account = createAccount(privateKey);
  return createClient(opts);
}

export async function readGame(client, gameId) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_result',
    args: [gameId],
  });
}

export async function listGameIds(client) {
  const res = await client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'get_game_ids',
    args: [],
  });
  return (res && res.ids) || [];
}

export async function readOwner(client) {
  return client.readContract({
    address: CONTRACT_ADDRESS,
    functionName: 'owner',
    args: [],
  });
}

export async function writeAndWait(client, functionName, args) {
  const hash = await client.writeContract({
    address: CONTRACT_ADDRESS,
    functionName,
    args,
  });
  await client.waitForTransactionReceipt({ hash, retries: 400 });
  return hash;
}
