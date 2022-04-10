// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "./SideToken.sol";

contract SeedToken is SideToken {

  constructor() SideToken("Mobland Seed Token", "SEED") {
  }

}
