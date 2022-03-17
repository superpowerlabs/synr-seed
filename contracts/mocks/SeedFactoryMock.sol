// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

//import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
//import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
//import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
//import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "../SeedFactory.sol";
import "hardhat/console.sol";

contract SeedFactoryMock is SeedFactory {
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }
}
