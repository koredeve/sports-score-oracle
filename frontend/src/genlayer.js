import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

export const CONTRACT_ADDRESS = '0xBBabd65a1e32d6765361b5c310E24b590CCD5d75';

export function makeClient(privateKey) {
  const opts = { chain: studionet };
  if (privateKey) {
    opts.account = createAccount(privateKey);
  }
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
