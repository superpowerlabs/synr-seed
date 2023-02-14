// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

contract Constants {
  uint8 public constant S_SYNR_SWAP = 1;
  uint8 public constant SYNR_STAKE = 2;
  uint8 public constant SYNR_PASS_STAKE_FOR_BOOST = 3;
  uint8 public constant SYNR_PASS_STAKE_FOR_SEEDS = 4;
  uint8 public constant BLUEPRINT_STAKE_FOR_BOOST = 5;
  uint8 public constant BLUEPRINT_STAKE_FOR_SEEDS = 6;

  uint256[50] private __gap;
}
