// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IMainPool {
  event DepositSaved(address user, uint16 mainIndex);

  event DepositUnlocked(address user, uint16 mainIndex);

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
    uint96 tokenAmountOrID;
    uint32 unlockedAt;
    uint16 otherChain;
    // since the process is asyncronous, the same deposit can be at a different mainIndex
    // on the main net and on the sidechain.
    uint16 mainIndex;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint96 synrAmount;
    // @dev Total burned sSYNR amount
    uint96 sSynrAmount;
    // @dev Total passes staked
    uint16 passAmount;
    Deposit[] deposits;
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) external pure returns (uint256);

  function getDepositByIndex(address user, uint256 mainIndex) external view returns (Deposit memory);

  function getDepositsLength(address user) external view returns (uint256);

  // can be re-executed to update parameters
  function initPool(
    uint256 minimumLockingTime_, // 3 digits -- ex. 7 days
    uint256 maximumLockingTime_, // 3 digits -- ex. 365 days
    uint256 earlyUnstakePenalty_ // 2 digits -- ex: 30%
  ) external;

  function minimumLockingTime() external view returns (uint256);

  function maximumLockingTime() external view returns (uint256);

  function earlyUnstakePenalty() external view returns (uint256);

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) external view returns (uint256);

  function calculatePenaltyForEarlyUnstake(uint256 when, IMainPool.Deposit memory deposit) external view returns (uint256);

  function transferSSynrToTreasury(uint256 amount, address to) external;

  function withdrawPenalties(uint256 amount, address to) external;
}
