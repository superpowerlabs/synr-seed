// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

/**
 * @dev Convenient interface of the ERC20 standard
 *      with added special functions in SYNR and sSYNR contracts
 */
interface IERC20 {
  event Transfer(address indexed from, address indexed to, uint256 value);

  event Approval(address indexed owner, address indexed spender, uint256 value);

  function totalSupply() external view returns (uint256);

  function balanceOf(address account) external view returns (uint256);

  function transfer(address recipient, uint256 amount) external returns (bool);

  function allowance(address owner, address spender) external view returns (uint256);

  function approve(address spender, uint256 amount) external returns (bool);

  function transferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);

  function safeTransferFrom(
    address sender,
    address recipient,
    uint256 amount
  ) external returns (bool);

  function isOperatorInRole(address operator, uint256 required) external returns (bool);

  // solhint-disable-next-line
  function ROLE_WHITE_LISTED_RECEIVER() external returns (uint32);
}
