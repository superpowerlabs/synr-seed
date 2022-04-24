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

  /**
   * @notice calls _stake function
   * @param tokenType is the type of token
   * @param lockupDays time in days which the stake will be lock
   * @param tokenAmountOrID amount to be staked
   */
  function stake(
    uint256 tokenType,
    uint256 lockupDays,
    uint256 tokenAmountOrID
  ) external virtual override {
    // mainIndex = type(uint16).max means no meanIndex
    require(tokenType == BLUEPRINT_STAKE_FOR_BOOST || tokenType == SEED_SWAP, "FarmingPool: unsupported token");
    _stake(
      _msgSender(),
      tokenType,
      block.timestamp,
      block.timestamp.add(lockupDays * 1 days),
      type(uint16).max,
      tokenAmountOrID
    );
  }

  /**
   * @notice calls _unstake function
   * @param depositIndex index of the deposit
   */
  function unstake(uint256 depositIndex) external override {
    Deposit memory deposit = users[_msgSender()].deposits[depositIndex];
    require(deposit.tokenType == BLUEPRINT_STAKE_FOR_BOOST, "FarmingPool: only bluprints can be unstaked");
    _unstakeDeposit(deposit);
  }
}
