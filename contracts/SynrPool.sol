// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";

import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";
import "./interfaces/IERC20.sol";
import "./token/SyndicateERC20.sol";
import "./token/SyntheticSyndicateERC20.sol";
import "./interfaces/IERC20Receiver.sol";

import "hardhat/console.sol";

contract SynrPool is Initializable, IERC20Receiver, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  struct Deposit {
    // @dev token type (SYNR or sSYNR)
    uint8 tokenType;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    uint96 tokenAmount;
    uint8 unlocked;
    // space available for 10 more bytes
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint96 synrAmount;
    // @dev Total burned sSYNR amount
    uint96 sSynrAmount;
    Deposit[] deposits;
  }

  SyndicateERC20 public synr;
  SyntheticSyndicateERC20 public sSynr;

  // this is an encode value so that in the future we can encode
  // values other than minimumLockingTime without breaking the storage
  uint256 public encodedStatus;

  // users and deposits
  mapping(address => User) public users;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address synr_, address sSynr_) public initializer {
    __WormholeTunnel_init();
    require(synr_.isContract(), "synr_ not a contract");
    require(sSynr_.isContract(), "sSynr_ not a contract");
    synr = SyndicateERC20(synr_);
    sSynr = SyntheticSyndicateERC20(sSynr_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function initPool(uint256 minimumLockingTime_) external onlyOwner {
    require(sSynr.isOperatorInRole(address(this), 0x0004_0000), "SynrPool: contract cannot receive sSYNR");
    encodedStatus = minimumLockingTime_;
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

  /**
   * @notice Serialize the input data and returns a payload
   * @dev The app calls this function to prepare the parameters
   *      needed to call the transfer.
   * @param type_ The type of token (0 > SYNR, 1 > sSYNR)
   * @param lockupTime For how long the SYNR are staked
   * @param amount Amount of tokens staked or burned (if sSYNR)
   * @return the payload, a single uint256
   */
  function getSerializedPayload(
    uint256 type_, // 1 digit
    uint256 lockupTime, // 4 digits
    uint256 amount
  ) public view returns (uint256) {
    validateInputPayload(type_, lockupTime, amount);
    return type_.add(lockupTime.mul(10)).add(amount.mul(1e5));
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, a single uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public view returns (uint256) {
    return
      uint256(deposit.tokenType).add(uint256(deposit.lockedFrom).mul(10)).add(uint256(deposit.lockedUntil).mul(1e11)).add(
        uint256(deposit.tokenAmount).mul(1e21)
      );
  }

  function minimumLockingTime() public view returns (uint256) {
    return encodedStatus % 1e5;
  }

  function validateInputPayload(
    uint256 type_,
    uint256 lockupTime,
    uint256 amount
  ) public view returns (bool) {
    require(type_ < 2, "SynrPool: invalid token type");
    require(amount < 1e28, "SynrPool: amount out of range");
    require(lockupTime < type(uint32).max, "SynrPool: lockedTime out of range");
    if (type_ == 0) {
      require(lockupTime > minimumLockingTime(), "SynrPool: invalid lockupTime type");
    }
    return true;
  }

  function deserializeInputPayload(uint256 payload) public pure returns (uint256[3] memory) {
    return [payload % 10, payload.div(10) % 1e4, payload.div(1e5)];
  }

  function _updateUser(uint256[3] memory payload) internal returns (Deposit memory) {
    if (payload[0] == 0) {
      users[_msgSender()].synrAmount += uint96(payload[2]);
    } else {
      users[_msgSender()].sSynrAmount += uint96(payload[2]);
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(payload[0]),
      lockedFrom: payload[0] == 0 ? uint32(block.timestamp) : 0,
      lockedUntil: payload[0] == 0 ? uint32(block.timestamp.add(payload[1] * 1 days)) : 0,
      tokenAmount: uint96(payload[2]),
      unlocked: 0
    });
    users[_msgSender()].deposits.push(deposit);
    return deposit;
  }

  function _makeDeposit(uint256[3] memory payloadArray) internal returns (uint256) {
    validateInputPayload(payloadArray[0], payloadArray[1], payloadArray[2]);
    // it will throw if the contract is not a token spender, or if the balance is insufficient
    if (payloadArray[0] == 0) {
      synr.safeTransferFrom(_msgSender(), address(this), payloadArray[2], "");
    } else {
      // SynrPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), payloadArray[2]);
    }
    return fromDepositToTransferPayload(_updateUser(payloadArray));
  }

  function _unlockSynr(address user, uint256 depositIndex) internal {
    Deposit storage deposit = users[user].deposits[depositIndex];
    synr.safeTransferFrom(address(this), user, deposit.tokenAmount, "");
    deposit.unlocked = 1;
  }

  function deserializePayload(uint256 payload) public pure returns (uint256[4] memory) {
    return [payload.mod(10), payload.div(10).mod(1e10), payload.div(1e11).mod(1e10), payload.div(1e21)];
  }

  function getDepositIndex(address user, uint256[4] memory payloadArray) public view returns (uint256) {
    for (uint256 i; i < users[user].deposits.length; i++) {
      Deposit storage deposit = users[user].deposits[i];
      if (
        uint256(deposit.tokenType) == payloadArray[0] &&
        uint256(deposit.lockedFrom) == payloadArray[1] &&
        uint256(deposit.lockedUntil) == payloadArray[2] &&
        uint256(deposit.lockedUntil) < block.timestamp &&
        uint256(deposit.tokenAmount) == payloadArray[3] &&
        uint256(deposit.unlocked) == 0
      ) {
        return i + 1;
      }
    }
    return 0;
  }

  function getDepositByIndex(address user, uint256 i) public view returns (Deposit memory) {
    return users[user].deposits[i];
  }

  // Stake/burn is done on chain A, SEED tokens are minted on chain B
  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    require(_msgSender() == address(uint160(uint256(recipient))), "SynrPool: only the sender can receive on other chain");
    require(minimumLockingTime() > 0, "SynrPool: contract not active");
    return
      _wormholeTransferWithValue(_makeDeposit(deserializeInputPayload(payload)), recipientChain, recipient, nonce, msg.value);
  }

  // Unstake is initiated on chain B and completed on chain A
  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
    uint256[4] memory payloadArray = deserializePayload(payload);
    require(payloadArray[0] == 0, "SynrPool: only SYNR can be unlocked");
    uint256 depositIndex = getDepositIndex(to, payloadArray);
    require(depositIndex > 0, "SeedFactory: deposit not found or already unlocked");
    _unlockSynr(to, --depositIndex);
  }
}
