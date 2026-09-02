import { createClient, createAccount } from 'genlayer-js';
import { studionet } from 'genlayer-js/chains';
import fs from 'fs';
import path from 'path';

const pk = '0x1000000000000000000000000000000000000000000000000000000000000001';
const client = createClient({
  chain: studionet,
  account: createAccount(pk),
});

async function main() {
  console.log('Reading contract code...');
  const contractPath = path.resolve('./contracts/SportsScoreOracle.py');
  const code = fs.readFileSync(contractPath, 'utf8');

  console.log('Deploying SportsScoreOracle to StudioNet...');
  const txHash = await client.deployContract({
    code,
    args: [],
  });
  console.log('Deployment Tx Hash:', txHash);

  const receipt = await client.waitForTransactionReceipt({
    hash: txHash,
    status: 'ACCEPTED',
    interval: 2000,
    retries: 45,
  });

  console.log('Deployment Receipt Status:', receipt.status_name);
  console.log('Contract Address:', receipt.contract_address);

  // Initialize approved sources on distinct hostnames
  console.log('Approving distinct independent provider sources...');
  const addr = receipt.contract_address;

  async function write(fn, args) {
    const hash = await client.writeContract({
      address: addr,
      functionName: fn,
      args,
    });
    console.log(`Sent ${fn}:`, hash);
    const r = await client.waitForTransactionReceipt({
      hash,
      status: 'ACCEPTED',
      interval: 2000,
      retries: 45,
    });
    console.log(`${fn} status:`, r.status_name);
  }

  await write('approve_source', ['https://api.espn.com/', 'ESPN Sports API']);
  await write('approve_source', ['https://api.thescore.com/', 'TheScore API']);
  await write('approve_source', ['https://api.bleacherreport.com/', 'Bleacher Report']);

  // Create demo games
  await write('create_game', [
    'nba-finals-2026-g7',
    'NBA Finals Game 7: Boston Celtics vs OKC Thunder',
    [
      'https://api.espn.com/v1/nba/games/nba-finals-2026-g7.json',
      'https://api.thescore.com/v1/nba/games/nba-finals-2026-g7.json',
    ],
  ]);

  await write('create_game', [
    'ucl-final-2026',
    'UEFA Champions League Final: Real Madrid vs Arsenal',
    [
      'https://api.espn.com/v1/soccer/ucl/ucl-final-2026.json',
      'https://api.bleacherreport.com/v1/soccer/ucl/ucl-final-2026.json',
    ],
  ]);

  console.log('\n========================================');
  console.log('NEW DEPLOYED CONTRACT ADDRESS:', receipt.contract_address);
  console.log('========================================');
}

main().catch(console.error);
