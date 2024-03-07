// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Authors: Francesco Sullo <francesco@sullo.co>

import "../pool/SeedPool.sol";
import "./WormholeBridgeV2.sol";
import "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import "wormhole-solidity-sdk/interfaces/IWormholeReceiver.sol";

contract SideWormholeBridgeV2 is WormholeBridgeV2 {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  address public otherContractAddress;
  IWormholeRelayer public wormholeRelayer;

  function initialize(
    address tesseract_,
    address pool_,
    address _otherContractAddress,
    address _wormholeRelayer
  ) public virtual initializer {
    __WormholeBridge_init(tesseract_, pool_);
    wormholeRelayer = IWormholeRelayer(_wormholeRelayer);
    otherContractAddress = _otherContractAddress;
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
    emit ImplementationUpgraded(newImplementation);
  }

  // UNSTAKE starts on the side chain and completes on the main chain
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused onlyTesseract returns (uint64) {
    address sender = address(uint160(uint256(recipient)));
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);
    SeedPool(pool).unstakeViaBridge(sender, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
    bytes memory encodedPayload = abi.encode(payload, sender);
    wormholeRelayer.sendPayloadToEvm(recipientChain, otherContractAddress, encodedPayload, msg.value, 70000);
  }

  function receiveWormholeMessages(
    bytes memory payload,
    bytes[] memory additionalVaas,
    bytes32 sourceAddress,
    uint16 sourceChain,
    bytes32 deliveryHash
  ) external payable {
    require(msg.sender == address(wormholeRelayer), "Only relayer allowed");

    (uint256 payload, address sender) = abi.decode(payload, (uint256, address));
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);

    SeedPool(pool).stakeViaBridge(sender, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }
}
