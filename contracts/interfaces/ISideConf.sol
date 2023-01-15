// SPDX-License-Identifier: MIT
pragma solidity 0.8.17;

// Author: Francesco Sullo <francesco@sullo.co>
// (c) 2022+ SuperPower Labs Inc.

import "@openzeppelin/contracts/token/ERC721/IERC721.sol";

interface ISideConf {
  struct Conf {
    uint8 status;
    uint8 coolDownDays; // cool down period for
    uint16 maximumLockupTime;
    uint32 poolInitAt; // the moment that the pool start operating, i.e., when initPool is first launched
    uint32 rewardsFactor; // initial ratio, decaying every decayInterval of a decayFactor
    uint32 decayInterval; // ex. 7 * 24 * 3600, 7 days
    uint32 lastRatioUpdateAt;
    uint32 swapFactor;
    uint32 stakeFactor;
    uint16 decayFactor; // ex. 9850 >> decays of 1.5% every 7 days
    uint16 taxPoints; // ex 250 = 2.5%
  }

  struct ExtraConf {
    uint32 sPSynrEquivalent; // 100,000
    uint32 sPBoostFactor; // 12500 > 112.5% > +12.5% of boost
    uint32 sPBoostLimit;
    uint32 bPSynrEquivalent;
    uint32 bPBoostFactor;
    uint32 bPBoostLimit;
    uint32 priceRatio;
    uint16 blueprintAmount;
    uint16 extra;
  }

  struct ExtraNftConf {
    IERC721 token;
    uint16 boostFactor; // 12500 > 112.5% > +12.5% of boost
    uint32 boostLimit;
  }
}
