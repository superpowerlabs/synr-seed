// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

interface IFarmingPool {

  function stake(uint256 lockupTime, uint256 tokenAmount) external;

  function unstake(uint256 depositIndex) external;

}
