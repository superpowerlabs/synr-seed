// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "../Tesseract.sol";

import "hardhat/console.sol";
import "./IWormholeBridgeV2.sol";

contract TesseractV2Mock is Tesseract {
  function version() external pure override returns (uint256) {
    return 2;
  }

  function crossChainTransfer(
    uint8 bridgeType,
    uint256 payload,
    uint16 recipientChain,
    uint32 nonce
  ) external payable override returns (uint64 sequence) {
    if (bridgeType == 1) {
      return
        IWormholeBridge(bridges[1]).wormholeTransfer(payload, recipientChain, bytes32(uint256(uint160(_msgSender()))), nonce);
    } else if (bridgeType == 2) {
      return
        IWormholeBridgeV2(bridges[1]).wormholeTransferV2(
          payload,
          recipientChain,
          bytes32(uint256(uint160(_msgSender()))),
          nonce
        );
    } else {
      revert("Tesseract: unsupported bridge");
    }
  }

  uint256[50] private __gap;
}
