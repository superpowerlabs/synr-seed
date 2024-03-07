// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Authors: Francesco Sullo <francesco@sullo.co>

import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/cryptography/ECDSAUpgradeable.sol";
import "wormhole-solidity-sdk/interfaces/IWormholeRelayer.sol";
import "wormhole-solidity-sdk/interfaces/IWormholeReceiver.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

import "../Tesseract.sol";

contract WormholeBridgeV2 is IWormholeReceiver, Initializable, OwnableUpgradeable, PausableUpgradeable, UUPSUpgradeable {
  using AddressUpgradeable for address;
  using ECDSAUpgradeable for bytes32;
  using SafeMathUpgradeable for uint256;

  event ImplementationUpgraded(address newImplementation);

  Tesseract public tesseract;
  address public pool;
  address public validator;
  IWormholeRelayer public wormholeRelayer;

  modifier onlyTesseract() {
    require(address(tesseract) == _msgSender(), "MainWormholeBridge: Forbidden");
    _;
  }

  // solhint-disable-next-line
  function __WormholeBridge_init(
    address tesseract_,
    address pool_,
    address wormholeRelayer_
  ) public virtual initializer {
    require(tesseract_.isContract(), "WormholeBridge: tesseract_ not a contract");
    require(pool_.isContract(), "WormholeBridge: pool_ not a contract");
    tesseract = Tesseract(tesseract_);
    pool = pool_;
    wormholeRelayer = IWormholeRelayer(wormholeRelayer_);
  }

  function setValidator(address validator_) external onlyOwner {
    require(validator_ != address(0), "MainPool: address zero not allowed");
    validator = validator_;
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

  function updatePool(address pool_) external onlyOwner {
    require(pool_.isContract(), "WormholeBridge: pool_ not a contract");
    pool = pool_;
  }

  // must be overwritten
  function wormholeTransfer(
    uint256,
    uint16,
    bytes32,
    uint32
  ) public payable virtual returns (uint64 sequence) {}

  // must be overwritten
  function receiveWormholeMessages(
    bytes memory payload,
    bytes[] memory additionalVaas,
    bytes32 sourceAddress,
    uint16 sourceChain,
    bytes32 deliveryHash
  ) external payable virtual {}

  // this is called internally
  // and externally by the web3 app to test the validation
  function isSignedByValidator(bytes32 _hash, bytes memory _signature) public view returns (bool) {
    return validator != address(0) && validator == _hash.recover(_signature);
  }

  // this is called internally
  // and externally by the web3 app
  function encodeForSignature(
    address to,
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
          block.chainid,
          to,
          tokenType,
          lockedFrom,
          lockedUntil,
          mainIndex,
          tokenAmountOrID
        )
      );
  }

  function withdrawProceeds(address payable to) public onlyOwner {
    to.transfer(address(this).balance);
  }

  function deserializeDeposit(uint256 payload)
    public
    pure
    returns (
      uint256 tokenType,
      uint256 lockedFrom,
      uint256 lockedUntil,
      uint256 mainIndex,
      uint256 tokenAmountOrID
    )
  {
    tokenType = payload.mod(100);
    lockedFrom = payload.div(100).mod(1e10);
    lockedUntil = payload.div(1e12).mod(1e10);
    mainIndex = payload.div(1e22).mod(1e5);
    tokenAmountOrID = payload.div(1e27);
  }
}
