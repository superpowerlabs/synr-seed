// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import "./interfaces/IWormholeBridge.sol";
import "./interfaces/IWormholeBridgeV2.sol";
import "./interfaces/ITesseract.sol";
import "./utils/Versionable.sol";

//import "hardhat/console.sol";

contract Tesseract is ITesseract, Versionable, Initializable, OwnableUpgradeable, UUPSUpgradeable {
  using AddressUpgradeable for address;
  using SafeMathUpgradeable for uint256;

  mapping(uint16 => address) public bridges;

  // bridges[1] is WormholeBridge
  // bridges[2] is WormholeBridgeV2

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  // solhint-disable-next-line
  function initialize() public initializer {
    __Ownable_init();
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {}

  function setBridge(uint16 bridgeType, address bridge_) external override onlyOwner {
    require(bridge_.isContract(), "Tesseract: bridge_ not a contract");
    bridges[bridgeType] = bridge_;
    emit BridgeSet(bridgeType, bridge_);
  }

  function supportedBridgeById(uint256 id) external view virtual override returns (string memory) {
    if (id == 1) {
      return "Wormhole";
    } else if (id == 2) {
      return "WormholeV2";
    } else {
      revert("Tesseract: unsupported bridge");
    }
  }

  function crossChainTransfer(
    uint8 bridgeType,
    uint256 payload,
    uint16 recipientChain,
    uint32 nonce,
    address otherContractAddress
  ) external payable virtual override returns (uint64 sequence) {
    if (bridgeType == 1) {
      return
        IWormholeBridge(bridges[1]).wormholeTransfer(payload, recipientChain, bytes32(uint256(uint160(_msgSender()))), nonce);
    } else if (bridgeType == 2) {
      IWormholeBridgeV2(bridges[2]).wormholeTransfer(
        payload,
        recipientChain,
        bytes32(uint256(uint160(_msgSender()))),
        otherContractAddress
      );
    } else {
      revert("Tesseract: unsupported bridge");
    }
  }

  function getQuoteCrossChain(uint16 targetChain) public virtual returns (uint256 cost) {
    IWormholeBridgeV2(bridges[2]).quoteCrossChainGreeting(targetChain);
  }

  function completeCrossChainTransfer(uint16 bridgeType, bytes memory encodedVm) external override {
    if (bridgeType == 1) {
      IWormholeBridge(bridges[1]).wormholeCompleteTransfer(encodedVm);
    } else {
      revert("Tesseract: unsupported bridge");
    }
  }

  function withdrawProceeds(address payable to) public onlyOwner {
    to.transfer(address(this).balance);
  }
}
