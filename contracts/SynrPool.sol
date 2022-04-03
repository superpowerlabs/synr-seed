// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./interfaces/IERC20.sol";
import "./interfaces/ISynrPool.sol";
import "./token/SyndicateERC20.sol";
import "./token/SyntheticSyndicateERC20.sol";
import "./token/SynCityPasses.sol";
import "./Payload.sol";

import "hardhat/console.sol";

contract SynrPool is ISynrPool, Payload, Initializable, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  SyndicateERC20 public synr;
  SyntheticSyndicateERC20 public sSynr;
  SynCityPasses public pass;

  uint256 public collectedPenalties;

  uint256 public encodedConf;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(
    address synr_,
    address sSynr_,
    address pass_
  ) public initializer {
    __WormholeTunnel_init();
    require(synr_.isContract(), "synr_ not a contract");
    require(sSynr_.isContract(), "sSynr_ not a contract");
    require(pass_.isContract(), "pass_ not a contract");
    synr = SyndicateERC20(synr_);
    sSynr = SyntheticSyndicateERC20(sSynr_);
    pass = SynCityPasses(pass_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  // can be re-executed to update parameters
  function initPool(
    uint256 minimumLockingTime_, // 3 digits -- 7 days
    uint256 maximumLockingTime_, // 3 digits -- 365 days
    uint256 earlyUnstakePenalty_ // 2 digits -- ex: 30%
  ) external override onlyOwner {
    require(sSynr.isOperatorInRole(address(this), 0x0004_0000), "SynrPool: contract cannot receive sSYNR");
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
    uint256 tokenAmount,
    uint16 otherChain
  ) internal returns (uint256) {
    validateInput(tokenType, lockupTime, tokenAmount);
    if (tokenType == 1) {
      require(
        lockupTime > minimumLockingTime() - 1 && lockupTime < maximumLockingTime() + 1,
        "SynrPool: invalid lockupTime type"
      );
    }
    // Contract must be approved as spender.
    // It will throw if the balance is insufficient
    if (tokenType == 0) {
      // InputPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), tokenAmount);
    } else if (tokenType == 1) {
      synr.safeTransferFrom(_msgSender(), address(this), tokenAmount, "");
    } else {
      // SYNR Pass
      pass.safeTransferFrom(_msgSender(), address(this), tokenAmount);
    }
    return fromDepositToTransferPayload(_updateUser(_msgSender(), tokenType, lockupTime, tokenAmount, otherChain));
  }

  function _updateUser(
    address user,
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmount,
    uint16 otherChain
  ) internal returns (Deposit memory) {
    Deposit memory deposit = _updateUserAndAddDeposit(
      user,
      tokenType,
      uint32(block.timestamp),
      tokenType == 1 ? uint32(block.timestamp.add(lockupTime * 1 days)) : 0,
      tokenAmount,
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
    uint256 index,
    uint256 tokenAmount
  ) internal {
    Deposit storage deposit = users[user].deposits[index];
    require(
      uint256(deposit.index) == index &&
        uint256(deposit.tokenType) == tokenType &&
        uint256(deposit.lockedFrom) == lockedFrom &&
        uint256(deposit.lockedUntil) == lockedUntil &&
        uint256(deposit.tokenAmount) == tokenAmount,
      "SynrPool: deposit not found"
    );
    require(deposit.tokenType > 0, "SynrPool: sSYNR can not be unlocked");
    require(deposit.unlockedAt == 0, "SynrPool: deposit already unlocked");
    if (tokenType == 2) {
      pass.safeTransferFrom(address(this), _msgSender(), uint256(tokenAmount));
    } else {
      uint256 penalty = calculatePenaltyForEarlyUnstake(deposit);
      uint256 amount = uint256(tokenAmount).sub(penalty);
      synr.safeTransferFrom(address(this), user, amount, "");
      if (penalty > 0) {
        collectedPenalties += penalty;
      }
    }
    deposit.unlockedAt = uint32(block.timestamp);
  }

  // Stake/burn is done on chain A, SEED tokens are minted on chain B
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    (uint256 tokenType, uint256 lockupTime, uint256 tokenAmount) = deserializeInput(payload);
    if (tokenType > 0) {
      // this limitation is necessary to avoid problems during the unstake
      require(_msgSender() == address(uint160(uint256(recipient))), "SynrPool: only the sender can receive on other chain");
    }
    require(minimumLockingTime() > 0, "SynrPool: contract not active");
    payload = _makeDeposit(tokenType, lockupTime, tokenAmount, recipientChain);
    emit DepositSaved(_msgSender(), tokenType, lockupTime, tokenAmount, recipientChain);
    return
      _wormholeTransferWithValue(
        payload,
        recipientChain,
        recipient,
        nonce,
        msg.value
      );
  }

  function getVestedPercentage(uint256 lockedFrom, uint256 lockedUntil) public view override returns (uint256) {
    uint256 lockupTime = lockedUntil.sub(lockedFrom);
    uint256 vestedTime = block.timestamp.sub(lockedFrom);
    return vestedTime.mul(100).div(lockupTime);
  }

  function calculatePenaltyForEarlyUnstake(Deposit memory deposit) public view override returns (uint256) {
    if (block.timestamp > uint256(deposit.lockedUntil)) {
      return 0;
    }
    uint256 vestedPercentage = getVestedPercentage(uint256(deposit.lockedFrom), uint256(deposit.lockedUntil));
    uint256 unvestedAmount = uint256(deposit.tokenAmount).mul(vestedPercentage).div(100);
    return unvestedAmount.mul(earlyUnstakePenalty()).div(100);
  }

  // Unstake is initiated on chain B and completed on chain A
  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
    (uint256 tokenType, uint256 lockedFrom, uint256 lockedUntil, uint256 index, uint256 tokenAmount) = deserializeDeposit(
      payload
    );
    require(tokenType > 0, "SynrPool: sSYNR can't be unlocked");
    _unlockDeposit(to, tokenType, lockedFrom, lockedUntil, index, tokenAmount);
  }

  function transferSSynrToTreasury(uint256 amount, address to) external override onlyOwner {
    uint256 availableAmount = sSynr.balanceOf(address(this));
    require(amount <= availableAmount, "SynrPool: sSYNR amount not available");
    if (amount == 0) {
      amount = availableAmount;
    }
    // to must be whitelisted to receive sSYNR
    sSynr.transferFrom(address(this), to, amount);
  }

  function withdrawPenalties(uint256 amount, address to) external override onlyOwner {
    require(amount <= collectedPenalties, "SynrPool: SYNR amount not available");
    if (amount == 0) {
      amount = collectedPenalties;
    }
    synr.transferFrom(address(this), to, amount);
  }
}
