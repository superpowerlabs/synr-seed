// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "../pool/SidePool.sol";
import "hardhat/console.sol";

contract SidePoolMock is SidePool, UUPSUpgradeable {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address seed_) public initializer {
    __SidePool_init(seed_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
