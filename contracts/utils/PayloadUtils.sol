// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "../interfaces/IPayloadUtils.sol";

import "hardhat/console.sol";

contract PayloadUtils is IPayloadUtils {
  using SafeMathUpgradeable for uint256;

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  // can be called by tests and web2 app
  function serializeInput(
    uint256 tokenType, // 1 digit
    uint256 lockupTime, // 3 digits
    uint256 tokenAmountOrID
  ) external pure override returns (uint256 payload) {
    validateInput(tokenType, lockupTime, tokenAmountOrID);
    payload = tokenType.add(lockupTime.mul(10)).add(tokenAmountOrID.mul(1e4));
  }

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID
  ) public pure override returns (bool) {
    require(tokenType < 4, "PayloadUtils: invalid token type");
    if (tokenType == 2 || tokenType == 3) {
      require(tokenAmountOrID < 889, "PayloadUtils: Not a Mobland SYNR Pass token ID");
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
    tokenType = payload.mod(10);
    lockupTime = payload.div(10).mod(1e3);
    tokenAmountOrID = payload.div(1e4);
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
    tokenType = payload.mod(10);
    lockedFrom = payload.div(10).mod(1e10);
    lockedUntil = payload.div(1e11).mod(1e10);
    mainIndex = payload.div(1e21).mod(1e5);
    tokenAmountOrID = payload.div(1e26);
  }

  function getIndexFromPayload(uint256 payload) public pure override returns (uint256) {
    return payload.div(1e21).mod(1e5);
  }
}
