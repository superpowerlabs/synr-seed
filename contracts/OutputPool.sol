// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@ndujalabs/wormhole-tunnel/contracts/WormholeTunnelUpgradeable.sol";

import "./token/SeedToken.sol";

contract OutputPool is Initializable, WormholeTunnelUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  SeedToken public seed;

  struct Deposit {
    // @dev token type (SYNR or sSYNR)
    uint8 tokenType;
    // @dev token amount staked
    // SYNR maxTokenSupply is 10 billion * 18 decimals = 1e28
    // which is less type(uint96).max (~79e28)
    uint96 tokenAmount;
    // @dev locking period - from
    uint32 lockedFrom;
    // @dev locking period - until
    uint32 lockedUntil;
    // space available for 11 more bytes
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
      users[user].synrAmount += uint96(payload[2]);
    } else {
      users[user].sSynrAmount += uint96(payload[2]);
    }
    Deposit memory deposit = Deposit({
      tokenType: uint8(payload[0]),
      tokenAmount: uint96(payload[3]),
      lockedFrom: uint32(payload[1]),
      lockedUntil: uint32(payload[2])
    });
    users[user].deposits.push(deposit);
  }

  function _makeDeposit(address to, uint256[4] memory payloadArray) internal {
    // this must be adjusted based on type of stake, time passed, etc.
    if (payloadArray[0] == 0) {
      seed.mint(to, payloadArray[3]);
    } else {
      // InputPool must be whitelisted to receive sSYNR
      seed.mint(to, payloadArray[3]);
    }
    _updateUser(to, payloadArray);
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
    // The transfer happens only from Ethereum to BSC, so,
    // this function returns a bad sequence if called
    return 1;
  }

  function wormholeCompleteTransfer(bytes memory encodedVm) public override {
    (address to, uint256 payload) = _wormholeCompleteTransfer(encodedVm);
    _makeDeposit(to, deserializePayload(payload));
  }
}
