// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./Payload.sol";
import "./token/SideToken.sol";
import "hardhat/console.sol";

contract SeedFarm is Payload, Initializable, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  SideToken public seed;

  mapping(address => User) public users;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address seed_) public initializer {
    __WormholeTunnel_init();
    require(seed_.isContract(), "SEED not a contract");
    seed = SideToken(seed_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function version() external pure returns (uint) {
    return 1;
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
      otherChain: 2, // they can come only from Ethereum Mainnet. On testnet we are fine
      unlockedAt: 0
    });
    users[user].deposits.push(deposit);
  }

  function _mintSeedAndSaveDeposit(address to, uint256[4] memory payloadArray) internal {
    // this must be adjusted based on type of stake, time passed, etc.
    if (payloadArray[0] == 0) {
      seed.mint(to, payloadArray[3]);
    } else {
      // give seed to the user
      seed.mint(to, payloadArray[3].mul(1000));
    }
    _updateUser(to, payloadArray);
  }

  function getDepositIndexPlus1(address user, uint256[4] memory payloadArray) public view returns (uint256) {
    for (uint256 i; i < users[user].deposits.length; i++) {
      if (
        uint256(users[user].deposits[i].tokenType) == payloadArray[0] &&
        uint256(users[user].deposits[i].lockedFrom) == payloadArray[1] &&
        uint256(users[user].deposits[i].lockedUntil) == payloadArray[2] &&
        uint256(users[user].deposits[i].tokenAmount) == payloadArray[3] &&
        uint256(users[user].deposits[i].unlockedAt) == 0
      ) {
        return i + 1;
      }
    }
    return 0;
  }

  function getDepositByIndexPlus1(address user, uint256 i) public view returns (Deposit memory) {
    return users[user].deposits[i];
  }

  function canUnstakeWithoutTax(address user, uint256 i) external view returns (bool) {
    return users[user].deposits[i].lockedUntil > 0 && block.timestamp > uint256(users[user].deposits[i].lockedUntil);
  }

  function _unlockDeposit(uint256[4] memory payloadArray) internal {
    uint256 depositIndex = getDepositIndexPlus1(_msgSender(), payloadArray);
    require(depositIndex > 0, "SeedFarm: deposit not found or already unlocked");
    users[_msgSender()].deposits[depositIndex.sub(1)].unlockedAt = uint32(block.timestamp);
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
    // this limitation is necessary to avoid problems during the unstake
    require(_msgSender() == address(uint160(uint256(recipient))), "SeedFarm: only the sender can receive on other chain");
    uint256[4] memory payloadArray = deserializeDeposit(payload);
    _unlockDeposit(payloadArray);
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
    _mintSeedAndSaveDeposit(to, deserializeDeposit(payload));
  }
}
