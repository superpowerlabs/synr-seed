// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "../MainTesseract.sol";

import "hardhat/console.sol";

contract MainTesseractMock is MainTesseract {
  constructor(address pool) MainTesseract(pool) {}

  // fake function that is always successful
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }

  uint256[50] private __gap;
}
