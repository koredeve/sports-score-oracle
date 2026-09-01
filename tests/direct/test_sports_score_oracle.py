import json

SCORE_URL_A = "https://provider-a.example.com/games/game-1.json"
SCORE_URL_B = "https://provider-b.example.com/games/game-1.json"

REGEX_A = r"provider-a\.example\.com"
REGEX_B = r"provider-b\.example\.com"

DESCRIPTION = "Derby County vs Rovers, season finale"


def _deploy(direct_vm, direct_deploy, who):
    direct_vm.sender = who
    contract = direct_deploy("contracts/SportsScoreOracle.py")
    contract.approve_source("https://provider-a.example.com/", "Provider A")
    contract.approve_source("https://provider-b.example.com/", "Provider B")
    return contract


def _create_game(direct_vm, contract, owner, game_id="game-1"):
    direct_vm.sender = owner
    contract.create_game(game_id, DESCRIPTION, [SCORE_URL_A, SCORE_URL_B])


def _mock_both(direct_vm, home, away, game_id="game-1", status="FINAL"):
    direct_vm.mock_web(
        REGEX_A,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": game_id, "status": status, "home_score": home, "away_score": away}
            ),
        },
    )
    direct_vm.mock_web(
        REGEX_B,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": game_id, "status": status, "home_score": home, "away_score": away}
            ),
        },
    )


def test_create_game_requires_at_least_two_approved_sources(
    direct_vm, direct_deploy, direct_alice
):
    """Creating a game requires at least 2 independent approved sources."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice

    # Only 1 source -> rejected
    with direct_vm.expect_revert("At least 2 independent provider source URLs required"):
        contract.create_game("g-single", DESCRIPTION, [SCORE_URL_A])

    # Unapproved source -> rejected
    with direct_vm.expect_revert("not owner-approved"):
        contract.create_game("g-unapproved", DESCRIPTION, [SCORE_URL_A, "https://evil.com/fake.json"])

    # Duplicate exact URL -> rejected
    with direct_vm.expect_revert("Duplicate source URL"):
        contract.create_game("g-dup", DESCRIPTION, [SCORE_URL_A, SCORE_URL_A])

    # Two different URLs from the SAME provider prefix -> rejected (must be distinct independent providers)
    with direct_vm.expect_revert("distinct independent provider"):
        contract.create_game(
            "g-same-provider",
            DESCRIPTION,
            [
                "https://provider-a.example.com/endpoint1.json",
                "https://provider-a.example.com/endpoint2.json",
            ],
        )

    # Valid 2 independent sources on distinct approved providers -> accepted
    _create_game(direct_vm, contract, direct_alice, "game-1")
    assert contract.total_games() == 1

    res = contract.get_result("game-1")
    assert res["description"] == DESCRIPTION
    assert res["status"] == "upcoming"
    assert len(res["sources"]) == 2
    assert contract.is_final("game-1") is False


def test_create_game_is_owner_only(direct_vm, direct_deploy, direct_alice, direct_bob):
    """Only the owner may create games and approve/revoke sources."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only owner"):
            contract.create_game("game-x", DESCRIPTION, [SCORE_URL_A, SCORE_URL_B])

    with direct_vm.prank(direct_bob):
        with direct_vm.expect_revert("Only owner"):
            contract.approve_source("https://provider-c.com/", "Provider C")


def test_submit_result_corroborates_independent_providers_home_wins(
    direct_vm, direct_deploy, direct_alice
):
    """When both independent providers agree on a FINAL 3:1 score, the game finalizes with home win."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_both(direct_vm, 3, 1)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    res = contract.get_result("game-1")
    assert res["status"] == "final"
    assert res["home_score"] == 3
    assert res["away_score"] == 1
    assert res["winner"] == "home"
    assert res["corroborated_sources"] == 2
    assert contract.is_final("game-1") is True


def test_submit_result_draw(direct_vm, direct_deploy, direct_alice):
    """When independent providers agree on 2:2, winner is draw."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_both(direct_vm, 2, 2)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    res = contract.get_result("game-1")
    assert res["home_score"] == 2
    assert res["away_score"] == 2
    assert res["winner"] == "draw"


def test_submit_result_away_wins(direct_vm, direct_deploy, direct_alice):
    """When independent providers agree on 0:2, winner is away."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_both(direct_vm, 0, 2)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")

    res = contract.get_result("game-1")
    assert res["home_score"] == 0
    assert res["away_score"] == 2
    assert res["winner"] == "away"


def test_provider_disagreement_reverts(direct_vm, direct_deploy, direct_alice):
    """If independent providers disagree on the final score, settlement reverts to prevent erroneous on-chain truth."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)

    # Provider A reports 3:1, Provider B reports 2:1
    direct_vm.mock_web(
        REGEX_A,
        {"status": 200, "body": json.dumps({"game_id": "game-1", "status": "FINAL", "home_score": 3, "away_score": 1})},
    )
    direct_vm.mock_web(
        REGEX_B,
        {"status": 200, "body": json.dumps({"game_id": "game-1", "status": "FINAL", "home_score": 2, "away_score": 1})},
    )

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("disagree on final score"):
        contract.submit_result("game-1")

    assert contract.is_final("game-1") is False


def test_event_identity_mismatch_ignored_and_reverts_if_insufficient(
    direct_vm, direct_deploy, direct_alice
):
    """If a provider returns a payload for a different game_id, it is rejected by the event identity check."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)

    # Provider A has correct game_id, Provider B has wrong game_id
    direct_vm.mock_web(
        REGEX_A,
        {"status": 200, "body": json.dumps({"game_id": "game-1", "status": "FINAL", "home_score": 3, "away_score": 1})},
    )
    direct_vm.mock_web(
        REGEX_B,
        {"status": 200, "body": json.dumps({"game_id": "other-match", "status": "FINAL", "home_score": 3, "away_score": 1})},
    )

    direct_vm.sender = direct_alice
    # Since only 1 provider had matching event identity, insufficient providers (<2)
    with direct_vm.expect_revert("[TRANSIENT] Insufficient live independent provider reports"):
        contract.submit_result("game-1")

    assert contract.is_final("game-1") is False


def test_insufficient_live_providers_surfaces_as_transient(
    direct_vm, direct_deploy, direct_alice
):
    """If providers are down (HTTP 500 / 404), raises TRANSIENT so validators can retry later."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)

    direct_vm.mock_web(REGEX_A, {"status": 500, "body": "internal server error"})
    direct_vm.mock_web(REGEX_B, {"status": 200, "body": json.dumps({"game_id": "game-1", "status": "FINAL", "home_score": 3, "away_score": 1})})

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[TRANSIENT]"):
        contract.submit_result("game-1")


def test_non_final_game_status_reverts(direct_vm, direct_deploy, direct_alice):
    """If providers report game status is still IN_PROGRESS or LIVE, settlement is blocked."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_both(direct_vm, 1, 0, status="LIVE")

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("[TRANSIENT] Insufficient live independent provider reports"):
        contract.submit_result("game-1")

    assert contract.is_final("game-1") is False


def test_double_submit_is_reverted(direct_vm, direct_deploy, direct_alice):
    """An already finalized game cannot be re-settled."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice)
    _mock_both(direct_vm, 3, 1)

    direct_vm.sender = direct_alice
    contract.submit_result("game-1")
    assert contract.is_final("game-1") is True

    with direct_vm.expect_revert("Game already final"):
        contract.submit_result("game-1")


def test_revoke_source_and_empty_inputs(direct_vm, direct_deploy, direct_alice):
    """Owner can revoke sources and empty inputs are rejected."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Game id and description must not be empty"):
        contract.create_game("", "desc", [SCORE_URL_A, SCORE_URL_B])

    contract.revoke_source("https://provider-a.example.com/")
    with direct_vm.expect_revert("not owner-approved"):
        contract.create_game("g-revoked", DESCRIPTION, [SCORE_URL_A, SCORE_URL_B])

