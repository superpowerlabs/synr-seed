// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../token/TokenReceiver.sol";
import "../utils/PayloadUtils.sol";
import "../interfaces/ISidePool.sol";
import "../token/SideToken.sol";
import "../token/SynCityCouponsSimplified.sol";
import "./Constants.sol";

import "hardhat/console.sol";

contract SidePool is Constants, PayloadUtils, ISidePool, TokenReceiver, Initializable, OwnableUpgradeable, UUPSUpgradeable {
  using SafeMathUpgradeable for uint256;
  using AddressUpgradeable for address;

  // users and deposits
  mapping(address => User) public users;
  Conf public conf;
  NftConf public nftConf;

  SideToken public poolToken;
  SynCityCouponsSimplified public blueprint;

  uint256 public penalties;
  uint256 public taxes;

  //  /// @custom:oz-upgrades-unsafe-allow constructor
  //  constructor() initializer {}

  // solhint-disable-next-line
  function __SidePool_init(address poolToken_, address blueprint_) public initializer {
    __Ownable_init();
    require(poolToken_.isContract(), "SEED not a contract");
    require(blueprint_.isContract(), "Blueprint not a contract");
    poolToken = SideToken(poolToken_);
    blueprint = SynCityCouponsSimplified(blueprint_);
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

  function initPool(
    uint32 rewardsFactor_,
    uint32 decayInterval_,
    uint16 decayFactor_,
    uint16 swapFactor_,
    uint16 stakeFactor_,
    uint16 taxPoints_
  ) external override onlyOwner {
    require(conf.maximumLockupTime == 0, "SidePool: already initiated");
    conf = Conf({
      rewardsFactor: rewardsFactor_,
      decayInterval: decayInterval_,
      decayFactor: decayFactor_,
      maximumLockupTime: 365,
      poolInitAt: uint32(block.timestamp),
      lastRatioUpdateAt: uint32(block.timestamp),
      swapFactor: swapFactor_,
      stakeFactor: stakeFactor_,
      taxPoints: taxPoints_
    });
  }

  // put to zero any parameter that remains the same
  function updateConf(
    uint32 decayInterval_,
    uint16 decayFactor_,
    uint16 swapFactor_,
    uint16 stakeFactor_,
    uint16 taxPoints_
  ) external override onlyOwner {
    require(conf.maximumLockupTime > 0, "SidePool: not initiated yet");
    if (decayInterval_ > 0) {
      conf.decayInterval = decayInterval_;
    }
    if (decayFactor_ > 0) {
      conf.decayFactor = decayFactor_;
    }
    if (swapFactor_ > 0) {
      conf.swapFactor = swapFactor_;
    }
    if (stakeFactor_ > 0) {
      conf.stakeFactor = stakeFactor_;
    }
    if (taxPoints_ > 0) {
      conf.taxPoints = taxPoints_;
    }
  }

  // put to zero any parameter that remains the same
  function updateNftConf(
    uint32 synrEquivalent_,
    uint16 sPBoostFactor_,
    uint32 sPBoostLimit_,
    uint16 bPBoostFactor_,
    uint32 bPBoostLimit_
  ) external override onlyOwner {
    require(conf.maximumLockupTime > 0, "SidePool: not initiated yet");
    if (synrEquivalent_ > 0) {
      nftConf.synrEquivalent = synrEquivalent_;
    }
    if (sPBoostFactor_ > 0) {
      nftConf.sPBoostFactor = sPBoostFactor_;
    }
    if (bPBoostFactor_ > 0) {
      nftConf.bPBoostFactor = bPBoostFactor_;
    }
    if (sPBoostLimit_ > 0) {
      nftConf.sPBoostLimit = sPBoostLimit_;
    }
    if (bPBoostLimit_ > 0) {
      nftConf.bPBoostLimit = bPBoostLimit_;
    }
  }

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  function _updateLastRatioUpdateAt() internal {
    conf.lastRatioUpdateAt = uint32(block.timestamp);
  }

  function shouldUpdateRatio() public view returns (bool) {
    return
      block.timestamp.sub(conf.poolInitAt).div(conf.decayInterval) >
      uint256(conf.lastRatioUpdateAt).sub(conf.poolInitAt).div(conf.decayInterval);
  }

  function multiplier() public pure override returns (uint256) {
    return 1e9;
  }

  function lockupTime(Deposit memory deposit) public view override returns (uint256) {
    return uint256(deposit.lockedUntil).sub(deposit.lockedFrom).div(1 days);
  }

  function updateRatio() public {
    if (shouldUpdateRatio()) {
      uint256 count = block.timestamp.sub(conf.poolInitAt).div(conf.decayInterval) -
        uint256(conf.lastRatioUpdateAt).sub(conf.poolInitAt).div(conf.decayInterval);
      uint256 ratio = uint256(conf.rewardsFactor);
      for (uint256 i = 0; i < count; i++) {
        ratio = ratio.mul(conf.decayFactor).div(10000);
      }
      conf.rewardsFactor = uint32(ratio);
      conf.lastRatioUpdateAt = uint32(block.timestamp);
    }
  }

  function yieldWeight(Deposit memory deposit) public view override returns (uint256) {
    return uint256(10000).add(lockupTime(deposit).mul(10000).div(conf.maximumLockupTime));
  }

  function calculateUntaxedRewards(Deposit memory deposit, uint256 timestamp) public view returns (uint256) {
    if (deposit.tokenAmount == 0) {
      return 0;
    }
    uint256 lockedUntil = uint256(deposit.lockedUntil);
    uint256 now_ = lockedUntil > timestamp ? timestamp : lockedUntil;
//    console.log("------");
//    console.log(uint(deposit.rewardsFactor));
//    console.log(uint(deposit.lastRewardsAt));
//    console.log(now_.sub(deposit.lastRewardsAt));
//    console.log(lockedUntil.sub(deposit.lockedFrom));
//    console.log(yieldWeight(deposit));
    return uint256(deposit.tokenAmount)
        .mul(deposit.rewardsFactor)
        .mul(now_.sub(deposit.lastRewardsAt))
        .div(lockedUntil.sub(deposit.lockedFrom))
        .mul(yieldWeight(deposit))
        .div(1000000);
  }

  function calculateTaxOnRewards(uint256 rewards) public view returns (uint256) {
    return rewards.mul(conf.taxPoints).div(10000);
  }

  function boostWeight(address user_) public view returns (uint256) {
    User storage user = users[user_];
    uint256 baseAmount = uint256(user.tokenAmount);
    uint boost = 10000;
    if (baseAmount == 0) {
      return boost;
    }
    uint256 boostedAmount = baseAmount;
    uint256 limit;
    if (user.passAmount > 0) {
      limit = uint256(user.passAmount).mul(1e18).mul(nftConf.sPBoostLimit);
      if (limit < baseAmount) {
        baseAmount = limit;
      }
      boostedAmount += baseAmount.mul(uint256(user.passAmount).mul(nftConf.sPBoostFactor)).div(10000);
    }
    baseAmount = uint256(user.tokenAmount);
    if (user.blueprintsAmount > 0) {
      limit = uint256(user.blueprintsAmount).mul(1e18).mul(nftConf.bPBoostLimit);
      if (limit < boostedAmount) {
        baseAmount = limit;
      }
      boostedAmount += baseAmount.mul(uint256(user.blueprintsAmount).mul(nftConf.bPBoostFactor)).div(10000);
    }
    return boost.mul(boostedAmount).div(user.tokenAmount);
  }

  function collectRewards() public {
    _collectRewards(_msgSender());
  }

  function _collectRewards(address user_) internal {
    User storage user = users[user_];
    uint256 rewards;
    for (uint256 i = 0; i < user.deposits.length; i++) {
      rewards += calculateUntaxedRewards(user.deposits[i], block.timestamp);
      user.deposits[i].lastRewardsAt = uint32(block.timestamp);
    }
    if (rewards > 0) {
      rewards = rewards.mul(boostWeight(user_)).div(uint(10000));
      uint256 tax = calculateTaxOnRewards(rewards);
      poolToken.mint(user_, rewards.sub(tax));
      poolToken.mint(address(this), tax);
      taxes += tax;
    }
  }

  function untaxedPendingRewards(address user_, uint256 timestamp) external view returns (uint256) {
    User storage user = users[user_];
    uint256 rewards;
    for (uint256 i = 0; i < user.deposits.length; i++) {
      rewards += calculateUntaxedRewards(user.deposits[i], timestamp);
    }
    if (rewards > 0) {
      rewards = rewards.mul(boostWeight(user_)).div(uint(10000));
    }
    return rewards;
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public pure override returns (uint256) {
    require(deposit.tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SidePool: invalid token type");
    require(deposit.lockedFrom < deposit.lockedUntil, "SidePool: invalid interval");
    require(deposit.lockedUntil < 1e10, "SidePool: lockedTime out of range");
    require(deposit.tokenAmountOrID < 1e28, "SidePool: tokenAmountOrID out of range");
    return
      uint256(deposit.tokenType)
        .add(uint256(deposit.lockedFrom).mul(10))
        .add(uint256(deposit.lockedUntil).mul(1e11))
        .add(uint256(deposit.mainIndex).mul(1e21))
        .add(uint256(deposit.tokenAmountOrID).mul(1e26));
  }

  function getDepositByIndex(address user, uint256 index) public view override returns (Deposit memory) {
    require(users[user].deposits[index].tokenAmountOrID > 0, "SidePool: deposit not found");
    return users[user].deposits[index];
  }

  function getDepositsLength(address user) public view override returns (uint256) {
    return users[user].deposits.length;
  }

  function _stake(
    address user_,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    require(tokenType <= BLUEPRINT_STAKE_FOR_BOOST, "SidePool: invalid tokenType");
    updateRatio();
    _collectRewards(user_);
    uint256 tokenAmount;
    if (tokenType == S_SYNR_SWAP) {
      tokenAmount = tokenAmountOrID.mul(conf.swapFactor);
      poolToken.mint(address(this), tokenAmount);
    } else if (tokenType == SYNR_STAKE) {
      tokenAmount = tokenAmountOrID.mul(conf.stakeFactor);
      poolToken.mint(address(this), tokenAmount);
    } else if (tokenType == SYNR_PASS_STAKE_FOR_BOOST) {
      users[user_].passAmount++;
    } else if (tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      tokenAmount = uint256(nftConf.synrEquivalent).mul(conf.stakeFactor);
      poolToken.mint(address(this), tokenAmount);
    } else if (tokenType == BLUEPRINT_STAKE_FOR_BOOST) {
      users[user_].blueprintsAmount++;
      blueprint.safeTransferFrom(user_, address(this), tokenAmountOrID);
    }
    users[user_].tokenAmount = uint96(uint256(users[user_].tokenAmount).add(tokenAmount));
    // add deposit
    if (tokenType == 0) {
      lockedUntil = lockedFrom + conf.decayInterval;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmountOrID: uint96(tokenAmountOrID),
      unstakedAt: 0,
      mainIndex: uint16(mainIndex),
      tokenAmount: uint128(tokenAmount),
      lastRewardsAt: uint32(lockedFrom),
      rewardsFactor: conf.rewardsFactor
    });
    users[user_].deposits.push(deposit);
  }

  function stakeBlueprint(uint256 tokenId) external {
    _stake(_msgSender(), 4, block.timestamp, 0, type(uint16).max, tokenId);
  }

  function unstakeBlueprint(uint256 tokenId) external {
    User storage user = users[_msgSender()];
    for (uint256 i; i < user.deposits.length; i++) {
      if (uint256(user.deposits[i].tokenAmountOrID) == tokenId && user.deposits[i].tokenType == BLUEPRINT_STAKE_FOR_BOOST) {
        _collectRewards(_msgSender());
        user.blueprintsAmount--;
        user.deposits[i].unstakedAt = uint32(block.timestamp);
        blueprint.safeTransferFrom(address(this), _msgSender(), uint256(user.deposits[i].tokenAmountOrID));
      }
    }
  }

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) public view returns (uint256) {
    if (lockedUntil == 0) {
      return 10000;
    }
    uint256 lockupTime = lockedUntil.sub(lockedFrom);
    return 100;
    if (lockupTime == 0) {
      return 10000;
    }
    uint256 vestedTime = when.sub(lockedFrom);
    // 300 > 3%
    return vestedTime.mul(10000).div(lockupTime);
  }

  function unstakeIfSSynr(uint256 depositIndex) external {
    Deposit storage deposit = users[_msgSender()].deposits[depositIndex];
    require(deposit.tokenType == S_SYNR_SWAP, "SidePool: not a sSYNR > SEED swap");
    _collectRewards(_msgSender());
    if (deposit.lockedUntil > block.timestamp) {
      uint256 vestedPercentage = getVestedPercentage(block.timestamp, deposit.lockedFrom, deposit.lockedUntil);
      uint256 unstakedAmount = uint256(deposit.tokenAmount).mul(vestedPercentage).div(10000);
      penalties += uint256(deposit.tokenAmount).sub(unstakedAmount);
      poolToken.transfer(_msgSender(), unstakedAmount);
    } else {
      poolToken.transfer(_msgSender(), uint256(deposit.tokenAmount));
    }
    deposit.unstakedAt = uint32(block.timestamp);
  }

  //  function

  function canUnstakeWithoutTax(address user, uint256 mainIndex) external view override returns (bool) {
    Deposit memory deposit = users[user].deposits[mainIndex];
    return deposit.lockedUntil > 0 && block.timestamp > uint256(deposit.lockedUntil);
  }

  function getDepositIndexByMainIndex(address user, uint256 mainIndex) public view override returns (uint256) {
    for (uint256 i; i < users[user].deposits.length; i++) {
      if (uint256(users[user].deposits[i].mainIndex) == mainIndex && users[user].deposits[i].lockedFrom > 0) {
        return i;
      }
    }
    revert("SidePool: deposit not found");
  }

  function _unstake(
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    require(tokenType > S_SYNR_SWAP, "SidePool: sSYNR cannot be unstaked");
    if (tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      require(lockedUntil < block.timestamp, "SidePool: SYNR Pass used as SYNR cannot be early unstaked");
    }
    _collectRewards(_msgSender());
    mainIndex = getDepositIndexByMainIndex(_msgSender(), mainIndex);
    Deposit storage deposit = users[_msgSender()].deposits[mainIndex];
    require(
      uint256(deposit.tokenType) == tokenType &&
        uint256(deposit.lockedFrom) == lockedFrom &&
        uint256(deposit.lockedUntil) == lockedUntil &&
        uint256(deposit.tokenAmountOrID) == tokenAmountOrID,
      "SidePool: deposit not found"
    );
    if (tokenType == SYNR_STAKE) {
      uint256 vestedPercentage = getVestedPercentage(
        block.timestamp,
        uint256(deposit.lockedFrom),
        uint256(deposit.lockedUntil)
      );
      uint256 unstakedAmount;
      if (vestedPercentage < 10000) {
        unstakedAmount = uint256(deposit.tokenAmount).mul(vestedPercentage).div(10000);
        penalties += uint256(deposit.tokenAmount).sub(unstakedAmount);
      } else {
        unstakedAmount = uint256(deposit.tokenAmount);
      }
      poolToken.transfer(_msgSender(), unstakedAmount);
    } else if (tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      poolToken.transfer(_msgSender(), deposit.tokenAmount);
    } else if (tokenType == SYNR_PASS_STAKE_FOR_BOOST) {
      users[_msgSender()].passAmount--;
    }
    deposit.unstakedAt = uint32(block.timestamp);
  }

  function withdrawPenaltiesOrTaxes(
    uint256 amount,
    address beneficiary,
    uint256 what
  ) external override onlyOwner {
    uint256 available = what == 1 ? penalties : taxes;
    require(amount <= available, "SidePool: amount not available");
    if (amount == 0) {
      amount = available;
    }
    available -= amount;
    poolToken.transfer(beneficiary, amount);
  }
}
