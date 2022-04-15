// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../pool/SeedPool.sol";
import "hardhat/console.sol";

contract SeedPoolMock is SeedPool {
  function setFactory(address farmer_) external override onlyOwner {
    //    require(farmer_.isContract(), "SeedPool: farmer_ not a contract");
    factory = farmer_;
  }
}
