// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../SynrBridge.sol";

import "hardhat/console.sol";

contract SynrBridgeV2Mock is SynrBridge {
  function version() external pure override returns (uint256) {
    return 2;
  }

  // fake function that is always successful
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }
}
