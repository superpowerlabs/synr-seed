// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

//import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
//import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
//
//import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";
//import "./interfaces/IERC20.sol";
//import "./token/SyndicateERC20.sol";
//import "./token/SyntheticSyndicateERC20.sol";
import "../SynrBridge.sol";

import "hardhat/console.sol";

contract SynrBridgeMock is SynrBridge {
  using SafeMathUpgradeable for uint256;

  // fake function that is always successful
  function mockWormholeCompleteTransfer(address to, uint256 payload) public {
    _onWormholeCompleteTransfer(to, payload);
  }

  function updateUserAndAddDeposit(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 tokenAmountOrID,
    uint16 otherChain,
    uint256 mainIndex
  ) external returns (Deposit memory) {
    return _updateUserAndAddDeposit(user, tokenType, lockedFrom, lockedUntil, tokenAmountOrID, otherChain, mainIndex);
  }
}
