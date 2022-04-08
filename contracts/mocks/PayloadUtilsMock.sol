// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../utils/PayloadUtils.sol";

contract PayloadUtilsMock is PayloadUtils {
  using SafeMathUpgradeable for uint256;
  struct Deposit {
    uint8 tokenType;
    uint32 lockedFrom;
    uint32 lockedUntil;
    uint96 tokenAmountOrID;
    uint16 mainIndex;
  }

  function fromDepositToTransferPayload(Deposit memory deposit) public pure returns (uint256) {
    require(deposit.tokenType < 4, "invalid token type");
    require(deposit.lockedFrom < deposit.lockedUntil, "invalid interval");
    require(deposit.lockedUntil < 1e10, "lockedTime out of range");
    require(deposit.tokenAmountOrID < 1e28, "tokenAmountOrID out of range");
    return
      uint256(deposit.tokenType)
        .add(uint256(deposit.lockedFrom).mul(10))
        .add(uint256(deposit.lockedUntil).mul(1e11))
        .add(uint256(deposit.mainIndex).mul(1e21))
        .add(uint256(deposit.tokenAmountOrID).mul(1e26));
  }
}
