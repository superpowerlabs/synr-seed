// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";

contract SeedToken is Initializable, ERC20Upgradeable, ERC20BurnableUpgradeable, OwnableUpgradeable, UUPSUpgradeable {
  using AddressUpgradeable for address;
  address public manager;

  /// @custom:oz-upgrades-unsafe-allow constructor
  constructor() initializer {}

  function initialize(address manager_) public initializer {
    __ERC20_init("Mobland Seed Token", "SEED");
    __ERC20Burnable_init();
    __Ownable_init();
    __UUPSUpgradeable_init();
    require(manager_.isContract(), "manager not a contract");
    manager = manager_;
  }

  function mint(address to, uint256 amount) public {
    require(owner() == _msgSender() || manager == _msgSender(), "Caller not authorized");
    _mint(to, amount);
  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}
}
