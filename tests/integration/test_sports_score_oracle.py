from gltest import get_contract_factory
from gltest.assertions import tx_execution_succeeded


def test_deploy_smoke():
    factory = get_contract_factory("SportsScoreOracle")
    contract = factory.deploy(args=[])

    tx_receipt = contract.create_game(
        args=["game-1", "Alpha vs Beta, exhibition match"]
    ).transact()
    assert tx_execution_succeeded(tx_receipt)

    result = contract.get_result(args=["game-1"]).call()
    assert result["status"] == "upcoming"
