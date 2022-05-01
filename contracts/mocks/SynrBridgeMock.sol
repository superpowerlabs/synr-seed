// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../interfaces/IMainPool.sol";
import "../SynrBridge.sol";

import "hardhat/console.sol";

contract SynrBridgeMock is SynrBridge {
  using SafeMathUpgradeable for uint256;

  // fake function that is always successful
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }

  uint256[50] private __gap;
}
