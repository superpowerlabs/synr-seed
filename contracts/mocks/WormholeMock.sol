// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

// the goal of this mock is to allow testing.
// We assume that the bridging is successful

import "@ndujalabs/wormhole-tunnel/contracts/libraries/BytesLib.sol";

contract WormholeMock {
  using BytesLib for bytes;
  event LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel);

  struct Signature {
    bytes32 r;
    bytes32 s;
    uint8 v;
    uint8 guardianIndex;
  }

  struct VM {
    uint8 version;
    uint32 timestamp;
    uint32 nonce;
    uint16 emitterChainId;
    bytes32 emitterAddress;
    uint64 sequence;
    uint8 consistencyLevel;
    bytes payload;
    uint32 guardianSetIndex;
    Signature[] signatures;
    bytes32 hash;
  }

  mapping(address => uint64) private _sequences;

  // Publish a message to be attested by the Wormhole network
  function publishMessage(
    uint32 nonce,
    bytes memory payload,
    uint8 consistencyLevel
  ) public payable returns (uint64 sequence) {
    sequence = _sequences[msg.sender];
    _sequences[msg.sender] += 1;
    emit LogMessagePublished(msg.sender, sequence, nonce, payload, consistencyLevel);
  }
}
