# Sports Score Oracle

Publishes finalized sports results on-chain by reading live scoreboard pages through AI-validator consensus. Betting apps, fantasy leagues, and game engines read trustworthy finals from chain instead of scraping sites themselves.

## Architecture

**Source integrity:** every game is permanently bound at creation to a scoreboard URL under an owner-approved source prefix (`approve_source` / `revoke_source`, owner-only). `submit_result` takes no URL — validators fetch only the bound, authoritative source, so no caller can settle a game against fabricated JSON.

- **User action:** owner registers a game; anyone submits a scoreboard URL once play ends.
- **Evidence source:** the provided live scoreboard URL returning JSON `{"status": "FINAL", "home_score": n, "away_score": n}`.
- **Non-deterministic call:** `gl.nondet.web.get()` fetches the page inside the leader function.
- **Equivalence principle:** custom validator reruns the fetch independently and accepts only when both runs see status `FINAL` and *exactly identical* scores. 4xx → `[EXTERNAL]`, 5xx → `[TRANSIENT]`, business rules → `[EXPECTED]`.
- **Settlement effect:** game flips to `final`, scores and winner (`home` / `away` / `draw`) stored on-chain.
- **Appeal path:** GenLayer Optimistic Democracy gives leader-proposes / validator-check / appeal-window semantics natively; a wrong result can be appealed before finalization.

## Quickstart

```bash
python3.14 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
genvm-lint check contracts/SportsScoreOracle.py --json
pytest tests/direct/ -v
```

Integration smoke (needs a network): `gltest tests/integration/ -v -s`.

## Interface

| Method | Type | Notes |
|---|---|---|
| `create_game(game_id, description)` | write | owner only |
| `submit_result(game_id, source_url)` | write | nondet resolution, exact-score equivalence |
| `get_result(game_id)` | view | description, status, scores, winner |
| `is_final(game_id)` | view | bool |
| `total_games()` | view | count |
| `owner()` | view | deployer address |

## StudioNet

StudioNet is gasless — a 0 GEN balance is expected and sufficient for deploys and calls.


## Frontend (live)

React + Vite app using genlayer-js, deployed on Vercel: **https://sports-score-oracle.vercel.app**

- Lists all games straight from chain (`get_game_ids` / `get_result`)
- Owner: create games; anyone: submit a scoreboard URL and watch AI validators settle it
- Paste your private key to transact (kept in memory only — never stored or sent anywhere); read-only mode works keyless

```bash
cd frontend && npm install && npm run dev
```

Contract address is pinned in `frontend/src/genlayer.js`.

### Tests

```bash
cd frontend
npm install
npm test        # unit tests: unit conversions, pool math, keystore encryption
npm run smoke   # live read-only check against StudioNet
```

The wallet is fully local: keys are generated in-browser, encrypted with AES-GCM
(PBKDF2-SHA256, 310k iterations), downloadable as a keystore backup file, and
only ever decrypted in memory — nothing is stored or transmitted.
