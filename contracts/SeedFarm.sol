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

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address seed_) public initializer {
    __WormholeTunnel_init();
    require(seed_.isContract(), "SEED not a contract");
    seed = SideToken(seed_);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  function _mintSeedAndSaveDeposit(
    address to,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 index,
    uint256 tokenAmount
  ) internal {
    // this must be adjusted based on type of stake, time passed, etc.
    if (tokenType == 0) {
      // give seed to the user
      seed.mint(to, tokenAmount.mul(1000));
    } else if (tokenType == 1) {
      seed.mint(to, tokenAmount);
    } // else no mint, SYNR Pass boosts rewards
    _updateUser(to, tokenType, lockedFrom, lockedUntil, tokenAmount, index);
  }

  function _updateUser(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 tokenAmount,
    uint256 index
  ) internal returns (Deposit memory) {
    Deposit memory deposit = _updateUserAndAddDeposit(user, tokenType, lockedFrom, lockedUntil, tokenAmount, 2, index);
    return deposit;
  }

  function canUnstakeWithoutTax(address user, uint256 index) external view returns (bool) {
    Deposit memory deposit = users[user].deposits[index];
    return deposit.lockedUntil > 0 && block.timestamp > uint256(deposit.lockedUntil);
  }

  function _unlockDeposit(
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 index,
    uint256 tokenAmount
  ) internal {
    index = getDepositIndexByOriginalIndex(_msgSender(), index);
    Deposit storage deposit = users[_msgSender()].deposits[index];
    require(
      uint256(deposit.tokenType) == tokenType &&
        uint256(deposit.lockedFrom) == lockedFrom &&
        uint256(deposit.lockedUntil) == lockedUntil &&
        uint256(deposit.tokenAmount) == tokenAmount,
      "SeedFarm: deposit not found"
    );
    deposit.unlockedAt = uint32(block.timestamp);
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
    (uint256 tokenType, uint256 lockedFrom, uint256 lockedUntil, uint256 index, uint256 tokenAmount) = deserializeDeposit(
      payload
    );
    _unlockDeposit(tokenType, lockedFrom, lockedUntil, index, tokenAmount);
    return _wormholeTransferWithValue(payload, recipientChain, recipient, nonce, msg.value);
  }

  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _onWormholeCompleteTransfer(to, payload);
  }

  function _onWormholeCompleteTransfer(address to, uint256 payload) internal {
    (uint256 tokenType, uint256 lockedFrom, uint256 lockedUntil, uint256 index, uint256 tokenAmount) = deserializeDeposit(
      payload
    );
    _mintSeedAndSaveDeposit(to, tokenType, lockedFrom, lockedUntil, index, tokenAmount);
  }
}
