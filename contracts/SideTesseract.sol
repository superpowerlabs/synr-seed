// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnel.sol";

import "./pool/SeedPool.sol";
import "./utils/PayloadUtils0.sol";
import "hardhat/console.sol";

contract SideTesseract is PayloadUtils0, WormholeTunnel {
  using Address for address;
  using SafeMath for uint256;

  event PayloadSent(address indexed to, uint16 indexed chainId, uint256 indexed payload);
  event PayloadReceived(address indexed to, uint256 indexed payload);

  SeedPool public pool;

  constructor(address pool_) {
    require(pool_.isContract(), "SeedFactory: pool_ not a contract");
    pool = SeedPool(pool_);
  }

  // UNSTAKE starts on the side chain and completes on the main chain
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    // this limitation is necessary to avoid problems during the unstake
    require(_msgSender() == address(uint160(uint256(recipient))), "SeedFarm: only the sender can receive on other chain");
    (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    ) = deserializeDeposit(payload);
    require(tokenType != S_SYNR_SWAP, "SeedFarm: sSYNR swaps cannot be bridged back");
    require(tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedFarm: blueprints' unstake does not require bridge");
    pool.unstakeViaFactory(_msgSender(), tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
    emit PayloadSent(_msgSender(), recipientChain, payload);
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  // STAKE starts on the main chain and completes on the side chain
  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    emit PayloadReceived(to, payload);
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
    require(tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedFarm: no blueprint allowed here");
    pool.stakeViaFactory(to, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  uint256[50] private __gap;
}
