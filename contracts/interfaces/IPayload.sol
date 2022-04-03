// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IPayload {
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

  function version() external pure returns (uint256);

  // can be called by web2 app for consistency
  function serializeInput(
    uint256 tokenType, // 1 digit
    uint256 lockupTime, // 4 digits
    uint256 tokenAmount
  ) external pure returns (uint256);

  function validateInput(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmount
  ) external pure returns (bool);

  function deserializeInput(uint256 payload)
    external
    pure
    returns (
      uint256 tokenType,
      uint256 lockupTime,
      uint256 tokenAmount
    );

  function deserializeDeposit(uint256 payload)
    external
    pure
    returns (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 index,
      uint256 tokenAmount
    );

  /**
   * @notice Converts the input payload to the transfer payload
   * @param deposit The deposit
   * @return the payload, an encoded uint256
   */
  function fromDepositToTransferPayload(Deposit memory deposit) external pure returns (uint256);

  function getIndexFromPayload(uint256 payload) external pure returns (uint);

  function getDepositByIndex(address user, uint256 index) external view returns (Deposit memory);

  function getDepositsLength(address user) external view returns (uint256);
}
