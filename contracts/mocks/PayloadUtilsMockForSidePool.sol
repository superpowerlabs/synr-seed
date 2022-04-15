// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../utils/PayloadUtils.sol";
import "hardhat/console.sol";

contract PayloadUtilsMockForSidePool is PayloadUtils {
  using SafeMathUpgradeable for uint256;
  struct Deposit {
    uint8 tokenType;
    uint32 lockedFrom;
    uint32 lockedUntil;
    uint96 tokenAmountOrID;
    uint32 unstakedAt;
    uint16 mainIndex;
    uint128 tokenAmount; //
    uint32 lastRewardsAt;
    uint32 rewardsFactor;
  }

  function fromDepositToTransferPayload(Deposit memory deposit) public view returns (uint256) {
    return
      uint256(deposit.tokenType)
        .add(uint256(deposit.lockedFrom).mul(100))
        .add(uint256(deposit.lockedUntil).mul(1e12))
        .add(uint256(deposit.mainIndex).mul(1e22))
        .add(uint256(deposit.tokenAmountOrID).mul(1e27));
  }
}
