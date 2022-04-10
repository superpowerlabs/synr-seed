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
import "../interfaces/IMainPool.sol";
import "../token/SyndicateERC20.sol";
import "../token/SyntheticSyndicateERC20.sol";
import "../token/SynCityPasses.sol";
import "./Constants.sol";

import "hardhat/console.sol";

contract MainPool is Constants, IMainPool, PayloadUtils, TokenReceiver, Initializable, OwnableUpgradeable, UUPSUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  // users and deposits
  mapping(address => User) public users;
  Conf public conf;

  SyndicateERC20 public synr;
  SyntheticSyndicateERC20 public sSynr;
  SynCityPasses public pass;

  uint256 public penalties;

  //    /// @custom:oz-upgrades-unsafe-allow constructor
  //    constructor() initializer {}

  // solhint-disable-next-line
  function __MainPool_init(
    address synr_,
    address sSynr_,
    address pass_
  ) internal virtual initializer {
    __Ownable_init();
    require(synr_.isContract(), "synr_ not a contract");
    require(sSynr_.isContract(), "sSynr_ not a contract");
    require(pass_.isContract(), "pass_ not a contract");
    synr = SyndicateERC20(synr_);
    sSynr = SyntheticSyndicateERC20(sSynr_);
    pass = SynCityPasses(pass_);
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

  function initPool(uint16 minimumLockupTime_, uint16 earlyUnstakePenalty_) external override onlyOwner {
    require(sSynr.isOperatorInRole(address(this), 0x0004_0000), "MainPool: contract cannot receive sSYNR");
    require(conf.maximumLockupTime == 0, "MainPool: already initiated");
    conf = Conf({minimumLockupTime: minimumLockupTime_, maximumLockupTime: 365, earlyUnstakePenalty: earlyUnstakePenalty_});
  }

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public pure override returns (uint256) {
    require(deposit.tokenType <= SYNR_PASS_STAKE_FOR_SEEDS, "PayloadUtils: invalid token type");
    require(deposit.lockedUntil < 1e10, "PayloadUtils: lockedTime out of range");
    require(deposit.lockedUntil == 0 || deposit.lockedFrom < deposit.lockedUntil, "PayloadUtils: invalid interval");
    require(deposit.tokenAmountOrID < 1e28, "PayloadUtils: tokenAmountOrID out of range");
    return
      uint256(deposit.tokenType)
        .add(uint256(deposit.lockedFrom).mul(10))
        .add(uint256(deposit.lockedUntil).mul(1e11))
        .add(uint256(deposit.mainIndex).mul(1e21))
        .add(uint256(deposit.tokenAmountOrID).mul(1e26));
  }

  function _updateUserAndAddDeposit(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 tokenAmountOrID,
    uint16 otherChain,
    uint256 mainIndex
  ) internal returns (Deposit memory) {
    if (tokenType == SYNR_STAKE) {
      users[user].synrAmount += uint96(tokenAmountOrID);
    } else if (tokenType == SYNR_PASS_STAKE_FOR_BOOST || tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      users[user].passAmount++;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmountOrID: uint96(tokenAmountOrID),
      unstakedAt: 0,
      otherChain: otherChain,
      mainIndex: uint16(mainIndex)
    });
    users[user].deposits.push(deposit);
    return deposit;
  }

  function getDepositByIndex(address user, uint256 mainIndex) public view override returns (Deposit memory) {
    require(users[user].deposits[mainIndex].lockedFrom > 0, "PayloadUtils: deposit not found");
    return users[user].deposits[mainIndex];
  }

  function getDepositsLength(address user) public view override returns (uint256) {
    return users[user].deposits.length;
  }

  function _makeDeposit(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID,
    uint16 otherChain
  ) internal returns (uint256) {
    validateInput(tokenType, lockupTime, tokenAmountOrID);
    if (tokenType == SYNR_STAKE || tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      require(
        lockupTime > conf.minimumLockupTime - 1 && lockupTime < conf.maximumLockupTime + 1,
        "MainPool: invalid lockupTime type"
      );
    }
    // Contract must be approved as spender.
    // It will throw if the balance is insufficient
    if (tokenType == S_SYNR_SWAP) {
      // MainPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), tokenAmountOrID);
    } else if (tokenType == SYNR_STAKE) {
      // MainPool must be approved to spend the SYNR
      synr.safeTransferFrom(_msgSender(), address(this), tokenAmountOrID, "");
    } else {
      // tokenType 2 and 3
      // SYNR Pass
      // MainPool must be approved to make the transfer
      pass.safeTransferFrom(_msgSender(), address(this), tokenAmountOrID);
    }
    return fromDepositToTransferPayload(_updateUser(_msgSender(), tokenType, lockupTime, tokenAmountOrID, otherChain));
  }

  function depositsLength(address user) public view returns (uint256) {
    return users[user].deposits.length;
  }

  function _updateUser(
    address user,
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID,
    uint16 otherChain
  ) internal returns (Deposit memory) {
    uint256 lockedUntil = tokenType == SYNR_STAKE || tokenType == SYNR_PASS_STAKE_FOR_SEEDS
      ? uint32(block.timestamp.add(lockupTime * 1 days))
      : 0;
    Deposit memory deposit = _updateUserAndAddDeposit(
      user,
      tokenType,
      uint32(block.timestamp),
      lockedUntil,
      tokenAmountOrID,
      otherChain,
      depositsLength(user)
    );
    return deposit;
  }

  function _unstake(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    require(tokenType > S_SYNR_SWAP, "MainPool: sSYNR can not be unstaked");
    if (tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      require(lockedUntil < block.timestamp, "MainPool: SYNR Pass cannot be early unstaked");
    }
    if (tokenType == SYNR_STAKE) {
      users[user].synrAmount = uint96(uint256(users[user].synrAmount).sub(tokenAmountOrID));
    } else {
      users[user].passAmount = uint16(uint256(users[user].passAmount).sub(1));
    }
    Deposit storage deposit = users[user].deposits[mainIndex];
    require(
      uint256(deposit.mainIndex) == mainIndex &&
        uint256(deposit.tokenType) == tokenType &&
        uint256(deposit.lockedFrom) == lockedFrom &&
        uint256(deposit.lockedUntil) == lockedUntil &&
        uint256(deposit.tokenAmountOrID) == tokenAmountOrID,
      "MainPool: inconsistent deposit"
    );
    require(deposit.unstakedAt == 0, "MainPool: deposit already unstaked");
    if (tokenType == SYNR_PASS_STAKE_FOR_BOOST || tokenType == SYNR_PASS_STAKE_FOR_SEEDS) {
      pass.safeTransferFrom(address(this), user, uint256(tokenAmountOrID));
    } else {
      uint256 penalty = calculatePenaltyForEarlyUnstake(block.timestamp, deposit);
      uint256 amount = uint256(tokenAmountOrID).sub(penalty);
      synr.safeTransferFrom(address(this), user, amount, "");
      if (penalty > 0) {
        penalties += penalty;
      }
    }
    deposit.unstakedAt = uint32(block.timestamp);
    emit DepositUnlocked(user, uint16(mainIndex));
  }

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) public view override returns (uint256) {
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

  function calculatePenaltyForEarlyUnstake(uint256 when, Deposit memory deposit) public view override returns (uint256) {
    if (when > uint256(deposit.lockedUntil)) {
      return 0;
    }
    uint256 vestedPercentage = getVestedPercentage(when, uint256(deposit.lockedFrom), uint256(deposit.lockedUntil));
    uint256 unvestedAmount = uint256(deposit.tokenAmountOrID).mul(vestedPercentage).div(10000);
    return unvestedAmount.mul(conf.earlyUnstakePenalty).div(10000);
  }

  function withdrawSSynr(uint256 amount, address beneficiary) external override onlyOwner {
    uint256 availableAmount = sSynr.balanceOf(address(this));
    require(amount <= availableAmount, "MainPool: sSYNR amount not available");
    if (amount == 0) {
      amount = availableAmount;
    }
    // beneficiary must be whitelisted to receive sSYNR
    sSynr.transferFrom(address(this), beneficiary, amount);
  }

  function withdrawPenalties(uint256 amount, address beneficiary) external override onlyOwner {
    require(amount <= penalties, "MainPool: amount not available");
    if (amount == 0) {
      amount = penalties;
    }
    penalties -= amount;
    synr.transferFrom(address(this), beneficiary, amount);
  }

  function _stake(uint256 payload, uint16 recipientChain) internal {
    (uint256 tokenType, uint256 lockupTime, uint256 tokenAmountOrID) = deserializeInput(payload);
    require(conf.minimumLockupTime > 0, "MainPool: pool not alive");
    payload = _makeDeposit(tokenType, lockupTime, tokenAmountOrID, recipientChain);
    emit DepositSaved(_msgSender(), uint16(getIndexFromPayload(payload)));
  }
  uint256[50] private __gap;
}
