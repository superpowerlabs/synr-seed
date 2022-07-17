// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "./ISideUser.sol";
import "./ISideConf.sol";

interface ISidePool is ISideUser, ISideConf {
  event OracleUpdated(address oracle);
  event ImplementationUpgraded(address newImplementation);

  event PoolInitiatedOrUpdated(
    uint32 rewardsFactor,
    uint32 decayInterval,
    uint16 decayFactor,
    uint32 swapFactor,
    uint32 stakeFactor,
    uint16 taxPoints,
    uint8 coolDownDays
  );

  event PriceRatioUpdated(uint32 priceRatio);
  event ExtraConfUpdated(
    uint32 sPSynrEquivalent,
    uint32 sPBoostFactor,
    uint32 sPBoostLimit,
    uint32 bPSynrEquivalent,
    uint32 bPBoostFactor,
    uint32 bPBoostLimit
  );
  event PoolPaused(bool isPaused);
  event BridgeSet(address bridge);
  event BridgeRemoved(address bridge);

  function initPool(
    uint32 rewardsFactor,
    uint32 decayInterval,
    uint16 decayFactor,
    uint32 swapFactor,
    uint32 stakeFactor,
    uint16 taxPoints,
    uint8 coolDownDays
  ) external;

  function updateConf(
    uint32 decayInterval,
    uint16 decayFactor,
    uint32 swapFactor,
    uint32 stakeFactor,
    uint16 taxPoints,
    uint8 coolDownDays
  ) external;

  function updatePriceRatio(uint32 priceRatio_) external;

  function updateOracle(address oracle_) external;

  function pausePool(bool paused) external;

  // Split configuration in two struct to avoid following error calling initPool
  // CompilerError: Stack too deep when compiling inline assembly:
  // Variable value0 is 1 slot(s) too deep inside the stack.
  function updateExtraConf(
    uint32 sPSynrEquivalent,
    uint32 sPBoostFactor,
    uint32 sPBoostLimit,
    uint32 bPSynrEquivalent,
    uint32 bPBoostFactor,
    uint32 bPBoostLimit
  ) external;

  function shouldUpdateRatio() external view returns (bool);

  function updateRatio() external;

  function collectRewards() external;

  function pendingRewards(address user) external view returns (uint256);

  function untaxedPendingRewards(address user, uint256 timestamp) external view returns (uint256);

  function getDepositByIndex(address user, uint256 index) external view returns (Deposit memory);

  function getDepositsLength(address user) external view returns (uint256);

  function getDepositIndexByMainIndex(address user, uint256 mainIndex) external view returns (uint256, bool);

  function withdrawTaxes(uint256 amount, address beneficiary) external;

  function stake(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID
  ) external;

  function unstake(Deposit memory deposit) external;
}
