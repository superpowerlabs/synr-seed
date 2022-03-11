// SPDX-License-Identifier: MIT
pragma solidity 0.8.1;

import "../token/SyndicateERC20.sol";
import "../utils/Ownable.sol";

// import "hardhat/console.sol";

contract InvestorVesting is Ownable {
  event TGETriggered(uint256 nowTimestamp, uint256 timestampTGE);

  address public synr;
  uint256 public timestampTGE;
  uint256 private _previouslyInvested;

  struct VestingSchedule {
    uint8 tge;
    uint8 firstWeek;
    uint8 secondWeek;
    uint8 thirdWeek;
    uint8 fourthWeek;
  }

  mapping(uint8 => VestingSchedule) public vestingSchedules;

  struct Investment {
    uint8 tier;
    uint120 amount;
    uint120 claimed;
  }

  mapping(address => Investment) public investments;

  constructor(address _synr) {
    synr = _synr;
    // seed
    vestingSchedules[1] = VestingSchedule({tge: 1, firstWeek: 2, secondWeek: 3, thirdWeek: 4, fourthWeek: 5});
    // strategic
    vestingSchedules[2] = VestingSchedule({tge: 1, firstWeek: 2, secondWeek: 3, thirdWeek: 5, fourthWeek: 7});
    //
    vestingSchedules[3] = VestingSchedule({tge: 2, firstWeek: 2, secondWeek: 2, thirdWeek: 2, fourthWeek: 2});
    //
    vestingSchedules[4] = VestingSchedule({tge: 2, firstWeek: 4, secondWeek: 6, thirdWeek: 9, fourthWeek: 12});
  }

  function triggerTGE(uint256 _tgeTimestamp) external onlyOwner {
    if (_tgeTimestamp == 0) {
      _tgeTimestamp = block.timestamp;
    }
    require(_tgeTimestamp >= block.timestamp, "InvestorVesting: cannot set up TGE before now");
    require(_tgeTimestamp < block.timestamp + 1 weeks, "InvestorVesting: cannot set up TGE over a week from now");
    timestampTGE = _tgeTimestamp;
    emit TGETriggered(block.timestamp, timestampTGE);
  }

  // must be called many times to address all the investors by tier
  function init(
    uint8 _tier,
    address[] memory _investors,
    uint120[] memory _amounts
  ) external onlyOwner {
    require(timestampTGE == 0, "InvestorVesting: TGE already triggered");
    require(_amounts.length == _investors.length, "InvestorVesting: lengths do not match");
    require(_tier >= 1 && _tier <= 4, "InvestorVesting: tier not found");
    uint256 totalInvestments = 0;
    for (uint256 i = 0; i < _investors.length; i++) {
      // do not require to avoid reverting
      if (investments[_investors[i]].tier == 0) {
        investments[_investors[i]] = Investment({tier: _tier, amount: _amounts[i], claimed: 0});
        totalInvestments = totalInvestments + _amounts[i];
      } // else we just skip it. It can be an error
    }
    _previouslyInvested += totalInvestments;
    require(SyndicateERC20(synr).balanceOf(address(this)) >= _previouslyInvested, "TeamVesting: not enough tokens");
  }

  function claim(address recipient, uint256 _amount) external {
    require(recipient != address(0), "InvestorVesting: recipient cannot be 0x0");
    require(investments[msg.sender].tier > 0, "InvestorVesting: not an investor");
    require(
      uint256(investments[msg.sender].amount - investments[msg.sender].claimed) >= _amount,
      "InvestorVesting: not enough granted tokens"
    );
    require(
      uint256(vestedAmount(msg.sender) - investments[msg.sender].claimed) >= _amount,
      "InvestorVesting: not enough vested tokens"
    );
    investments[msg.sender].claimed += uint120(_amount);
    SyndicateERC20(synr).transfer(recipient, _amount);
  }

  function vestedAmount(address investor) public view returns (uint120) {
    require(investments[investor].tier > 0, "InvestorVesting: not an investor");
    if (block.timestamp > timestampTGE) {
      return 0;
    }
    uint256 diff = block.timestamp - timestampTGE;
    VestingSchedule memory schedule = vestingSchedules[investments[investor].tier];
    uint120 total = uint120(schedule.fourthWeek);
    if (diff < 1 weeks) {
      return (investments[investor].amount * uint120(schedule.tge)) / total;
    } else if (diff < 2 weeks) {
      return (investments[investor].amount * uint120(schedule.firstWeek)) / total;
    } else if (diff < 3 weeks) {
      return (investments[investor].amount * uint120(schedule.secondWeek)) / total;
    } else if (diff < 4 weeks) {
      return (investments[investor].amount * uint120(schedule.thirdWeek)) / total;
    } else {
      return investments[investor].amount;
    }
  }
}
