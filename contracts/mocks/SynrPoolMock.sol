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
import "../SynrPool.sol";

import "hardhat/console.sol";

contract SynrPoolMock is SynrPool {
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
    uint256 tokenAmount,
    uint16 otherChain,
    uint256 index
  ) external returns (Deposit memory) {
    if (tokenType == 0) {
      users[user].sSynrAmount += uint96(tokenAmount);
    } else if (tokenType == 1) {
      users[user].synrAmount += uint96(tokenAmount);
    } else {
      users[user].passAmount += 1;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmount: uint96(tokenAmount),
      unlockedAt: 0,
      otherChain: otherChain,
      index: uint16(index)
    });
    users[user].deposits.push(deposit);
    return deposit;
  }
}
