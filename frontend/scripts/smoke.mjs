// Read-only chain smoke test. Run: npm run smoke
// Verifies the deployed contract responds to reads on StudioNet.
import { createClient } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import { CONTRACT_ADDRESS } from '../src/genlayer.js';

const client = createClient({ chain: studionet });
const ids = await client.readContract({
  address: CONTRACT_ADDRESS, functionName: 'get_game_ids', args: [],
});
const total = await client.readContract({
  address: CONTRACT_ADDRESS, functionName: 'total_games', args: [],
});
console.log('game ids:', JSON.stringify(ids));
console.log('total games:', total);
if (typeof total !== 'object' && Number(total) >= Number((ids.ids || []).length)) {
  console.log('SMOKE PASS');
} else {
  console.error('SMOKE FAIL: inconsistent state');
  process.exit(1);
}
