// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "./ISideUser.sol";
import "./ISideConf.sol";

interface ISidePoolViews is ISideUser, ISideConf {
  /**
   * @param deposit The deposit
   * @return the time it will be locked
   */
  function getLockupTime(Deposit memory deposit) external view returns (uint256);

  /**
   * @param conf The pool configuration
   * @param deposit The deposit
   * @return the weighted yield
   */
  function yieldWeight(Conf memory conf, Deposit memory deposit) external view returns (uint256);

  /**
   * @param conf The pool configuration
   * @param deposit The deposit for which calculate the rewards
   * @param timestamp Current time of the stake
   * @param lastRewardsAt Last time rewards were collected
   * @return the Amount of untaxed reward
   */
  function calculateUntaxedRewards(
    Conf memory conf,
    Deposit memory deposit,
    uint256 timestamp,
    uint256 lastRewardsAt
  ) external view returns (uint256);

  /**
   * @notice Calculates the tax for claiming reward
   * @param rewards The rewards of the stake
   */
  function calculateTaxOnRewards(Conf memory conf, uint256 rewards) external view returns (uint256);

  function boostRewards(
    ExtraConf memory extraConf,
    uint256 rewards,
    uint256 stakedAmount,
    uint256 passAmountForBoost,
    uint256 blueprintAmountForBoost
  ) external view returns (uint256);

  /**
   * @notice gets Percentage Vested at a certain timestamp
   * @param when timestamp where percentage will be calculated
   * @param lockedFrom timestamp when locked
   * @param lockedUntil timestamp when can unstake without penalty on MainPool
   * @return the percentage vested
   */
  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) external pure returns (uint256);
}
