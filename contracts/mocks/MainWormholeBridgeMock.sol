// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Authors: Francesco Sullo <francesco@sullo.co>

import "../bridge/MainWormholeBridge.sol";

contract MainWormholeBridgeMock is MainWormholeBridge {
  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    address to = BytesLib.toAddress(encodedVm, 0);
    uint256 payload = BytesLib.toUint256(encodedVm, 20);
    _onWormholeCompleteTransfer(to, payload);
  }
}
