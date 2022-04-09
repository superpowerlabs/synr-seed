// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../pool/MainPool.sol";

import "hardhat/console.sol";

contract MainPoolMock is MainPool {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(
    address synr_,
    address sSynr_,
    address pass_
  ) public initializer {
    __MainPool_init(synr_, sSynr_, pass_);
  }

  function stake(uint256 payload, uint16 recipientChain) external {
    _stake(payload, recipientChain);
  }

  function unstake(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) external {
    _unstake(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  function updateUserAndAddDeposit(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 tokenAmountOrID,
    uint16 otherChain,
    uint256 mainIndex
  ) external returns (Deposit memory) {
    return _updateUserAndAddDeposit(user, tokenType, lockedFrom, lockedUntil, tokenAmountOrID, otherChain, mainIndex);
  }
}
