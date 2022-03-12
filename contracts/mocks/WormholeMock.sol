// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// the goal of this mock is to allow testing.
// We assume that the bridging is successful

contract WormholeMock {
  event LogMessagePublished(address indexed sender, uint64 sequence, uint32 nonce, bytes payload, uint8 consistencyLevel);

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
