// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Authors: Francesco Sullo <francesco@sullo.co>

import "../pool/MainPool.sol";
import "./WormholeBridge.sol";

contract MainWormholeBridge is WormholeBridge {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address tesseract_, address pool_) public virtual initializer {
    __WormholeBridge_init(tesseract_, pool_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  // STAKE/BURN starts on the main chain and completes on the side chain
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused onlyTesseract returns (uint64) {
    address sender = address(uint160(uint256(recipient)));
    payload = MainPool(pool).stake(sender, payload, recipientChain);
    uint64 sequence = _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
    return sequence;
  }

  // STAKE/BURN starts on the side chain and completes on the main chain
  function wormholeCompleteTransfer(bytes memory encodedVm) public virtual override {
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
    require(tokenType > S_SYNR_SWAP, "MainWormholeBridge: sSYNR can't be unstaked");
    MainPool(pool).unstake(to, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  function unstakeIfBridgeFails(
    address to,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID,
    bytes memory signature
  ) external virtual {
    require(tokenType > S_SYNR_SWAP, "MainWormholeBridge: sSYNR can't be unstaked");
    require(operator != address(0) && _msgSender() == operator, "MainWormholeBridge: not the operator");
    require(
      isSignedByValidator(encodeForSignature(to, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID), signature),
      "MainWormholeBridge: invalid signature"
    );
    MainPool(pool).unstake(to, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }
}
