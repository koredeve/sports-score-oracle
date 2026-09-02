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

    # Two different URLs from the SAME hostname -> strictly rejected
    with direct_vm.expect_revert("distinct independent host/domain"):
        contract.create_game(
            "g-same-host",
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


def test_same_hostname_different_approved_prefixes_reverts(
    direct_vm, direct_deploy, direct_alice
):
    """Even if two separate prefixes on the same host are approved, they cannot be used together."""
    direct_vm.sender = direct_alice
    contract = direct_deploy("contracts/SportsScoreOracle.py")
    contract.approve_source("https://shared-host.com/feed1/", "Feed 1")
    contract.approve_source("https://shared-host.com/feed2/", "Feed 2")
    contract.approve_source("https://independent-host.com/", "Independent Host")

    # Trying to use feed1 and feed2 on shared-host.com -> must revert
    with direct_vm.expect_revert("distinct independent host/domain"):
        contract.create_game(
            "g-shared",
            DESCRIPTION,
            [
                "https://shared-host.com/feed1/game.json",
                "https://shared-host.com/feed2/game.json",
            ],
        )

    # Combining one feed from shared-host.com and one from independent-host.com -> succeeds
    contract.create_game(
        "g-valid-independent",
        DESCRIPTION,
        [
            "https://shared-host.com/feed1/game.json",
            "https://independent-host.com/game.json",
        ],
    )
    assert contract.total_games() == 1


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
    """Corroboration from 2 independent providers records home win."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-1")
    _mock_both(direct_vm, home=3, away=1)

    contract.submit_result("game-1")

    res = contract.get_result("game-1")
    assert res["status"] == "final"
    assert res["home_score"] == 3
    assert res["away_score"] == 1
    assert res["winner"] == "home"
    assert res["corroborated_sources"] == 2
    assert contract.is_final("game-1") is True


def test_submit_result_draw(direct_vm, direct_deploy, direct_alice):
    """Equal scores result in a draw."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-2")
    _mock_both(direct_vm, home=2, away=2, game_id="game-2")

    contract.submit_result("game-2")

    res = contract.get_result("game-2")
    assert res["status"] == "final"
    assert res["home_score"] == 2
    assert res["away_score"] == 2
    assert res["winner"] == "draw"


def test_submit_result_away_wins(direct_vm, direct_deploy, direct_alice):
    """Higher away score results in away win."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-3")
    _mock_both(direct_vm, home=0, away=4, game_id="game-3")

    contract.submit_result("game-3")

    res = contract.get_result("game-3")
    assert res["status"] == "final"
    assert res["home_score"] == 0
    assert res["away_score"] == 4
    assert res["winner"] == "away"


def test_provider_disagreement_reverts(direct_vm, direct_deploy, direct_alice):
    """If independent providers report conflicting scores, execution reverts."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-conflict")

    direct_vm.mock_web(
        REGEX_A,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": "game-conflict", "status": "FINAL", "home_score": 2, "away_score": 1}
            ),
        },
    )
    direct_vm.mock_web(
        REGEX_B,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": "game-conflict", "status": "FINAL", "home_score": 1, "away_score": 1}
            ),
        },
    )

    with direct_vm.expect_revert("disagree on final score"):
        contract.submit_result("game-conflict")

    assert contract.is_final("game-conflict") is False


def test_event_identity_mismatch_ignored_and_reverts_if_insufficient(
    direct_vm, direct_deploy, direct_alice
):
    """Payload with wrong game_id is discarded; if insufficient valid sources remain, reverts."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-real")

    direct_vm.mock_web(
        REGEX_A,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": "game-real", "status": "FINAL", "home_score": 1, "away_score": 0}
            ),
        },
    )
    # Provider B returns payload for a DIFFERENT game_id -> spoofing / mismatch
    direct_vm.mock_web(
        REGEX_B,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": "game-DIFFERENT", "status": "FINAL", "home_score": 1, "away_score": 0}
            ),
        },
    )

    with direct_vm.expect_revert("Insufficient live independent provider reports"):
        contract.submit_result("game-real")


def test_insufficient_live_providers_surfaces_as_transient(
    direct_vm, direct_deploy, direct_alice
):
    """If provider is offline (500 or timeout), surfaces as [TRANSIENT] retryable error."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-down")

    direct_vm.mock_web(
        REGEX_A,
        {
            "status": 200,
            "body": json.dumps(
                {"game_id": "game-down", "status": "FINAL", "home_score": 2, "away_score": 0}
            ),
        },
    )
    direct_vm.mock_web(REGEX_B, {"status": 503, "body": "Service Unavailable"})

    with direct_vm.expect_revert("Insufficient live independent provider reports"):
        contract.submit_result("game-down")


def test_non_final_game_status_reverts(direct_vm, direct_deploy, direct_alice):
    """In-progress or scheduled games (not FINAL) are not finalized."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-live")
    _mock_both(direct_vm, home=1, away=0, game_id="game-live", status="IN_PROGRESS")

    with direct_vm.expect_revert("Insufficient live independent provider reports"):
        contract.submit_result("game-live")


def test_double_submit_is_reverted(direct_vm, direct_deploy, direct_alice):
    """Once final, a game cannot be re-submitted."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)
    _create_game(direct_vm, contract, direct_alice, "game-once")
    _mock_both(direct_vm, home=1, away=0, game_id="game-once")

    contract.submit_result("game-once")
    assert contract.is_final("game-once") is True

    with direct_vm.expect_revert("Game already final"):
        contract.submit_result("game-once")


def test_revoke_source_and_empty_inputs(direct_vm, direct_deploy, direct_alice):
    """Revoking sources and edge-case inputs."""
    contract = _deploy(direct_vm, direct_deploy, direct_alice)

    # Revoke
    contract.revoke_source("https://provider-b.example.com/")
    sources = contract.get_approved_sources()["prefixes"]
    assert "https://provider-b.example.com/" not in sources
    assert "https://provider-a.example.com/" in sources

    # Revoke nonexistent reverts
    with direct_vm.expect_revert("not approved"):
        contract.revoke_source("https://nonexistent.com/")
