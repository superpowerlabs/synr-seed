// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../SeedFarm.sol";
import "hardhat/console.sol";

contract SeedFarmMock is SeedFarm {
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }
}
