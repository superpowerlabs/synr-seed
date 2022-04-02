// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./interfaces/IERC20.sol";
import "./token/SyndicateERC20.sol";
import "./token/SyntheticSyndicateERC20.sol";
import "./token/SynCityPasses.sol";
import "./interfaces/IERC20Receiver.sol";
import "./Payload.sol";

import "hardhat/console.sol";

contract SynrPool is Payload, Initializable, IERC20Receiver, IERC721ReceiverUpgradeable, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  SyndicateERC20 public synr;
  SyntheticSyndicateERC20 public sSynr;
  SynCityPasses public pass;

  uint256 public collectedPenalties;

  uint256 public encodedConf;

  // users and deposits
  mapping(address => User) public users;

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
    uint256 earlyUnstakePenalty_ // 2 digits -- 30%
  ) external onlyOwner {
    require(sSynr.isOperatorInRole(address(this), 0x0004_0000), "SynrPool: contract cannot receive sSYNR");
    encodedConf = minimumLockingTime_.add(maximumLockingTime_.mul(1e3)).add(earlyUnstakePenalty_.mul(1e6));
  }

  function version() external virtual pure returns (uint256) {
    return 1;
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

  function minimumLockingTime() public view returns (uint256) {
    return encodedConf.mod(1e3);
  }

  function maximumLockingTime() public view returns (uint256) {
    return encodedConf.div(1e3).mod(1e3);
  }

  function earlyUnstakePenalty() public view returns (uint256) {
    return encodedConf.div(1e6).mod(1e2);
  }

  function _updateUser(uint256[3] memory payload, uint16 otherChain) internal returns (Deposit memory) {
    if (payload[0] == 0) {
      users[_msgSender()].synrAmount += uint96(payload[2]);
    } else if (payload[0] == 1) {
      users[_msgSender()].sSynrAmount += uint96(payload[2]);
    } else {
      users[_msgSender()].passAmount += 1;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(payload[0]),
      lockedFrom: payload[0] == 0 ? uint32(block.timestamp) : 0,
      lockedUntil: payload[0] == 0 ? uint32(block.timestamp.add(payload[1] * 1 days)) : 0,
      tokenAmount: uint96(payload[2]),
      unlockedAt: 0,
      otherChain: otherChain
    });
    users[_msgSender()].deposits.push(deposit);
    return deposit;
  }

  function _makeDeposit(uint256[3] memory payloadArray, uint16 otherChain) internal returns (uint256) {
    validateInput(payloadArray[0], payloadArray[1], payloadArray[2]);
    if (payloadArray[0] == 0) {
      require(
        payloadArray[1] > minimumLockingTime() - 1 && payloadArray[1] < maximumLockingTime() + 1,
        "SynrPool: invalid lockupTime type"
      );
    }
    // Contract must be approved as spender.
    // It will throw if the balance is insufficient
    if (payloadArray[0] == 0) {
      synr.safeTransferFrom(_msgSender(), address(this), payloadArray[2], "");
    } else if (payloadArray[0] == 1) {
      // InputPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), payloadArray[2]);
    } else {
      // SYNR Pass
      pass.safeTransferFrom(_msgSender(), address(this), payloadArray[2]);
    }
    return fromDepositToTransferPayload(_updateUser(payloadArray, otherChain));
  }

  function _unlockDeposit(address user, uint256 depositIndex) internal {
    Deposit storage deposit = users[user].deposits[depositIndex];
    require(deposit.tokenType != 1, "SynrPool: sSYNR can not be un-staked");
    if (deposit.tokenType == 2) {
      pass.safeTransferFrom(address(this), _msgSender(), uint256(deposit.tokenAmount));
    } else {
      uint256 penalty = calculatePenaltyForEarlyUnstake(user, depositIndex);
      uint256 amount = uint256(deposit.tokenAmount).sub(penalty);
      synr.safeTransferFrom(address(this), user, amount, "");
      if (penalty > 0) {
        collectedPenalties += penalty;
      }
    }
    deposit.unlockedAt = uint32(block.timestamp);
  }

  function getDepositIndexPlus1(address user, uint256[4] memory payloadArray) public view returns (uint256) {
    for (uint256 i; i < users[user].deposits.length; i++) {
      Deposit storage deposit = users[user].deposits[i];
      if (
        uint256(deposit.tokenType) == payloadArray[0] &&
        uint256(deposit.lockedFrom) == payloadArray[1] &&
        uint256(deposit.lockedUntil) == payloadArray[2] &&
        uint256(deposit.tokenAmount) == payloadArray[3] &&
        uint256(deposit.unlockedAt) == 0
      ) {
        return i + 1;
      }
    }
    return 0;
  }

  function getDepositByIndexPlus1(address user, uint256 i) public view returns (Deposit memory) {
    return users[user].deposits[i];
  }

  // Stake/burn is done on chain A, SEED tokens are minted on chain B
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    uint256[3] memory payloadArray = deserializeInput(payload);
    if (payloadArray[0] == 0) {
      // this limitation is necessary to avoid problems during the unstake
      require(_msgSender() == address(uint160(uint256(recipient))), "SynrPool: only the sender can receive on other chain");
    }
    require(minimumLockingTime() > 0, "SynrPool: contract not active");
    return _wormholeTransferWithValue(_makeDeposit(payloadArray, recipientChain), recipientChain, recipient, nonce, msg.value);
  }

  function getVestedPercentage(uint256 lockedFrom, uint256 lockedUntil) public view returns (uint256) {
    uint256 lockupTime = lockedUntil.sub(lockedFrom);
    uint256 vestedTime = block.timestamp.sub(lockedFrom);
    return vestedTime.mul(100).div(lockupTime);
  }

  function calculatePenaltyForEarlyUnstake(address user, uint256 i) public view returns (uint256) {
    Deposit memory deposit = getDepositByIndexPlus1(user, i);
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
    uint256[4] memory payloadArray = deserializeDeposit(payload);
    require(payloadArray[0] == 0, "SynrPool: only SYNR can be unlocked");
    uint256 depositIndex = getDepositIndexPlus1(to, payloadArray);
    require(depositIndex > 0, "SynrPool: deposit not found or already unlocked");
    _unlockDeposit(to, --depositIndex);
  }

  function transferSSynrToTreasury(uint256 amount, address to) external onlyOwner {
    uint256 availableAmount = sSynr.balanceOf(address(this));
    require(amount <= availableAmount, "SynrPool: sSYNR amount not available");
    if (amount == 0) {
      amount = availableAmount;
    }
    // to must be whitelisted to receive sSYNR
    sSynr.transferFrom(address(this), to, amount);
  }

  function withdrawPenalties(uint256 amount, address to) external onlyOwner {
    require(amount <= collectedPenalties, "SynrPool: SYNR amount not available");
    if (amount == 0) {
      amount = collectedPenalties;
    }
    synr.transferFrom(address(this), to, amount);
  }
}
