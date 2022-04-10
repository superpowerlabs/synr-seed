// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "./SidePool.sol";
import "hardhat/console.sol";

contract FarmingPool is SidePool {
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


  function stake(uint tokenType, uint256 lockupTime, uint256 tokenAmountOrID) external virtual override {
    // mainIndex = type(uint16).max means no meanIndex
    require(tokenType == BLUEPRINT_STAKE_FOR_BOOST || tokenType == SEED_STAKE, "FarmingPool: unsupported token");
    _stake(_msgSender(), tokenType, block.timestamp, block.timestamp.add(lockupTime * 1 days), type(uint16).max , tokenAmountOrID);
  }

  function unstake(uint256 depositIndex) external override {
    Deposit memory deposit = users[_msgSender()].deposits[depositIndex];
    require(deposit.tokenType == SEED_STAKE || deposit.tokenType == BLUEPRINT_STAKE_FOR_BOOST, "FarmingPool: invalid tokenType");
    _unstakeDeposit(deposit);
  }

}
