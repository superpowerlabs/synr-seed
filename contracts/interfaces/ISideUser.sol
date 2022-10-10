// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

interface ISideUser {
  event DepositSaved(address indexed user, uint16 indexed mainIndex);

  event DepositUnlocked(address indexed user, uint16 indexed mainIndex);

  struct Deposit {
    // @dev token type (0: sSYNR, 1: SYNR, 2: SYNR Pass)
    uint8 tokenType;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    uint96 stakedAmount;
    // @dev tokenID if NFT
    uint16 tokenID;
    // @dev when the deposit is unlocked
    uint32 unlockedAt;
    // @dev mainIndex Since the process is asynchronous, the same deposit can be at a different index
    // on the main net and on the side-chain. This guarantees alignment
    uint16 mainIndex;
    // @dev pool token amount staked
    uint128 generator; //
    // @dev rewards ratio when staked
    uint32 rewardsFactor;
    // for two words,
    // 136 extra bits available
    // filled with extra variables
    // for future compatible changes
    uint32 extra1;
    uint32 extra2;
    uint32 extra3;
    uint24 extra4;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total passes staked
    uint16 passAmount;
    uint16 passAmountForBoost;
    // @dev Total blueprints staked
    uint16 blueprintAmount;
    uint16 blueprintAmountForBoost;
    // @dev Total staked SYNR
    uint96 stakedAmount;
    // @dev SEED generator:
    uint128 generator;
    // @dev when claimed rewards last time
    uint32 lastRewardsAt;
    Deposit[] deposits;
    // @dev reserved for future custom tokens
    mapping(uint8 => uint16) extraNftAmounts;
  }
}
