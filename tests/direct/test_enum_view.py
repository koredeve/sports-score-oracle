def test_get_game_ids_lists_registered_games(direct_vm, direct_deploy, direct_alice):
    """The enumeration view returns every registered game id in order."""
    direct_vm.sender = direct_alice
    contract = direct_deploy("contracts/SportsScoreOracle.py")
    contract.create_game("a", "first")
    contract.create_game("b", "second")
    assert contract.get_game_ids() == {"ids": ["a", "b"]}
