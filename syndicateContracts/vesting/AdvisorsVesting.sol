// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import "../token/SyndicateERC20.sol";
import "../utils/Ownable.sol";

// import "hardhat/console.sol";

contract AdvisorsVesting is Ownable {
  event GrantTerminated(address grantee, uint256 when);

  uint256 public startTime;
  uint256 public cliff;
  address public synr;

  struct Grant {
    uint120 amount;
    uint120 claimed;
    uint256 terminatedAt;
  }

  mapping(address => Grant) public grants;
  address[] public grantees;

  modifier isGrantee(address grantee) {
    require(grants[grantee].amount > 0, "AdvisorsVesting: not a team member");
    _;
  }

  constructor(address _synr, uint256 _cliff) {
    synr = _synr;
    cliff = _cliff;
  }

  function init(address[] memory _grantees, uint120[] memory _amounts) external onlyOwner {
    require(_amounts.length == _grantees.length, "AdvisorsVesting: lengths do not match");
    uint256 totalGrants = 0;
    for (uint256 i = 0; i < _grantees.length; i++) {
      require(_grantees[i] != address(0), "AdvisorsVesting: grantee cannot be 0x0");
      grants[_grantees[i]] = Grant(_amounts[i], 0, 0);
      grantees.push(_grantees[i]);
      totalGrants += _amounts[i];
    }
    require(SyndicateERC20(synr).balanceOf(address(this)) >= totalGrants, "AdvisorsVesting: fund missing");
    startTime = block.timestamp;
  }

  function claim(address recipient, uint256 _amount) external isGrantee(msg.sender) {
    require(recipient != address(0), "AdvisorsVesting: recipient cannot be 0x0");
    require(
      uint256(grants[msg.sender].amount - grants[msg.sender].claimed) >= _amount,
      "AdvisorsVesting: not enough granted tokens"
    );
    require(
      uint256(vestedAmount(msg.sender) - grants[msg.sender].claimed) >= _amount,
      "AdvisorsVesting: not enough vested tokens"
    );
    grants[msg.sender].claimed += uint120(_amount);
    SyndicateERC20(synr).transfer(recipient, _amount);
  }

  function terminate(address grantee, uint256 when) external onlyOwner isGrantee(grantee) {
    require(when == 0 || when > block.timestamp, "AdvisorsVesting: invalid termination timestamp");
    grants[grantee].terminatedAt = when == 0 ? block.timestamp : when;
    emit GrantTerminated(grantee, when);
  }

  function vestedAmount(address grantee) public view isGrantee(grantee) returns (uint120) {
    if (startTime == 0) {
      return 0;
    }
    // diff in days
    uint256 diff = (block.timestamp - startTime) / 1 days;
    if (diff < cliff) {
      return 0;
    } else if (grants[grantee].terminatedAt != 0) {
      uint256 terminationDays = (grants[grantee].terminatedAt - startTime) / 1 days;
      if (terminationDays < diff) {
        return uint120((grants[grantee].amount * terminationDays) / cliff);
      }
    }
    return grants[grantee].amount;
  }

  function getLostRewards() external onlyOwner {
    require(block.timestamp > startTime + 670 days, "AdvisorsVesting: too early to recover lost rewards");
    uint256 amount;
    for (uint256 i = 0; i < grantees.length; i++) {
      amount += uint256(grants[msg.sender].amount - grants[msg.sender].claimed);
      grants[msg.sender].claimed = grants[msg.sender].amount;
    }
    SyndicateERC20(synr).transfer(owner(), amount);
  }
}
