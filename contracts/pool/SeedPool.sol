// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";

import "./SidePool.sol";
import "hardhat/console.sol";

contract SeedPool is SidePool {
  using SafeMathUpgradeable for uint256;
  using AddressUpgradeable for address;
  using ECDSAUpgradeable for bytes32;

  mapping(address => bool) public bridges;
  address public operator;
  address public validator;

  modifier onlyBridge() {
    require(bridges[_msgSender()], "SeedPool: forbidden");
    _;
  }

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address seedToken_, address blueprint_) public initializer {
    __SidePool_init(seedToken_, seedToken_, blueprint_);
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

  function setBridge(address bridge_, bool active) external virtual onlyOwner {
    require(bridge_.isContract(), "SeedPool: bridge_ not a contract");
    if (active) {
      bridges[bridge_] = true;
    } else {
      delete bridges[bridge_];
    }
  }

  function setOperatorAndValidator(address operator_, address validator_) external onlyOwner {
    require(operator_ != address(0) && validator_ != address(0), "SeedPool: address zero not allowed");
    operator = operator_;
    validator = validator_;
  }

  function stake(
    uint256 tokenType,
    uint256 lockupTime,
    uint256 tokenAmountOrID
  ) external virtual override {
    // mainIndex = type(uint16).max means no meanIndex
    require(tokenType >= BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: unsupported token");
    require(users[_msgSender()].blueprintAmount < 30, "SeedPool: at most 30 blueprint can be staked");
    _stake(
      _msgSender(),
      tokenType,
      block.timestamp,
      block.timestamp.add(lockupTime * 1 days),
      type(uint16).max,
      tokenAmountOrID
    );
  }

  function unstake(uint256 depositIndex) external override {
    Deposit memory deposit = users[_msgSender()].deposits[depositIndex];
    require(
      deposit.tokenType == S_SYNR_SWAP ||
        deposit.tokenType == BLUEPRINT_STAKE_FOR_BOOST ||
        deposit.tokenType == BLUEPRINT_STAKE_FOR_SEEDS,
      "SeedPool: invalid tokenType"
    );
    _unstakeDeposit(deposit);
  }

  function stakeViaBridge(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) external onlyBridge {
    require(tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: unsupported token");
    _stake(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  function unstakeViaBridge(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) external onlyBridge {
    _unstake(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  // emergency function, if the bridge has issues

  function stakeNoBridge(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID,
    bytes memory signature
  ) external virtual {
    require(operator != address(0) && _msgSender() == operator, "MainPool: not the operator");
    require(
      isSignedByValidator(encodeForSignature(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID), signature),
      "MainPool: invalid signature"
    );
    require(tokenType < BLUEPRINT_STAKE_FOR_BOOST, "SeedPool: unsupported token");
    _stake(user, tokenType, lockedFrom, lockedUntil, mainIndex, tokenAmountOrID);
  }

  // this is called internally
  // and externally by the web3 app to test the validation
  function isSignedByValidator(bytes32 _hash, bytes memory _signature) public view returns (bool) {
    return validator != address(0) && validator == _hash.recover(_signature);
  }

  // this is called internally
  // and externally by the web3 app
  function encodeForSignature(
    address user,
    uint256 tokenType,
    uint256 lockedFrom,
    uint256 lockedUntil,
    uint256 mainIndex,
    uint256 tokenAmountOrID
  ) public view returns (bytes32) {
    return
      keccak256(
        abi.encodePacked(
          "\x19\x01", // EIP-191
          getChainId(),
          user,
          tokenType,
          lockedFrom,
          lockedUntil,
          mainIndex,
          tokenAmountOrID
        )
      );
  }

  function getChainId() public view returns (uint256) {
    uint256 id;
    assembly {
      id := chainid()
    }
    return id;
  }
}
