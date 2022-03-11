// SPDX-License-Identifier: MIT

pragma solidity 0.8.1;

import "./SyndicatePoolBase.sol";

/**
 * @title Syndicate Flash Pool
 *        Original title: Illuvium Flash Pool
 *
 * @notice Flash pools represent temporary pools like SYNR/SNX pool,
 *      flash pools allow staking for exactly 1 year period
 *
 * @notice Flash pools doesn't lock tokens, staked tokens can be unstaked  at any time
 *
 * @dev See SyndicatePoolBase for more details
 *
 */
contract SyndicateFlashPool is SyndicatePoolBase {
  /// @dev Pool expiration time, the pool considered to be disabled once end block is reached
  /// @dev Expired pools don't process any rewards, users are expected to withdraw staked tokens
  ///      from the flash pools once they expire
  uint64 public immutable endBlock;

  /// @dev Flag indicating pool type, true means "flash pool"
  // solhint-disable-next-line
  bool public constant override isFlashPool = true;

  /**
   * @dev Creates/deploys an instance of the flash pool
   *
   * @param _synr SYNR ERC20 Token SyndicateERC20 address
   * @param _ssynr sSYNR ERC20 Token  SyntheticSyndicateERC20 address
   * @param _factory Pool factory SyndicatePoolFactory instance/address
   * @param _poolToken token the pool operates on, for example SYNR or SYNR/ETH pair
   * @param _initBlock initial block used to calculate the rewards
   * @param _weight number representing a weight of the pool, actual weight fraction
   *      is calculated as that number divided by the total pools weight and doesn't exceed one
   * @param _endBlock pool expiration time (as block number)
   */
  constructor(
    address _synr,
    address _ssynr,
    SyndicatePoolFactory _factory,
    address _poolToken,
    uint64 _initBlock,
    uint32 _weight,
    uint64 _endBlock
  ) SyndicatePoolBase(_synr, _ssynr, _factory, _poolToken, _initBlock, _weight) {
    // check the inputs which are not checked by the pool base
    require(_endBlock > _initBlock, "end block must be higher than init block");

    // assign the end block
    endBlock = _endBlock;
  }

  /**
   * @notice The function to check pool state. Flash pool is considered "disabled"
   *      once time reaches its "end block"
   *
   * @return true if pool is disabled (time has reached end block), false otherwise
   */
  function isPoolDisabled() public view returns (bool) {
    // verify the pool expiration condition and return the result
    return blockNumber() >= endBlock;
  }

  /**
   * @inheritdoc SyndicatePoolBase
   *
   * @dev Overrides the _stake() in base by setting the locked until value to 1 year in the future;
   *      locked until value has only locked weight effect and doesn't do any real token locking
   *
   * @param _lockedUntil not used, overridden with now + 1 year just to have correct calculation
   *      of the locking weights
   */
  function _stake(
    address _staker,
    uint256 _amount,
    // solhint-disable-next-line
    uint64 _lockedUntil,
    bool useSSYN,
    bool isYield
  ) internal override {
    // override the `_lockedUntil` and execute parent
    // we set "locked period" to 365 days only to have correct calculation of locking weights,
    // the tokens are not really locked since _unstake in the core pool doesn't check the "locked period"
    super._stake(_staker, _amount, uint64(now256() + 365 days), useSSYN, isYield);
  }

  /**
   * @inheritdoc SyndicatePoolBase
   *
   * @dev In addition to regular sync() routine of the base, set the pool weight
   *      to zero, effectively disabling the pool in the factory
   * @dev If the pool is disabled regular sync() routine is ignored
   */
  function _sync() internal override {
    // if pool is disabled/expired
    if (isPoolDisabled()) {
      // if weight is not yet set
      if (weight != 0) {
        // set the pool weight (sets both factory and local values)
        factory.changePoolWeight(address(this), 0);
      }
      // and exit
      return;
    }

    // for enabled pools perform regular sync() routine
    super._sync();
  }
}
