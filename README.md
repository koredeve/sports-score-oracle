# Sports Score Oracle

Publishes finalized sports results on-chain by reading live scoreboard pages through AI-validator consensus. Betting apps, fantasy leagues, and game engines read trustworthy finals from chain instead of scraping sites themselves.

## Architecture

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
