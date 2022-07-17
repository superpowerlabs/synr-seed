// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "./SideToken.sol";

contract WeedToken is SideToken, UUPSUpgradeable {
  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize() public initializer {
    __SideToken_init("Mobland Weed Token", "WEED");
  }

  function _authorizeUpgrade(address newImplementation) internal virtual override onlyOwner {
    emit ImplementationUpgraded(newImplementation);
  }
}
