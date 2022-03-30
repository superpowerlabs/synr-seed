// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "hardhat/console.sol";

contract Payload {
  using SafeMathUpgradeable for uint256;

  function serializeInput(
    uint256 tokenType, // 1 digit
    uint256 lockupTime, // 4 digits
    uint256 tokenAmount
  ) public view returns (uint256) {
    validateInput(tokenType, lockupTime, tokenAmount);
    return tokenType.add(lockupTime.mul(10)).add(tokenAmount.mul(1e5));
  }

  function serializeDeposit(
    uint256 tokenType, // 1 digit
    uint256 lockedFrom, // 10 digits
    uint256 lockedUntil, // 10 digits
    uint256 tokenAmount
  ) public view returns (uint256) {
    validateDeposit(tokenType, lockedFrom, lockedUntil, tokenAmount);
    return tokenType.add(lockedFrom.mul(10)).add(lockedUntil.mul(1e11)).add(tokenAmount.mul(1e21));
  }

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmount
  ) public view returns (bool) {
    require(tokenType < 2, "Payload: invalid token type");
    require(tokenAmount < 1e28, "Payload: tokenAmount out of range");
    require(lockupTime < type(uint32).max, "Payload: lockedTime out of range");
    return true;
  }

  function validateDeposit(
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 tokenAmount
  ) public view returns (bool) {
    require(tokenType < 2, "Payload: invalid token type");
    require(lockedFrom < lockedUntil, "Payload: invalid interval");
    require(lockedUntil < type(uint32).max, "Payload: lockedTime out of range");
    require(tokenAmount < 1e28, "Payload: tokenAmount out of range");
    return true;
  }

  function deserializeInput(uint256 payload) public pure returns (uint256[3] memory) {
    return [payload.mod(10), payload.div(10).mod(1e4), payload.div(1e5)];
  }

  function deserializeDeposit(uint256 payload) public pure returns (uint256[4] memory) {
    return [payload.mod(10), payload.div(10).mod(1e10), payload.div(1e11).mod(1e10), payload.div(1e21)];
  }
}
