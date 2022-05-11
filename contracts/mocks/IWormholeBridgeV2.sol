// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Authors: Francesco Sullo <francesco@sullo.co>
// to be used by Tesseract.sol

interface IWormholeBridgeV2 {
  function wormholeTransferV2(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) external payable returns (uint64 sequence);

  function wormholeCompleteTransferV2(bytes memory encodedVm) external;
}
