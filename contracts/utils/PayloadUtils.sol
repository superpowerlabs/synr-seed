// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../interfaces/IPayloadUtils.sol";
import "./Constants.sol";

import "hardhat/console.sol";

contract PayloadUtils is IPayloadUtils, Constants {
  using SafeMathUpgradeable for uint256;

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  // can be called by tests and web2 app
  function serializeInput(
    uint256 tokenType, // 2 digit
    uint256 lockupTime, // 3 digits
    uint256 tokenAmountOrID
  ) external pure override returns (uint256 payload) {
    validateInput(tokenType, lockupTime, tokenAmountOrID);
    payload = tokenType.add(lockupTime.mul(100)).add(tokenAmountOrID.mul(1e5));
  }

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID
  ) public pure override returns (bool) {
    require(tokenType < 100, "PayloadUtils: invalid token type");
    if (tokenType == SYNR_PASS_STAKE_FOR_BOOST || tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      require(tokenAmountOrID < 889, "PayloadUtils: Not a Mobland SYNR Pass token ID");
    } else if (tokenType == BLUEPRINT_STAKE_FOR_BOOST) {
      require(tokenAmountOrID < 8001, "PayloadUtils: Not a Blueprint token ID");
    } else {
      require(tokenAmountOrID < 1e28, "PayloadUtils: tokenAmountOrID out of range");
    }
    require(lockupTime < 1e3, "PayloadUtils: lockedTime out of range");
    return true;
  }

  function deserializeInput(uint256 payload)
    public
    pure
    override
    returns (
      uint256 tokenType,
      uint256 lockupTime,
      uint256 tokenAmountOrID
    )
  {
    tokenType = payload.mod(100);
    lockupTime = payload.div(100).mod(1e3);
    tokenAmountOrID = payload.div(1e5);
  }

  function deserializeDeposit(uint256 payload)
    public
    pure
    override
    returns (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    )
  {
    tokenType = payload.mod(100);
    lockedFrom = payload.div(100).mod(1e10);
    lockedUntil = payload.div(1e12).mod(1e10);
    mainIndex = payload.div(1e22).mod(1e5);
    tokenAmountOrID = payload.div(1e27);
  }

  function getIndexFromPayload(uint256 payload) public pure override returns (uint256) {
    return payload.div(1e22).mod(1e5);
  }
}
