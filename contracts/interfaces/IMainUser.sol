// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

interface IMainUser {
  event DepositSaved(address indexed user, uint16 indexed mainIndex);
  event DepositUnlocked(address indexed user, uint16 indexed mainIndex);

  struct Deposit {
    // @dev token type (0: sSYNR, 1: SYNR, 2: SYNR Pass...
    uint8 tokenType;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    uint96 tokenAmountOrID;
    uint32 unlockedAt;
    uint16 otherChain;
    // since the process is asyncronous, the same deposit can be at a different mainIndex
    // on the main net and on the sidechain.
    uint16 mainIndex;
    // available space for an extra variable
    uint24 extra;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint96 synrAmount;
    // @dev Total passes staked
    uint16 passAmount;
    Deposit[] deposits;
  }
}
