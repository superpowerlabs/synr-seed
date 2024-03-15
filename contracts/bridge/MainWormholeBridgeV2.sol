// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Authors: Francesco Sullo <francesco@sullo.co>

import "../pool/MainPool.sol";
import "./WormholeBridgeV2.sol";

contract MainWormholeBridgeV2 is WormholeBridgeV2 {
  /// @custom:oz-upgrades-unsafe-allow constructor

  function initialize(
    address tesseract_,
    address pool_,
    address wormholeRelayer_
  ) public virtual initializer {
    __WormholeBridge_init(tesseract_, pool_, wormholeRelayer_);
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
    emit ImplementationUpgraded(newImplementation);
  }

  // STAKE/BURN starts on the main chain and completes on the side chain
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    address otherContractAddress
  ) public payable override whenNotPaused onlyTesseract returns (uint64) {
    address sender = address(uint160(uint256(recipient)));
    payload = MainPool(pool).stake(sender, payload, recipientChain);
    bytes memory encodedPayload = abi.encode(payload, sender);
    uint256 cost = quoteCrossChainGreeting(recipientChain);
    wormholeRelayer.sendPayloadToEvm{value: cost}(recipientChain, otherContractAddress, encodedPayload, msg.value, 200000);
  }

  function quoteCrossChainGreeting(uint16 targetChain) public view override returns (uint256 cost) {
    (cost, ) = wormholeRelayer.quoteEVMDeliveryPrice(targetChain, 0, 500000);
  }

  function receiveWormholeMessages(
    bytes memory payload,
    bytes[] memory additionalVaas,
    bytes32 sourceAddress,
    uint16 sourceChain,
    bytes32 deliveryHash
  ) external payable override {
    require(msg.sender == address(wormholeRelayer), "Only relayer allowed");

    (uint256 payload, address sender) = abi.decode(payload, (uint256, address));
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);

    MainPool(pool).unstake(sender, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }
}
