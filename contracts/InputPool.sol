// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";
import "./interfaces/IERC20.sol";
import "./token/SyndicateERC20.sol";
import "./token/SynCityPasses.sol";
import "./token/SyntheticSyndicateERC20.sol";
import "./interfaces/IERC20Receiver.sol";

contract InputPool is Initializable, IERC20Receiver, IERC721ReceiverUpgradeable, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;

  SyndicateERC20 public synr;
  SyntheticSyndicateERC20 public sSynr;
  SynCityPasses public pass;

  struct Deposit {
    // @dev token type 0: SYNR, 1: sSYNR, 2: SYNR Pass
    uint8 tokenType;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    // If tokenType == 2, next field is the tokenId
    uint96 tokenAmount;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    uint8 unstaked;
    // space available for 10 more bytes
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint96 synrAmount;
    // @dev Total burned sSYNR amount
    uint96 sSynrAmount;
    // @dev An array of holder's deposits
    uint16 passAmount;
    // @dev An array of holder's deposits
    Deposit[] deposits;
  }

  // this is an encode value so that in the future we can encode
  // values other than minimumLockingTime without breaking the storage
  uint256 public encodedStatus;

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

  function initPool(uint256 minimumLockingTime_) external onlyOwner {
    require(sSynr.isOperatorInRole(address(this), 0x0004_0000), "InputPool: contract cannot receive sSYNR");
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
    return bytes4(keccak256("onERC20Received(address,address,uint256,bytes)"));
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

  /**
   * @notice Serialize the payload
   * @dev The app calls this function to prepare the parameters
   *      needed to call the transfer.
   * @param type_ The type of token (0 > SYNR, 1 > sSYNR)
   * @param lockupTime For how long the SYNR are staked
   * @param amount Amount of tokens staked or burned (if sSYNR)
   * @return the payload, a single uint256
   */
  function serializeInputPayload(
    uint256 type_, // uint8-like
    uint256 lockupTime, // in days, uint16-like
    uint256 amount // uint96-like
  ) public view returns (uint256) {
    validateInputPayload(type_, lockupTime, amount);
    return type_ + lockupTime * 10 + amount * 1e5;
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param type_ Token type
   * @param amount Token amount
   * @param deposit The deposit
   * @return the payload, a single uint256
   */
  function fromInputPayloadToTransferPayload(
    uint256 type_,
    uint256 amount,
    Deposit memory deposit
  ) public view returns (uint256) {
    return type_ + deposit.lockedFrom * 10 + deposit.lockedUntil * 1e11 + amount * 1e21;
  }

  function minimumLockingTime() public view returns (uint256) {
    return (encodedStatus / 1e10) % 1e10;
  }

  function validateInputPayload(
    uint256 type_,
    uint256 lockupTime,
    uint256 amount
  ) public view returns (bool) {
    require(type_ < 3, "InputPool: invalid token type");
    if (type_ == 0) {
      require(lockupTime > minimumLockingTime(), "InputPool: invalid lockupTime type");
    }
    if (type_ == 2) {
      require(amount < 889, "InputPool: Not a Mobland SYNR Pass token ID");
    } else {
      require(amount < 1e28, "InputPool: amount out of range");
    }
    require(lockupTime < type(uint32).max, "InputPool: lockedTime out of range");
    return true;
  }

  function deserializePayload(uint256 payload) public pure returns (uint256[3] memory) {
    return [payload % 10, (payload / 10) % 1e4, payload / 1e5];
  }

  function _updateUser(address user, uint256[3] memory payload) internal returns (Deposit memory) {
    if (payload[0] == 0) {
      users[user].synrAmount += uint96(payload[2]);
    } else if (payload[0] == 1) {
      users[user].sSynrAmount += uint96(payload[2]);
    } else {
      users[user].passAmount += 1;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(payload[0]),
      tokenAmount: uint96(payload[2]),
      lockedFrom: payload[0] == 0 ? uint32(block.timestamp) : 0,
      lockedUntil: payload[0] == 0 ? uint32(block.timestamp + (payload[1] * 1 days)) : 0,
      unstaked: 0
    });
    users[user].deposits.push(deposit);
    return deposit;
  }

  function _makeDeposit(uint256[3] memory payloadArray) internal returns (uint256) {
    validateInputPayload(payloadArray[0], payloadArray[1], payloadArray[2]);
    // it will throw if the contract is not a token spender, or if the balance is insufficient
    if (payloadArray[0] == 0) {
      synr.safeTransferFrom(_msgSender(), address(this), payloadArray[2], "");
    } else if (payloadArray[0] == 1) {
      // InputPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), payloadArray[2]);
    } else {
      // SYNR Pass
      pass.safeTransferFrom(_msgSender(), address(this), payloadArray[2]);
    }
    return fromInputPayloadToTransferPayload(payloadArray[0], payloadArray[2], _updateUser(_msgSender(), payloadArray));
  }

  function unstake(uint256 depositIndex) external {
    Deposit storage deposit = users[_msgSender()].deposits[depositIndex];
    require(deposit.tokenAmount > 0, "InputPool: deposit not found");
    require(deposit.unstaked == 0, "InputPool: token already unstaked");
    require(block.timestamp > deposit.lockedUntil, "InputPool: token still locked");
    if (deposit.tokenType == 0) {
      synr.safeTransferFrom(address(this), _msgSender(), deposit.tokenAmount, "");
    } else if (deposit.tokenType == 2) {
      pass.safeTransferFrom(address(this), _msgSender(), deposit.tokenAmount);
    } else {
      revert("InputPool: sSYNR cannot be unstaked");
    }
    deposit.unstaked = 1;
  }

  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    require(minimumLockingTime() > 0, "InputPool: contract not active");
    return _wormholeTransferWithValue(_makeDeposit(deserializePayload(payload)), recipientChain, recipient, nonce, msg.value);
  }

  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    // The transfer happens only from Ethereum to BSC, so,
    // this function is doing nothing
  }
}
