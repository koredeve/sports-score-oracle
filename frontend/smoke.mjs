import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';

const CONTRACT_ADDRESS = '0xBBabd65a1e32d6765361b5c310E24b590CCD5d75';

const client = createClient({ chain: studionet });

const ids = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: 'get_game_ids',
  args: [],
});
console.log('game ids:', JSON.stringify(ids));

const total = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: 'total_games',
  args: [],
});
console.log('total games:', total);

const g = await client.readContract({
  address: CONTRACT_ADDRESS,
  functionName: 'is_final',
  args: ['g1'],
});
console.log('is_final(g1):', g);
