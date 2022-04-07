// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "./interfaces/IERC20Receiver.sol";

import "./Payload.sol";
import "./interfaces/IMainPool.sol";
import "./token/SyndicateERC20.sol";
import "./token/SyntheticSyndicateERC20.sol";
import "./token/SynCityPasses.sol";

import "hardhat/console.sol";

contract MainPool is IMainPool, Payload, IERC20Receiver, IERC721ReceiverUpgradeable, Initializable, OwnableUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  // users and deposits
  mapping(address => User) public users;

  SyndicateERC20 public synr;
  SyntheticSyndicateERC20 public sSynr;
  SynCityPasses public pass;

  uint256 public collectedPenalties;
  uint256 public encodedConf;

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

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public pure override returns (uint256) {
    require(deposit.tokenType < 3, "Payload: invalid token type");
    require(deposit.lockedFrom < deposit.lockedUntil, "Payload: invalid interval");
    require(deposit.lockedUntil < 1e10, "Payload: lockedTime out of range");
    require(deposit.tokenAmountOrID < 1e28, "Payload: tokenAmountOrID out of range");
    return
      uint256(deposit.tokenType)
        .add(uint256(deposit.lockedFrom).mul(10))
        .add(uint256(deposit.lockedUntil).mul(1e11))
        .add(uint256(deposit.mainIndex).mul(1e21))
        .add(uint256(deposit.tokenAmountOrID).mul(1e26));
  }

  function onERC20Received(
    // solhint-disable-next-line
    address _operator,
    // solhint-disable-next-line
    address _from,
    // solhint-disable-next-line
    uint256 _value,
    // solhint-disable-next-line
    bytes calldata _data
  ) external pure override returns (bytes4) {
    return 0x4fc35859;
  }

  function onERC721Received(
    // solhint-disable-next-line
    address operator,
    // solhint-disable-next-line
    address from,
    // solhint-disable-next-line
    uint256 tokenId,
    // solhint-disable-next-line
    bytes calldata data
  ) external override returns (bytes4) {
    return 0xf0b9e5ba;
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
    if (tokenType == 0) {
      users[user].sSynrAmount += uint96(tokenAmountOrID);
    } else if (tokenType == 1) {
      users[user].synrAmount += uint96(tokenAmountOrID);
    } else {
      users[user].passAmount += 1;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmountOrID: uint96(tokenAmountOrID),
      unlockedAt: 0,
      otherChain: otherChain,
      mainIndex: uint16(mainIndex)
    });
    users[user].deposits.push(deposit);
    return deposit;
  }

  function getDepositByIndex(address user, uint256 mainIndex) public view override returns (Deposit memory) {
    require(users[user].deposits[mainIndex].lockedFrom > 0, "Payload: deposit not found");
    return users[user].deposits[mainIndex];
  }

  function getDepositsLength(address user) public view override returns (uint256) {
    return users[user].deposits.length;
  }

  // can be re-executed to update parameters
  function initPool(
    uint256 minimumLockingTime_, // 3 digits -- 7 days
    uint256 maximumLockingTime_, // 3 digits -- 365 days
    uint256 earlyUnstakePenalty_ // 2 digits -- ex: 30%
  ) external override onlyOwner {
    require(sSynr.isOperatorInRole(address(this), 0x0004_0000), "SynrBridge: contract cannot receive sSYNR");
    encodedConf = minimumLockingTime_.add(maximumLockingTime_.mul(1e3)).add(earlyUnstakePenalty_.mul(1e6));
  }

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  function minimumLockingTime() public view override returns (uint256) {
    return encodedConf.mod(1e3);
  }

  function maximumLockingTime() public view override returns (uint256) {
    return encodedConf.div(1e3).mod(1e3);
  }

  function earlyUnstakePenalty() public view override returns (uint256) {
    return encodedConf.div(1e6).mod(1e2);
  }

  function _makeDeposit(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID,
    uint16 otherChain
  ) internal returns (uint256) {
    validateInput(tokenType, lockupTime, tokenAmountOrID);
    if (tokenType == 1) {
      require(
        lockupTime > minimumLockingTime() - 1 && lockupTime < maximumLockingTime() + 1,
        "SynrBridge: invalid lockupTime type"
      );
    }
    // Contract must be approved as spender.
    // It will throw if the balance is insufficient
    if (tokenType == 0) {
      // InputPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), tokenAmountOrID);
    } else if (tokenType == 1) {
      synr.safeTransferFrom(_msgSender(), address(this), tokenAmountOrID, "");
    } else {
      // SYNR Pass
      pass.safeTransferFrom(_msgSender(), address(this), tokenAmountOrID);
    }
    return fromDepositToTransferPayload(_updateUser(_msgSender(), tokenType, lockupTime, tokenAmountOrID, otherChain));
  }

  function _updateUser(
    address user,
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID,
    uint16 otherChain
  ) internal returns (Deposit memory) {
    Deposit memory deposit = _updateUserAndAddDeposit(
      user,
      tokenType,
      uint32(block.timestamp),
      tokenType == 1 ? uint32(block.timestamp.add(lockupTime * 1 days)) : 0,
      tokenAmountOrID,
      otherChain,
      users[user].deposits.length
    );
    return deposit;
  }

  function _unlockDeposit(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    if (tokenType == 1) {
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
      "SynrBridge: deposit not found"
    );
    require(deposit.tokenType > 0, "SynrBridge: sSYNR can not be unlocked");
    require(deposit.unlockedAt == 0, "SynrBridge: deposit already unlocked");
    if (tokenType == 2) {
      pass.safeTransferFrom(address(this), _msgSender(), uint256(tokenAmountOrID));
    } else {
      uint256 penalty = calculatePenaltyForEarlyUnstake(block.timestamp, deposit);
      uint256 amount = uint256(tokenAmountOrID).sub(penalty);
      synr.safeTransferFrom(address(this), user, amount, "");
      if (penalty > 0) {
        collectedPenalties += penalty;
      }
    }
    deposit.unlockedAt = uint32(block.timestamp);
    emit DepositUnlocked(user, uint16(mainIndex));
  }

  function getVestedPercentage(
    uint256 when,
    uint256 lockedFrom,
    uint256 lockedUntil
  ) public view override returns (uint256) {
    uint256 lockupTime = lockedUntil.sub(lockedFrom);
    uint256 vestedTime = when.sub(lockedFrom);
    return vestedTime.mul(100).div(lockupTime);
  }

  function calculatePenaltyForEarlyUnstake(uint256 when, Deposit memory deposit) public view override returns (uint256) {
    if (when > uint256(deposit.lockedUntil)) {
      return 0;
    }
    uint256 vestedPercentage = getVestedPercentage(when, uint256(deposit.lockedFrom), uint256(deposit.lockedUntil));
    uint256 unvestedAmount = uint256(deposit.tokenAmountOrID).mul(vestedPercentage).div(100);
    return unvestedAmount.mul(earlyUnstakePenalty()).div(100);
  }

  function transferSSynrToTreasury(uint256 amount, address to) external override onlyOwner {
    uint256 availableAmount = sSynr.balanceOf(address(this));
    require(amount <= availableAmount, "SynrBridge: sSYNR amount not available");
    if (amount == 0) {
      amount = availableAmount;
    }
    // to must be whitelisted to receive sSYNR
    sSynr.transferFrom(address(this), to, amount);
  }

  function withdrawPenalties(uint256 amount, address to) external override onlyOwner {
    require(amount <= collectedPenalties, "SynrBridge: SYNR amount not available");
    if (amount == 0) {
      amount = collectedPenalties;
    }
    synr.transferFrom(address(this), to, amount);
  }
}
