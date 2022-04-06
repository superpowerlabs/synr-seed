// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface ISeedFarm {
  event DepositSaved(address user, uint16 mainIndex);

  event DepositUnlocked(address user, uint16 mainIndex);

  function canUnstakeWithoutTax(address user, uint256 mainIndex) external view returns (bool);

  function getDepositIndexByOriginalIndex(address user, uint256 mainIndex) external view returns (uint256);
}
