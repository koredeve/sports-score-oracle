def test_get_game_ids_lists_registered_games(direct_vm, direct_deploy, direct_alice):
    """The enumeration view returns every registered game id in order."""
    direct_vm.sender = direct_alice
    contract = direct_deploy("contracts/SportsScoreOracle.py")
    contract.approve_source("https://scores-a.example.com/", "Example Scoreboard A")
    contract.approve_source("https://scores-b.example.com/", "Example Scoreboard B")
    contract.create_game("a", "first", ["https://scores-a.example.com/a.json", "https://scores-b.example.com/a.json"])
    contract.create_game("b", "second", ["https://scores-a.example.com/b.json", "https://scores-b.example.com/b.json"])
    assert contract.get_game_ids() == {"ids": ["a", "b"]}
