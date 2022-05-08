// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "../SideTesseract.sol";
import "hardhat/console.sol";

contract SideTesseractMock is SideTesseract {
  constructor(address pool) SideTesseract(pool) {}

  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }
}
