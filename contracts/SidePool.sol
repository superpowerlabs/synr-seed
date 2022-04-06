// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";

import "./Payload.sol";
import "./interfaces/ISidePool.sol";
import "./SidePool.sol";
import "./token/SideToken.sol";
import "./token/SynCityCouponsTestNet.sol";

import "hardhat/console.sol";

contract SidePool is Payload, ISidePool, IERC721ReceiverUpgradeable, Initializable, OwnableUpgradeable {
  using SafeMathUpgradeable for uint256;
  using AddressUpgradeable for address;

  // users and deposits
  mapping(address => User) public users;

  SideToken public poolToken;
  SynCityCouponsTestNet public blueprint;

  // solhint-disable-next-line
  function __SidePool_init(address seed_) public initializer {
    require(seed_.isContract(), "SEED not a contract");
    poolToken = SideToken(seed_);
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
    // TODO tokenAmount and weight must be calculated correctly
    // temporarily they are set to zero
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmountOrID: uint96(tokenAmountOrID),
      unlockedAt: 0,
      otherChain: otherChain,
      mainIndex: uint16(mainIndex),
      tokenAmount: 0,
      weight: 0
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

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  function _mintSeedAndSaveDeposit(
    address to,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    // this must be adjusted based on type of stake, time passed, etc.
    if (tokenType == 0) {
      // give seed to the user
      poolToken.mint(to, tokenAmountOrID.mul(1000));
    } else if (tokenType == 1) {
      poolToken.mint(to, tokenAmountOrID);
    } // else no mint, SYNR Pass boosts rewards
    _updateUser(to, tokenType, lockedFrom, lockedUntil, tokenAmountOrID, mainIndex);
  }

  function _updateUser(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 tokenAmountOrID,
    uint256 mainIndex
  ) internal returns (Deposit memory) {
    Deposit memory deposit = _updateUserAndAddDeposit(user, tokenType, lockedFrom, lockedUntil, tokenAmountOrID, 2, mainIndex);
    return deposit;
  }

  function canUnstakeWithoutTax(address user, uint256 mainIndex) external view override returns (bool) {
    Deposit memory deposit = users[user].deposits[mainIndex];
    return deposit.lockedUntil > 0 && block.timestamp > uint256(deposit.lockedUntil);
  }

  function getDepositIndexByOriginalIndex(address user, uint256 mainIndex) public view override returns (uint256) {
    for (uint256 i; i < users[user].deposits.length; i++) {
      if (uint256(users[user].deposits[i].mainIndex) == mainIndex && users[user].deposits[i].lockedFrom > 0) {
        return i;
      }
    }
    revert("Payload: deposit not found");
  }

  function _unlockDeposit(
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) internal {
    mainIndex = getDepositIndexByOriginalIndex(_msgSender(), mainIndex);
    Deposit storage deposit = users[_msgSender()].deposits[mainIndex];
    require(
      uint256(deposit.tokenType) == tokenType &&
      uint256(deposit.lockedFrom) == lockedFrom &&
      uint256(deposit.lockedUntil) == lockedUntil &&
      uint256(deposit.tokenAmountOrID) == tokenAmountOrID,
      "SeedFarm: deposit not found"
    );
    deposit.unlockedAt = uint32(block.timestamp);
  }

}
