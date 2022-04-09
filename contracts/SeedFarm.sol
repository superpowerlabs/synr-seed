// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./pool/SidePool.sol";
import "hardhat/console.sol";

contract SeedFarm is SidePool, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address seed_, address blueprint_) public initializer {
    __SidePool_init(seed_, blueprint_);
    __WormholeTunnel_init();
  }

  function _authorizeUpgrade(address newImplementation) internal override(SidePool, WormholeTunnelUpgradeable) onlyOwner {}

  // UNSTAKE starts on the side chain and completes on the main chain
  function wormholeTransfer(
    // solhint-disable-next-line
    uint256 payload,
    // solhint-disable-next-line
    uint16 recipientChain,
    // solhint-disable-next-line
    bytes32 recipient,
    // solhint-disable-next-line
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    // this limitation is necessary to avoid problems during the unstake
    require(_msgSender() == address(uint160(uint256(recipient))), "SeedFarm: only the sender can receive on other chain");
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);
    require(tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedFarm: blueprints' unstake does not require bridge");
    _unstake(tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
    emit DepositUnlocked(_msgSender(), uint16(mainIndex));
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  // STAKE starts on the main chain and completes on the side chain
  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
//    console.log(payload);
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);
    _stake(to, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
    emit DepositSaved(to, uint16(mainIndex));
  }
}
