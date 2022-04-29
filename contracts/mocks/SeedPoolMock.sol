// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "../pool/SeedPool.sol";
import "hardhat/console.sol";

contract SeedPoolMock is SeedPool {
  function setFactory(address factory_) external override onlyOwner {
    //    require(factory_.isContract(), "SeedPool: factory_ not a contract");
    factory = factory_;
  }
}
