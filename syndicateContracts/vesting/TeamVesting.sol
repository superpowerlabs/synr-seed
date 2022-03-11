// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import "../token/SyndicateERC20.sol";
import "../utils/Ownable.sol";

// import "hardhat/console.sol";

contract TeamVesting is Ownable {
  uint256 public startTime;
  uint256 public cliff;
  address public synr;

  struct Grant {
    uint120 amount;
    uint120 claimed;
  }

  mapping(address => Grant) public grants;
  address[] public grantees;

  modifier isGrantee(address grantee) {
    require(grants[grantee].amount > 0, "TeamVesting: not a team member");
    _;
  }

  constructor(address _synr, uint256 _cliff) {
    synr = _synr;
    require(_cliff <= 365 + 31, "TeamVesting: cliff too long");
    cliff = _cliff;
  }

  function init(address[] memory _grantees, uint120[] memory _amounts) external onlyOwner {
    require(_amounts.length == _grantees.length, "TeamVesting: lengths do not match");
    uint256 totalGrants = 0;
    for (uint256 i = 0; i < _grantees.length; i++) {
      require(_grantees[i] != address(0), "TeamVesting: grantee cannot be 0x0");
      grants[_grantees[i]] = Grant(_amounts[i], 0);
      grantees.push(_grantees[i]);
      totalGrants += _amounts[i];
    }
    require(SyndicateERC20(synr).balanceOf(address(this)) >= totalGrants, "TeamVesting: fund missing");
    startTime = block.timestamp;
  }

  function updateVestingDays(uint256 _newCliff) external onlyOwner {
    require(_newCliff < cliff, "TeamVesting: Can only accelerate");
    cliff = _newCliff;
  }

  function claim(address recipient, uint256 _amount) external isGrantee(msg.sender) {
    require(recipient != address(0), "TeamVesting: recipient cannot be 0x0");
    require(
      uint256(grants[msg.sender].amount - grants[msg.sender].claimed) >= _amount,
      "TeamVesting: not enough granted tokens"
    );
    require(uint256(vestedAmount(msg.sender) - grants[msg.sender].claimed) >= _amount, "TeamVesting: not enough vested tokens");
    grants[msg.sender].claimed += uint120(_amount);
    SyndicateERC20(synr).transfer(recipient, _amount);
  }

  function vestedAmount(address grantee) public view isGrantee(grantee) returns (uint120) {
    uint120 res = 0;
    if (startTime == 0) {
      return res;
    }
    // diff in days
    uint256 diff = (block.timestamp - startTime) / 1 days;
    if (diff < cliff) {
      return 0;
    } else {
      return grants[grantee].amount;
    }
  }

  function getLostRewards() external onlyOwner {
    require(block.timestamp > startTime + 670 days, "TeamVesting: too early to recover lost rewards");
    uint256 amount;
    for (uint256 i = 0; i < grantees.length; i++) {
      amount += uint256(grants[msg.sender].amount - grants[msg.sender].claimed);
      grants[msg.sender].claimed = grants[msg.sender].amount;
    }
    SyndicateERC20(synr).transfer(owner(), amount);
  }
}
