// SPDX-License-Identifier: MIT
pragma solidity 0.8.11;

// Author: Francesco Sullo <francesco@superpower.io>
// Superpower Labs / Syn City

interface ISynCityCoupons {
  function safeTransferFrom(
    address to,
    address receiver,
    uint256 tokenId
  ) external;
}
