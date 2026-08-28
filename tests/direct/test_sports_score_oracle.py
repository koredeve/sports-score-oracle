import json

SCORE_URL = "https://scores.example.com/games/game-1.json"
URL_REGEX = r"scores\.example\.com"

DESCRIPTION = "Derby County vs Rovers, season finale"


def _deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    contract = direct_deploy("contracts/SportsScoreOracle.py")
    contract.approve_source("https://scores.example.com/", "Example Scoreboard")
    return contract


def _create_game(direct_vm, contract, owner, game_id="game-1"):
    direct_vm.sender = owner
    contract.create_game(game_id, DESCRIPTION, SCORE_URL)


def _mock_final(direct_vm, home, away):
    direct_vm.mock_web(
        URL_REGEX,
        {
            "status": 200,
            "body": json.dumps(
                {"status": "FINAL", "home_score": home, "away_score": away}
            ),
        },
    )


def test_create_game_stores_state_and_rejects_duplicate_id(
    direct_vm, direct_deploy, direct_alice
):
    """The owner creates a game and the stored state is visible via views."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)

    assert len(contract.owner()) > 0
    assert contract.total_games() == 1

    result = contract.get_result("game-1")
    assert result["description"] == DESCRIPTION
    assert result["status"] == "upcoming"
    assert result["home_score"] == 0
    assert result["away_score"] == 0
    assert result["winner"] == ""
    assert contract.is_final("game-1") is False

    with direct_vm.expect_revert("Game id already exists"):
        _create_game(direct_vm, contract, direct_alice)
    assert contract.total_games() == 1


def test_create_game_is_owner_only(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Only the deployer (owner) may create games."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only owner"):
            contract.create_game("game-x", DESCRIPTION, SCORE_URL)
    assert contract.total_games() == 0

    # unapproved scoreboard sources are rejected at creation
    with direct_vm.expect_revert("not owner-approved"):
        contract.create_game("game-y", DESCRIPTION, "https://evil.example.com/fake.json")

    _create_game(direct_vm, contract, direct_alice)
    assert contract.total_games() == 1


def test_submit_result_home_wins(direct_vm, direct_deploy, direct_alice):
    """A FINAL 3:1 scoreboard settles the game with winner `home`."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_final(direct_vm, 3, 1)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    result = contract.get_result("game-1")
    assert result["status"] == "final"
    assert result["home_score"] == 3
    assert result["away_score"] == 1
    assert result["winner"] == "home"
    assert contract.is_final("game-1") is True


def test_submit_result_draw(direct_vm, direct_deploy, direct_alice):
    """A FINAL 2:2 scoreboard settles the game with winner `draw`."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_final(direct_vm, 2, 2)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    result = contract.get_result("game-1")
    assert result["home_score"] == 2
    assert result["away_score"] == 2
    assert result["winner"] == "draw"


def test_submit_result_away_wins(direct_vm, direct_deploy, direct_alice):
    """A FINAL 0:2 scoreboard settles the game with winner `away`."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_final(direct_vm, 0, 2)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    result = contract.get_result("game-1")
    assert result["home_score"] == 0
    assert result["away_score"] == 2
    assert result["winner"] == "away"


def test_double_submit_is_reverted(direct_vm, direct_deploy, direct_alice):
    """An already final game cannot be settled again and keeps its result."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_final(direct_vm, 3, 1)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    with direct_vm.expect_revert("Game already final"):
        contract.submit_result("game-1")

    result = contract.get_result("game-1")
    assert result["status"] == "final"
    assert result["winner"] == "home"
    assert contract.total_games() == 1


def test_unknown_game_id_is_reverted(direct_vm, direct_deploy, direct_alice):
    """Submitting a result for an unknown game id is rejected."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _mock_final(direct_vm, 3, 1)

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Unknown game id"):
        contract.submit_result("missing-game")

    with direct_vm.expect_revert("Unknown game id"):
        contract.get_result("missing-game")


def test_non_final_scoreboard_status_is_reverted(
    direct_vm, direct_deploy, direct_alice
):
    """A scoreboard that is still LIVE does not settle the game."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    direct_vm.mock_web(
        URL_REGEX,
        {
            "status": 200,
            "body": json.dumps(
                {"status": "LIVE", "home_score": 1, "away_score": 0}
            ),
        },
    )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[EXPECTED]"):
        contract.submit_result("game-1")

    result = contract.get_result("game-1")
    assert result["status"] == "upcoming"
    assert result["winner"] == ""
    assert contract.is_final("game-1") is False


def test_malformed_scoreboard_body_is_reverted(direct_vm, direct_deploy, direct_alice):
    """Unparseable scoreboard output surfaces as an [EXTERNAL] UserError and leaves the game upcoming."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    direct_vm.mock_web(URL_REGEX, {"status": 200, "body": "<html>502 Oops</html>"})

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[EXTERNAL]"):
        contract.submit_result("game-1")

    result = contract.get_result("game-1")
    assert result["status"] == "upcoming"
    assert contract.is_final("game-1") is False


def test_http_error_statuses_are_classified(direct_vm, direct_deploy, direct_alice):
    """4xx responses are [EXTERNAL], 5xx responses are [TRANSIENT]; neither settles the game."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice
    contract.approve_source("https://not-found.example.com/", "Broken 404")
    contract.approve_source("https://down.example.com/", "Broken 503")
    contract.create_game("game-a2", "Broken 404 game", "https://not-found.example.com/a.json")
    contract.create_game("game-b2", "Broken 503 game", "https://down.example.com/b.json")

    direct_vm.mock_web(r"not-found\.example\.com", {"status": 404, "body": "gone"})
    direct_vm.mock_web(r"down\.example\.com", {"status": 503, "body": "unavailable"})

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[EXTERNAL]"):
        contract.submit_result("game-a2")
    with direct_vm.expect_revert("[TRANSIENT]"):
        contract.submit_result("game-b2")

    assert contract.is_final("game-a2") is False
    assert contract.is_final("game-b2") is False
    assert contract.total_games() == 2


def test_empty_game_inputs_and_payload_id_mismatch(direct_vm, direct_deploy, direct_alice):
    """Empty inputs at creation and game_id mismatch in payload are rejected."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("must not be empty"):
        contract.create_game("  ", "desc", SCORE_URL)

    with direct_vm.expect_revert("must not be empty"):
        contract.create_game("game-1", "  ", SCORE_URL)

    _create_game(direct_vm, contract, direct_alice, "game-1")

    direct_vm.mock_web(
        URL_REGEX,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": "different-game", "status": "FINAL", "home_score": 10, "away_score": 8}
            ),
        },
    )

    with direct_vm.expect_revert("payload game_id mismatch"):
        contract.submit_result("game-1")

