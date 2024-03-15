// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Authors: Francesco Sullo <francesco@sullo.co>
// to be used by Tesseract.sol

interface IWormholeBridgeV2 {
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    address otherContractAddress
  ) external payable returns (uint64 sequence);

  function quoteCrossChainGreeting(uint16 targetChain) external view returns (uint256 cost);
}
