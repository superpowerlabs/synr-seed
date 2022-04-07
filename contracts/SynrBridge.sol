// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./pool/MainPool.sol";

import "hardhat/console.sol";

contract SynrBridge is MainPool, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(
    address synr_,
    address sSynr_,
    address pass_
  ) public initializer {
    __MainPool_init(synr_, sSynr_, pass_);
    __WormholeTunnel_init();
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  // Stake/burn is done on chain A, SEED tokens are minted on chain B
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    require(_msgSender() == address(uint160(uint256(recipient))), "SynrBridge: only the sender can receive on other chain");
    _stake(payload, recipientChain);
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  // Unstake is initiated on chain B and completed on chain A
  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);
    require(tokenType > 0, "SynrBridge: sSYNR can't be unlocked");
    _unstake(to, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }
}
