// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/IERC721ReceiverUpgradeable.sol";

import "./interfaces/IERC20Receiver.sol";
import "./interfaces/IPayload.sol";

import "hardhat/console.sol";

contract Payload is IPayload, IERC20Receiver, IERC721ReceiverUpgradeable {
  using SafeMathUpgradeable for uint256;

  // users and deposits
  mapping(address => User) public users;

  function version() external pure virtual override returns (uint256) {
    return 1;
  }

  // can be called by web2 app for consistency
  function serializeInput(
    uint256 tokenType, // 1 digit
    uint256 lockupTime, // 4 digits
    uint256 tokenAmount
  ) public pure override returns (uint256) {
    validateInput(tokenType, lockupTime, tokenAmount);
    return tokenType.add(lockupTime.mul(10)).add(tokenAmount.mul(1e5));
  }

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmount
  ) public pure override returns (bool) {
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
    override
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
    override
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
    index = getIndexFromPayload(payload);
    tokenAmount = payload.div(1e26);
  }

  function getIndexFromPayload(uint256 payload) public pure override returns (uint) {
    return payload.div(1e21).mod(1e5);
  }

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) public pure override returns (uint256) {
    require(deposit.tokenType < 3, "Payload: invalid token type");
    require(deposit.lockedFrom < deposit.lockedUntil, "Payload: invalid interval");
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

  function getDepositByIndex(address user, uint256 index) public view override returns (Deposit memory) {
    require(users[user].deposits[index].lockedFrom > 0, "Payload: deposit not found");
    return users[user].deposits[index];
  }

  function getDepositsLength(address user) public view override returns (uint256) {
    return users[user].deposits.length;
  }
}
