// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "./SidePool.sol";
import "../interfaces/IFarmingPool.sol";
import "hardhat/console.sol";

contract FarmingPool is IFarmingPool, SidePool {
  using SafeMathUpgradeable for uint256;
  using AddressUpgradeable for address;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(
    address stakedToken_, // in SeedFarm stakedToken and rewardsToken are same token. Not here
    address rewardsToken_,
    address blueprint_
  ) public initializer {
    __SidePool_init(stakedToken_, rewardsToken_, blueprint_);
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}


  function stake(uint256 lockupTime, uint256 tokenAmount) external override {
    uint mainIndex = users[_msgSender()].deposits.length;
    _stake(_msgSender(), 1, block.timestamp, block.timestamp.add(lockupTime * 1 days), mainIndex, tokenAmount);
  }

  function unstake(uint256 depositIndex) external override {
    Deposit memory deposit = users[_msgSender()].deposits[depositIndex];
    _unstake(uint(deposit.tokenType), uint(deposit.lockedFrom), uint(deposit.lockedUntil), uint(deposit.mainIndex), uint(deposit.tokenAmountOrID));
  }

  function _stake(
    address user_,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal override {
    require(tokenType == SEED_STAKE || tokenType == BLUEPRINT_STAKE_FOR_BOOST, "FarmingPool: invalid tokenType");
    updateRatio();
    _collectRewards(user_);
    uint256 tokenAmount;
    if (tokenType == SEED_STAKE) {
      tokenAmount = tokenAmountOrID.mul(conf.stakeFactor);
      stakedToken.transferFrom(user_, address(this), tokenAmount);
    } else {
      users[user_].blueprintsAmount++;
      blueprint.safeTransferFrom(user_, address(this), tokenAmountOrID);
    }
    users[user_].tokenAmount = uint96(uint256(users[user_].tokenAmount).add(tokenAmount));
    Deposit memory deposit = Deposit({
    tokenType: uint8(tokenType),
    lockedFrom: uint32(lockedFrom),
    lockedUntil: uint32(lockedUntil),
    tokenAmountOrID: uint96(tokenAmountOrID),
    unstakedAt: 0,
    mainIndex: uint16(mainIndex),
    tokenAmount: uint128(tokenAmount),
    lastRewardsAt: uint32(lockedFrom),
    rewardsFactor: conf.rewardsFactor
    });
    users[user_].deposits.push(deposit);
    emit DepositSaved(user_, uint16(mainIndex));
  }

  function _unstake(
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal override {
    require(tokenType == SEED_STAKE, "SidePool: wrong tokenType");
    mainIndex = getDepositIndexByMainIndex(_msgSender(), mainIndex);
    Deposit storage deposit = users[_msgSender()].deposits[mainIndex];
    require(
      uint256(deposit.tokenType) == tokenType &&
      uint256(deposit.lockedFrom) == lockedFrom &&
      uint256(deposit.lockedUntil) == lockedUntil &&
      uint256(deposit.tokenAmountOrID) == tokenAmountOrID,
      "FarmingPool: deposit not found"
    );
    uint256 vestedPercentage = getVestedPercentage(
      block.timestamp,
      uint256(deposit.lockedFrom),
      uint256(deposit.lockedUntil)
    );
    uint256 unstakedAmount;
    if (vestedPercentage < 10000) {
      unstakedAmount = uint256(deposit.tokenAmount).mul(vestedPercentage).div(10000);
      penalties += uint256(deposit.tokenAmount).sub(unstakedAmount);
    } else {
      unstakedAmount = uint256(deposit.tokenAmount);
    }
    stakedToken.transfer(_msgSender(), unstakedAmount);
    deposit.unstakedAt = uint32(block.timestamp);
    emit DepositUnlocked(_msgSender(), uint16(mainIndex));
  }



}
