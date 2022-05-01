// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract SideToken is ERC20, ERC20Burnable, AccessControl {
  bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

  bool public allowancePaused = true;

  constructor(string memory name, string memory symbol) ERC20(name, symbol) {
    _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
  }

  /**
   * @param to address to mint the token.
   * @param amount amount to be minted.
   */
  function mint(address to, uint256 amount) public onlyRole(MINTER_ROLE) {
    _mint(to, amount);
  }

  function unpauseAllowance() external onlyRole(DEFAULT_ADMIN_ROLE) {
    // after un-pausing the allowance it cannot be paused again
    allowancePaused = false;
  }

  function allowance(address owner, address spender) public view override returns (uint256) {
    if (allowancePaused) {
      return 0;
    }
    return super.allowance(owner, spender);
  }
}
