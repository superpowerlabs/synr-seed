// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "./IMainUser.sol";

interface IMainPool is IMainUser {
  event PoolInitiated(uint16 minimumLockupTime, uint16 earlyUnstakePenalty);
  event PoolPaused(bool isPaused);
  event BridgeSet(address bridge);
  event BridgeRemoved(address bridge);
  event ImplementationUpgraded();

  struct Conf {
    uint8 status;
    uint16 minimumLockupTime;
    uint16 maximumLockupTime;
    uint16 earlyUnstakePenalty;
    // TVL
    uint16 passAmount;
    uint96 synrAmount;
    // reserved for future variables
    uint32 reserved1;
    uint32 reserved2;
    uint24 reserved3;
  }

  function setBridge(address bridge_, bool active) external;

  function getDepositByIndex(address user, uint256 index) external view returns (Deposit memory);

  function getDepositsLength(address user) external view returns (uint256);

  function initPool(uint16 minimumLockupTime_, uint16 earlyUnstakePenalty_) external;

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) external view returns (uint256);

  function calculatePenaltyForEarlyUnstake(uint256 when, IMainPool.Deposit memory deposit) external view returns (uint256);

  function withdrawSSynr(uint256 amount, address to) external;

  function withdrawPenalties(uint256 amount, address to) external;

  function stake(
    address user,
    uint256 payload,
    uint16 recipientChain
  ) external returns (uint256);

  function unstake(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) external;

  function pausePool(bool paused) external;
}
