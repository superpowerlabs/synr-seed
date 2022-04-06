// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface ISidePool {
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
    // more space available
    // @dev stake weight

    // TODO see if we can optimize with lower storage size; uint128 or less
    // @dev side token amount staked
    uint256 tokenAmount;
    // @dev stake weight
    uint256 weight;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total blueprints staked
    uint16 blueprintsAmount;
    // TODO as above, see if possible to optimize storage
    // @dev Total staked amount
    uint256 tokenAmount;
    // @dev Total weight
    uint256 totalWeight;
    // @dev Auxiliary variable for yield calculation
    uint256 subYieldRewards;
    // @dev Auxiliary variable for vault rewards calculation
    uint256 subVaultRewards;
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

  function canUnstakeWithoutTax(address user, uint256 mainIndex) external view returns (bool);

  function getDepositIndexByOriginalIndex(address user, uint256 mainIndex) external view returns (uint256);

  // pool functions

  //  function poolToken() external view returns (address);
  //
  //  function weight() external view returns (uint32);
  //
  //  function lastYieldDistribution() external view returns (uint64);
  //
  //  function yieldRewardsPerWeight() external view returns (uint256);
  //
  //  function usersLockingWeight() external view returns (uint256);
  //
  //  function pendingYieldRewards(address _user) external view returns (uint256);
  //
  //  function balanceOf(address _user) external view returns (uint256);
  //
  //  function stake(
  //    uint256 _amount,
  //    uint64 _lockedUntil,
  //    bool useSSYN
  //  ) external;
  //
  //  function unstake(
  //    uint256 _depositId,
  //    uint256 _amount,
  //    bool useSSYN
  //  ) external;
  //
  //  function sync() external;
  //
  //  function processRewards(bool useSSYN) external;
  //
  //  function setWeight(uint32 _weight) external;
}
