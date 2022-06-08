// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../interfaces/ISidePoolViews.sol";
import "../utils/Constants.sol";
import "../mocks/previously-deployed/utils/Ownable.sol";

//import "hardhat/console.sol";

contract SidePoolViews is ISidePoolViews, Constants, Initializable, OwnableUpgradeable, UUPSUpgradeable {
  using SafeMathUpgradeable for uint256;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  // solhint-disable-next-line
  function initialize() public initializer {
    __Ownable_init();
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

  function getLockupTime(Deposit memory deposit) public pure override returns (uint256) {
    return uint256(deposit.lockedUntil).sub(deposit.lockedFrom);
  }

  function yieldWeight(Conf memory conf, Deposit memory deposit) public view override returns (uint256) {
    return uint256(10000).add(getLockupTime(deposit).mul(10000).div(conf.maximumLockupTime).div(1 days));
  }

  function calculateUntaxedRewards(
    Conf memory conf,
    Deposit memory deposit,
    uint256 timestamp,
    uint256 lastRewardsAt
  ) public view override returns (uint256) {
    if (
      deposit.tokenType == S_SYNR_SWAP ||
      deposit.generator == 0 ||
      deposit.unlockedAt != 0 ||
      lastRewardsAt >= deposit.lockedUntil
    ) {
      return 0;
    }
    if (timestamp > deposit.lockedUntil) {
      timestamp = deposit.lockedUntil;
    }
    return
      uint256(deposit.generator)
        .mul(deposit.rewardsFactor)
        .mul(yieldWeight(conf, deposit))
        .mul(timestamp.sub(lastRewardsAt))
        .div(365 * 1 days)
        .div(10000 * 10000);
  }

  function calculateTaxOnRewards(Conf memory conf, uint256 rewards) public pure override returns (uint256) {
    return rewards.mul(conf.taxPoints).div(10000);
  }

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) public pure override returns (uint256) {
    if (lockedUntil == 0) {
      return 10000;
    }
    uint256 lockupTime = lockedUntil.sub(lockedFrom);
    if (lockupTime == 0) {
      return 10000;
    }
    uint256 vestedTime = when.sub(lockedFrom);
    return vestedTime.mul(10000).div(lockupTime);
  }

  function boostRewards(
    ExtraConf memory extraConf,
    uint256 rewards,
    uint256 stakedAmount,
    uint256 passAmountForBoost,
    uint256 blueprintAmountForBoost
  ) public view returns (uint256) {
    // this split is to avoid a too deep stack issue
    if (extraConf.sPBoostFactor > extraConf.bPBoostFactor) {
      return
        _boostRewardsByBestBooster(
          rewards,
          stakedAmount,
          passAmountForBoost,
          extraConf.sPBoostFactor,
          extraConf.sPBoostLimit,
          blueprintAmountForBoost,
          extraConf.bPBoostFactor,
          extraConf.bPBoostLimit
        );
    } else {
      return
        _boostRewardsByBestBooster(
          rewards,
          stakedAmount,
          blueprintAmountForBoost,
          extraConf.bPBoostFactor,
          extraConf.bPBoostLimit,
          passAmountForBoost,
          extraConf.sPBoostFactor,
          extraConf.sPBoostLimit
        );
    }
  }

  function _boostRewardsByBestBooster(
    uint256 rewards,
    uint256 stakedAmount,
    uint256 amount1,
    uint256 boost1,
    uint256 limit1,
    uint256 amount2,
    uint256 boost2,
    uint256 limit2
  ) internal pure returns (uint256) {
    uint256 boostableAmount;
    uint256 boosted;
    if (amount1 > 0) {
      boostableAmount = amount1.mul(limit1).mul(10**18);
      if (stakedAmount < boostableAmount) {
        boostableAmount = stakedAmount;
      }
      uint256 boostableRewards = rewards.mul(boostableAmount).div(stakedAmount);
      rewards = rewards.sub(boostableRewards);
      boosted = boostableRewards.mul(boost1).div(10000);
    }
    if (amount2 > 0 && stakedAmount.sub(boostableAmount) > 0) {
      if (stakedAmount.sub(boostableAmount) < amount2.mul(limit2).mul(10**18)) {
        boostableAmount = stakedAmount.sub(boostableAmount);
      } else {
        boostableAmount = amount2.mul(limit2).mul(10**18);
      }
      uint256 boostableRewards = rewards.mul(boostableAmount).div(stakedAmount);
      if (boostableRewards > rewards) {
        boostableRewards = rewards;
      }
      rewards = rewards.sub(boostableRewards);
      boosted = boosted.add(boostableRewards.mul(boost2).div(10000));
    }
    return rewards.add(boosted);
  }
}
