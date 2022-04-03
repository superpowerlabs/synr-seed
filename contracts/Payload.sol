// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";

import "./interfaces/IERC20Receiver.sol";

import "hardhat/console.sol";

contract Payload is IERC20Receiver, IERC721ReceiverUpgradeable {
  using SafeMathUpgradeable for uint256;

  struct Deposit {
    // @dev token type (0: sSYNR, 1: SYNR, 2: SYNR Pass)
    uint8 tokenType;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    uint96 tokenAmount;
    uint32 unlockedAt;
    uint16 otherChain;
    // since the process is asyncronous, the same deposit can be at a different index
    // on the main net and on the sidechain.
    uint16 index;
    // more space available
  }

  /// @dev Data structure representing token holder using a pool
  struct User {
    // @dev Total staked SYNR amount
    uint96 synrAmount;
    // @dev Total burned sSYNR amount
    uint96 sSynrAmount;
    // @dev Total passes staked
    uint16 passAmount;
    Deposit[] deposits;
  }

  // users and deposits
  mapping(address => User) public users;

  function version() external pure virtual returns (uint256) {
    return 1;
  }

  // can be called by web2 app for consistency
  function serializeInput(
    uint256 tokenType, // 1 digit
    uint256 lockupTime, // 4 digits
    uint256 tokenAmount
  ) public pure returns (uint256) {
    validateInput(tokenType, lockupTime, tokenAmount);
    return tokenType.add(lockupTime.mul(10)).add(tokenAmount.mul(1e5));
  }

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmount
  ) public pure returns (bool) {
    require(tokenType < 3, "Payload: invalid token type");
    if (tokenType == 2) {
      require(tokenAmount < 889, "Payload: Not a Mobland SYNR Pass token ID");
    } else {
      require(tokenAmount < 1e28, "Payload: tokenAmount out of range");
    }
    require(lockupTime < 1e4, "Payload: lockedTime out of range");
    return true;
  }

  function deserializeInput(uint256 payload)
    public
    pure
    returns (
      uint256 tokenType,
      uint256 lockupTime,
      uint256 tokenAmount
    )
  {
    tokenType = payload.mod(10);
    lockupTime = payload.div(10).mod(1e4);
    tokenAmount = payload.div(1e5);
  }

  function deserializeDeposit(uint256 payload)
    public
    pure
    returns (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 index,
      uint256 tokenAmount
    )
  {
    tokenType = payload.mod(10);
    lockedFrom = payload.div(10).mod(1e10);
    lockedUntil = payload.div(1e11).mod(1e10);
    index = payload.div(1e21).mod(1e5);
    tokenAmount = payload.div(1e26);
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public pure returns (uint256) {
    require(deposit.tokenType < 3, "Payload: invalid token type");
    require(deposit.lockedFrom < deposit.lockedUntil, "Payload: invalid interval");
    require(deposit.lockedUntil < 1e10, "Payload: lockedTime out of range");
    require(deposit.tokenAmount < 1e28, "Payload: tokenAmount out of range");
    return
      uint256(deposit.tokenType)
        .add(uint256(deposit.lockedFrom).mul(10))
        .add(uint256(deposit.lockedUntil).mul(1e11))
        .add(uint256(deposit.index).mul(1e21))
        .add(uint256(deposit.tokenAmount).mul(1e26));
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
    uint256 tokenAmount,
    uint16 otherChain,
    uint256 index
  ) internal returns (Deposit memory) {
    if (tokenType == 0) {
      users[user].sSynrAmount += uint96(tokenAmount);
    } else if (tokenType == 1) {
      users[user].synrAmount += uint96(tokenAmount);
    } else {
      users[user].passAmount += 1;
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(tokenType),
      lockedFrom: uint32(lockedFrom),
      lockedUntil: uint32(lockedUntil),
      tokenAmount: uint96(tokenAmount),
      unlockedAt: 0,
      otherChain: otherChain,
      index: uint16(index)
    });
    users[user].deposits.push(deposit);
    return deposit;
  }

  function getDepositByIndex(address user, uint256 index) public view returns (Deposit memory) {
    require(users[user].deposits[index].lockedFrom > 0, "Payload: deposit not found");
    return users[user].deposits[index];
  }

  function getDepositsLength(address user) public view returns (uint256) {
    return users[user].deposits.length;
  }
}
