// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "./SidePool.sol";

//import "hardhat/console.sol";

contract SeedPool is SidePool {
  using SafeMathUpgradeable for uint256;
  using AddressUpgradeable for address;

  mapping(address => bool) public bridges;
  mapping(address => uint16) internal _mainIndexForBlueprint;

  modifier onlyBridge() {
    require(bridges[_msgSender()], "SeedPool: forbidden");
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(
    address seedToken_,
    address blueprint_,
    address poolViews_
  ) public initializer {
    __SidePool_init(seedToken_, seedToken_, blueprint_, poolViews_);
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
    emit ImplementationUpgraded();
  }

  function setBridge(address bridge_, bool active) external virtual onlyOwner {
    require(bridge_.isContract(), "SeedPool: bridge_ not a contract");
    if (active) {
      bridges[bridge_] = true;
    } else {
      delete bridges[bridge_];
    }
  }

  function stake(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID
  ) external virtual override {
    require(tokenType >= BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: unsupported token");
    require(users[_msgSender()].blueprintAmount < 30, "SeedPool: at most 30 blueprint can be staked");
    uint16 mainIndex = _mainIndexForBlueprint[_msgSender()];
    if (mainIndex == 0) {
      mainIndex = type(uint16).max;
    } else {
      mainIndex -= 1;
    }
    _mainIndexForBlueprint[_msgSender()] = mainIndex;
    _stake(_msgSender(), tokenType, block.timestamp, block.timestamp.add(lockupTime * 1 days), mainIndex, tokenAmountOrID);
  }

  function unstake(Deposit memory deposit) external override {
    require(deposit.tokenType == S_SYNR_SWAP || deposit.tokenType >= BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: invalid tokenType");
    _unstakeDeposit(deposit);
  }

  function stakeViaBridge(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) external onlyBridge {
    require(tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: unsupported token");
    _stake(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  function unstakeViaBridge(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) external onlyBridge {
    require(tokenType != S_SYNR_SWAP && tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: unsupported token");
    _unstake(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }
}
