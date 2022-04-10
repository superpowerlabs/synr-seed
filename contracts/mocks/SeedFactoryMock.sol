// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../SeedFactory.sol";
import "hardhat/console.sol";

contract SeedFactoryMock is SeedFactory {
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }
}
