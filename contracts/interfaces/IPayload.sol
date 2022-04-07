// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IPayload {
  function version() external pure returns (uint256);

  // can be called by web2 app for consistency
  function serializeInput(
    uint256 tokenType, // 1 digit
    uint256 lockupTime, // 4 digits
    uint256 tokenAmountOrID
  ) external pure returns (uint256);

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID
  ) external pure returns (bool);

  function deserializeInput(uint256 payload)
    external
    pure
    returns (
      uint256 tokenType,
      uint256 lockupTime,
      uint256 tokenAmountOrID
    );

  function deserializeDeposit(uint256 payload)
    external
    pure
    returns (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    );

  function getIndexFromPayload(uint256 payload) external pure returns (uint256);
}
