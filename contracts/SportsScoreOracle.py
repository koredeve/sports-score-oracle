# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

from genlayer import *
from dataclasses import dataclass
import json


ERROR_EXPECTED = "[EXPECTED]"
ERROR_EXTERNAL = "[EXTERNAL]"
ERROR_TRANSIENT = "[TRANSIENT]"
ERROR_LLM = "[LLM_ERROR]"

STATUS_UPCOMING = "upcoming"
STATUS_FINAL = "final"

WINNER_HOME = "home"
WINNER_AWAY = "away"
WINNER_DRAW = "draw"


def _handle_leader_error(leaders_res, leader_fn) -> bool:
	leader_msg = leaders_res.message if hasattr(leaders_res, "message") else ""
	try:
		leader_fn()
		return False
	except gl.vm.UserError as e:
		validator_msg = e.message if hasattr(e, "message") else str(e)
		if validator_msg.startswith(ERROR_EXPECTED) or validator_msg.startswith(ERROR_EXTERNAL):
			return validator_msg == leader_msg
		if validator_msg.startswith(ERROR_TRANSIENT) and leader_msg.startswith(ERROR_TRANSIENT):
			return True
		return False
	except Exception:
		return False


@allow_storage
@dataclass
class Game:
	description: str
	status: str
	home_score: u256
	away_score: u256
	winner: str


class SportsScoreOracle(gl.Contract):
	owner_addr: Address
	games: TreeMap[str, Game]
	game_ids: DynArray[str]

	def __init__(self) -> None:
		self.owner_addr = gl.message.sender_address

	def _get_game(self, game_id: str) -> Game:
		game = self.games.get(game_id)
		if game is None:
			raise gl.vm.UserError(f"{ERROR_EXPECTED} Unknown game id")
		return game

	def _winner_for(self, home: int, away: int) -> str:
		if home > away:
			return WINNER_HOME
		if away > home:
			return WINNER_AWAY
		return WINNER_DRAW

	@gl.public.view
	def owner(self) -> str:
		return str(self.owner_addr)

	@gl.public.view
	def total_games(self) -> u256:
		return u256(len(self.game_ids))

	@gl.public.view
	def get_game_ids(self) -> dict:
		ids = []
		for i in range(len(self.game_ids)):
			ids.append(str(self.game_ids[i]))
		return {"ids": ids}

	@gl.public.write
	def create_game(self, game_id: str, description: str) -> None:
		if gl.message.sender_address != self.owner_addr:
			raise gl.vm.UserError(f"{ERROR_EXPECTED} Only owner may create games")
		if game_id in self.games:
			raise gl.vm.UserError(f"{ERROR_EXPECTED} Game id already exists")
		self.games[game_id] = Game(
			description=description,
			status=STATUS_UPCOMING,
			home_score=u256(0),
			away_score=u256(0),
			winner="",
		)
		self.game_ids.append(game_id)

	@gl.public.write
	def submit_result(self, game_id: str, source_url: str) -> None:
		game = self._get_game(game_id)
		if game.status != STATUS_UPCOMING:
			raise gl.vm.UserError(f"{ERROR_EXPECTED} Game already final")

		def leader_fn() -> dict:
			res = gl.nondet.web.get(source_url)
			http_status = int(res.status)
			if http_status >= 500:
				raise gl.vm.UserError(
					f"{ERROR_TRANSIENT} Scoreboard returned HTTP {http_status}"
				)
			if http_status >= 400:
				raise gl.vm.UserError(
					f"{ERROR_EXTERNAL} Scoreboard returned HTTP {http_status}"
				)
			raw_body = res.body
			if raw_body is None:
				raise gl.vm.UserError(f"{ERROR_EXTERNAL} Empty scoreboard body")
			try:
				parsed = json.loads(raw_body.decode("utf-8"))
			except Exception:
				raise gl.vm.UserError(f"{ERROR_EXTERNAL} Malformed scoreboard body")
			if not isinstance(parsed, dict):
				raise gl.vm.UserError(f"{ERROR_EXTERNAL} Malformed scoreboard body")
			if parsed.get("status") != "FINAL":
				raise gl.vm.UserError(f"{ERROR_EXPECTED} Game not final yet")
			try:
				home = int(parsed["home_score"])
				away = int(parsed["away_score"])
			except Exception:
				raise gl.vm.UserError(f"{ERROR_EXTERNAL} Missing scores in scoreboard body")
			if home < 0 or away < 0:
				raise gl.vm.UserError(f"{ERROR_EXTERNAL} Negative score in scoreboard body")
			return {"home": int(home), "away": int(away)}

		def validator_fn(leaders_res: gl.vm.Result) -> bool:
			if not isinstance(leaders_res, gl.vm.Return):
				return _handle_leader_error(leaders_res, leader_fn)
			try:
				leader_home = int(leaders_res.calldata.get("home", -1))
				leader_away = int(leaders_res.calldata.get("away", -1))
				fresh = leader_fn()
			except Exception:
				return False
			return leader_home == int(fresh["home"]) and leader_away == int(fresh["away"])

		result = gl.vm.run_nondet_unsafe(leader_fn, validator_fn)

		home_val = u256(int(result["home"]))
		away_val = u256(int(result["away"]))
		game.home_score = home_val
		game.away_score = away_val
		game.winner = self._winner_for(int(home_val), int(away_val))
		game.status = STATUS_FINAL

	@gl.public.view
	def get_result(self, game_id: str) -> dict:
		game = self._get_game(game_id)
		return {
			"description": game.description,
			"status": game.status,
			"home_score": game.home_score,
			"away_score": game.away_score,
			"winner": game.winner,
		}

	@gl.public.view
	def is_final(self, game_id: str) -> bool:
		game = self._get_game(game_id)
		return game.status == STATUS_FINAL
