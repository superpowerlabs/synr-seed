// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IERC20Receiver.sol";

contract BridgingPool is Initializable, IERC20Receiver, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;

  uint256 public minimumLockingTime;

  IERC20 public synr;
  IERC20 public sSynr;

  struct Deposit {
    // @dev token type (SYNR or sSYNR)
    uint8 tokenType;
    // @dev token amount staked
    uint256 tokenAmount;
    // @dev locking period - from
    uint64 lockedFrom;
    // @dev locking period - until
    uint64 lockedUntil;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint256 synrAmount;
    // @dev Total burned sSYNR amount
    uint256 sSynrAmount;
    // @dev An array of holder's deposits
    Deposit[] deposits;
  }

  mapping(address => User) public users;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address synr_, address sSynr_) public initializer {
    __WormholeTunnel_init();
    require(synr_.isContract(), "SYNR not a contract");
    require(sSynr_.isContract(), "sSYNR not a contract");
    synr = IERC20(synr_);
    sSynr = IERC20(sSynr_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function initPool(uint256 minimumLockingTime_) external onlyOwner {
    minimumLockingTime = minimumLockingTime_;
  }

  function canReceiveSSynr() public view returns (bool) {
    return sSynr.isOperatorInRole(address(this), sSynr.ROLE_WHITE_LISTED_RECEIVER());
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

  /**
   * @notice Serialize the payload
   * @dev The app calls this function to prepare the parameters
   *      needed to call the transfer.
   * @param type_ The type of token (0 > SYNR, 1 > sSYNR)
   * @param lockupTime For how long the SYNR are staked
   * @param amount Amount of tokens staked or burned (if sSYNR)
   * @return the payload, a single uint256
   */
  function serializePayload(
    uint256 type_, // uint8-like
    uint256 lockupTime, // in days, uint16-like
    uint256 amount // uint222-like
  ) public view returns (uint256) {
    validatePayload(type_, lockupTime, amount);
    return type_ + lockupTime * 10 + amount * 1e6;
  }

  function validatePayload(
    uint256 type_,
    uint256 lockupTime,
    uint256 amount
  ) public view returns (bool) {
    require(type_ < 2, "ReceivingPool: invalid token type");
    if (type_ == 0) {
      require(lockupTime > minimumLockingTime, "ReceivingPool: invalid lockupTime type");
    }
    require(lockupTime < type(uint32).max, "ReceivingPool: lockedTime out of range");
    // 10 billions is the maxTotalSupply
    require(amount < 1e28, "ReceivingPool: amount out of range");
    return true;
  }

  function deserializePayload(uint256 payload) public pure returns (uint256[3] memory) {
    return [payload % 10, (payload / 10) % 1e5, payload / 1e6];
  }

  function _updateUser(
    address user,
    uint256 type_,
    uint256 lockupTime,
    uint256 amount
  ) internal {
    if (users[user].deposits.length > 0) {
      if (type_ == 0) {
        users[user].synrAmount += amount;
      } else {
        users[user].sSynrAmount += amount;
      }
    }
    Deposit memory deposit = Deposit({
      tokenType: type_,
      tokenAmount: amount,
      lockedFrom: uint32(block.timestamp),
      lockedUntil: block.timestamp + (lockupTime * 1 days)
    });
    users[user].deposits.push(deposit);
  }

  function wormholeTransfer(
    uint256 payload,
    uint16 recipientChain,
    bytes32 recipient,
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    uint256[3] memory payloadArray = deserializePayload(payload);
    validatePayload(payloadArray[0], payloadArray[1], payloadArray[2]);

    // it will throw if the contract is not a token spender, or if the balance is insufficient
    if (payloadArray[0] == 0) {
      synr.safeTransferFrom(_msgSender(), address(this), payloadArray[2], "");
    } else {
      // BridgingPool must be whitelisted to receive sSYNR
      sSynr.transferFrom(_msgSender(), address(this), payloadArray[2]);
    }
    _updateUser(_msgSender(), payloadArray[0], payloadArray[1], payloadArray[2]);
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    // The transfer happens only from Ethereum to BSC, so,
    // this function is doing nothing
  }

  function getChainId() public view returns (uint256) {
    uint256 id;
    assembly {
      id := chainid()
    }
    return id;
  }
}
