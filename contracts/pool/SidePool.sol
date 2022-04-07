// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "../token/TokenReceiver.sol";
import "../utils/Payload.sol";
import "../interfaces/ISidePool.sol";
import "../token/SideToken.sol";
import "../token/SynCityCouponsTestNet.sol";

import "hardhat/console.sol";

contract SidePool is Payload, ISidePool, TokenReceiver, Initializable, OwnableUpgradeable {
  using SafeMathUpgradeable for uint256;
  using AddressUpgradeable for address;

  // users and deposits
  mapping(address => User) public users;
  Conf public conf;

  SideToken public poolToken;
  SynCityCouponsTestNet public blueprint;

  uint256 public collectedPenalties;

  // solhint-disable-next-line
  function __SidePool_init(address seed_) public initializer {
    __Ownable_init();
    require(seed_.isContract(), "SEED not a contract");
    poolToken = SideToken(seed_);
  }

  function initPool(
    uint32 rewardsFactor_,
    uint32 decayInterval_,
    uint16 decayFactor_,
    uint16 swapFactor_,
    uint16 stakeFactor_
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
      stakeFactor: stakeFactor_
    });
  }

  // put to zero any parameter that should remain the same
  function updateDecayAndFactors(
    uint32 decayInterval_,
    uint16 decayFactor_,
    uint16 swapFactor_,
    uint16 stakeFactor_
  ) external onlyOwner {
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

  function yieldWeight(Deposit memory deposit) public view override returns (uint256) {
    return uint256(1000).add(lockupTime(deposit).mul(1000).div(conf.maximumLockupTime));
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

  function calculateRewards(Deposit memory deposit) public view returns(uint) {
    uint lockedUntil = uint(deposit.lockedUntil);
    uint now = lockedUntil > block.timestamp ? block.timestamp : lockedUntil;
    return uint(deposit.tokenAmount).mul(deposit.rewardsFactor).div(100).mul(now.sub(deposit.lastRewardsAt))
  .div(lockedUntil.sub(deposit.lockedFrom));
  }

  function collectRewards() external {
    User storage user = users[_msgSender()];
    uint rewards;
    for (uint i=0;i< user.deposits.length; i++) {
      rewards += calculateRewards(user.deposits[i]);
      user.deposits[i].lastRewardsAt = uint32(block.timestamp);
    }
    if (rewards > 0) {
      poolToken.mint(_msgSender(), rewards);
    }
  }

  function pendingRewards(address user) external view returns(uint) {
    User storage user = users[user];
    uint rewards;
    for (uint i=0;i< user.deposits.length; i++) {
      rewards += calculateRewards(user.deposits[i]);
    }
    return rewards;
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public pure override returns (uint256) {
    require(deposit.tokenType < 3, "SidePool: invalid token type");
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

  function getDepositByIndex(address user, uint256 mainIndex) public view override returns (Deposit memory) {
    require(users[user].deposits[mainIndex].lockedFrom > 0, "SidePool: deposit not found");
    return users[user].deposits[mainIndex];
  }

  function getDepositsLength(address user) public view override returns (uint256) {
    return users[user].deposits.length;
  }

  function _stake(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    updateRatio();
    uint256 tokenAmount;
    if (tokenType == 0) {
      tokenAmount = tokenAmountOrID.mul(conf.swapFactor);
      poolToken.mint(address(this), tokenAmount);
    } else if (tokenType == 1) {
      tokenAmount = tokenAmountOrID.mul(conf.stakeFactor);
      poolToken.mint(address(this), tokenAmount);
    }
    users[user].tokenAmount = uint96(uint256(users[user].tokenAmount).add(tokenAmount));
    // add deposit
    if (tokenType == 0) {
      lockedUntil = lockedFrom + conf.decayInterval;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmountOrID: uint96(tokenAmountOrID),
      unlockedAt: 0,
      mainIndex: uint16(mainIndex),
      tokenAmount: uint128(tokenAmount),
      lastRewardsAt: uint32(lockedFrom),
      rewardsFactor: conf.rewardsFactor
    });
    users[user].deposits.push(deposit);
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

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) public view returns (uint256) {
    uint256 lockupTime = lockedUntil.sub(lockedFrom);
    uint256 vestedTime = when.sub(lockedFrom);
    return vestedTime.mul(100).div(lockupTime);
  }

  function _unstake(
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    mainIndex = getDepositIndexByMainIndex(_msgSender(), mainIndex);
    Deposit storage deposit = users[_msgSender()].deposits[mainIndex];
    require(
      uint256(deposit.tokenType) == tokenType &&
        uint256(deposit.lockedFrom) == lockedFrom &&
        uint256(deposit.lockedUntil) == lockedUntil &&
        uint256(deposit.tokenAmountOrID) == tokenAmountOrID,
      "SidePool: deposit not found"
    );
    uint vestedPercentage = getVestedPercentage(block.timestamp, uint(deposit.lockedFrom),
      uint(deposit.lockedUntil));
    uint unstakedAmount;
    if (vestedPercentage < 100) {
      unstakedAmount = uint(deposit.tokenAmount).mul(vestedPercentage).div(100);
      collectedPenalties += uint(deposit.tokenAmount).sub(unstakedAmount);
    } else {
      unstakedAmount = uint(deposit.tokenAmount);
    }
    poolToken.transfer(_msgSender(), unstakedAmount);
    deposit.unlockedAt = uint32(block.timestamp);
  }

  function withdrawPenalties(uint256 amount, address beneficiary) external override onlyOwner {
    require(amount <= collectedPenalties, "SidePool: amount not available");
    if (amount == 0) {
      amount = collectedPenalties;
    }
    collectedPenalties -= amount;
    poolToken.transfer(beneficiary, amount);
  }
}
