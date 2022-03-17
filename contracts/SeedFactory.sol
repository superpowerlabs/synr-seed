// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./token/SeedToken.sol";
import "hardhat/console.sol";

contract SeedFactory is Initializable, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  SeedToken public seed;

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
    // space available for 11 more bytes
    uint8 unlocked;
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint96 synrAmount;
    // @dev Total burned sSYNR amount
    uint96 sSynrAmount;
    Deposit[] deposits;
  }

  mapping(address => User) public users;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address seed_) public initializer {
    __WormholeTunnel_init();
    require(seed_.isContract(), "SEED not a contract");
    seed = SeedToken(seed_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function deserializePayload(uint256 payload) public pure returns (uint256[4] memory) {
    return [payload % 10, payload.div(10) % 1e10, payload.div(1e11) % 1e10, payload.div(1e21)];
  }

  function _updateUser(address user, uint256[4] memory payload) internal {
    if (payload[0] == 0) {
      users[user].synrAmount += uint96(payload[3]);
    } else {
      users[user].sSynrAmount += uint96(payload[3]);
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(payload[0]),
      lockedFrom: uint32(payload[1]),
      lockedUntil: uint32(payload[2]),
      tokenAmount: uint96(payload[3]),
      unlocked: 0
    });
    users[user].deposits.push(deposit);
  }

  function _mintSeedAndSaveDeposit(address to, uint256[4] memory payloadArray) internal {
    // this must be adjusted based on type of stake, time passed, etc.
    if (payloadArray[0] == 0) {
      seed.mint(to, payloadArray[3]);
    } else {
      // SynrPool must be whitelisted to receive sSYNR
      seed.mint(to, payloadArray[3]);
    }
    _updateUser(to, payloadArray);
  }

  function getDepositIndex(address user, uint256[4] memory payloadArray) public view returns (uint256) {
    for (uint256 i; i < users[user].deposits.length; i++) {
      if (
        uint256(users[user].deposits[i].tokenType) == payloadArray[0] &&
        uint256(users[user].deposits[i].lockedFrom) == payloadArray[1] &&
        uint256(users[user].deposits[i].lockedUntil) == payloadArray[2] &&
        uint256(users[user].deposits[i].lockedUntil) < block.timestamp &&
        uint256(users[user].deposits[i].tokenAmount) == payloadArray[3] &&
        uint256(users[user].deposits[i].unlocked) == 0
      ) {
        return i + 1;
      }
    }
    return 0;
  }

  function getDepositByIndex(address user, uint256 i) public view returns (Deposit memory) {
    return users[user].deposits[i];
  }

  function _unlockDeposit(uint256[4] memory payloadArray) internal {
    uint256 depositIndex = getDepositIndex(_msgSender(), payloadArray);
    require(depositIndex > 0, "SeedFactory: deposit not found or already unlocked");
    users[_msgSender()].deposits[depositIndex.sub(1)].unlocked = 1;
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

  function wormholeTransfer(
    // solhint-disable-next-line
    uint256 payload,
    // solhint-disable-next-line
    uint16 recipientChain,
    // solhint-disable-next-line
    bytes32 recipient,
    // solhint-disable-next-line
    uint32 nonce
  ) public payable override whenNotPaused returns (uint64 sequence) {
    require(_msgSender() == address(uint160(uint(recipient))), "SeedFactory: only the sender can receive on other chain");
    uint256[4] memory payloadArray = deserializePayload(payload);
    _unlockDeposit(payloadArray);
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
    _mintSeedAndSaveDeposit(to, deserializePayload(payload));
  }
}
