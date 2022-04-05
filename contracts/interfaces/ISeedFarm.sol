// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface ISeedFarm {
  event DepositSaved(address user, uint16 index);

  event DepositUnlocked(address user, uint16 index);

  function canUnstakeWithoutTax(address user, uint256 index) external view returns (bool);

  function getDepositIndexByOriginalIndex(address user, uint256 index) external view returns (uint256);
}
