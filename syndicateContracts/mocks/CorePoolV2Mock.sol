// SPDX-License-Identifier: MIT

pragma solidity 0.8.1;

import "../pools/SyndicateCorePool.sol";
import "../interfaces/IMigrator.sol";

contract CorePoolV2Mock is SyndicateCorePool, IMigrator {
  constructor(
    address _synr,
    address _ssynr,
    SyndicatePoolFactory _factory,
    address _poolToken,
    uint64 _initBlock,
    uint32 _weight
  ) SyndicateCorePool(_synr, _ssynr, _factory, _poolToken, _initBlock, _weight) {}

  function receiveDeposits(address _staker, IPool.User memory _user) external override {
    // In this example we do not consider the case where
    // the user has already staked some tokens in CorePoolV2Mock.
    IPool.User storage user = users[_staker];
    user.tokenAmount = _user.tokenAmount;
    user.totalWeight = _user.totalWeight;
    user.subYieldRewards = _user.subYieldRewards;
    user.subVaultRewards = _user.subVaultRewards;
    for (uint256 i = 0; i < _user.deposits.length; i++) {
      user.deposits.push(_user.deposits[i]);
    }
  }
}
