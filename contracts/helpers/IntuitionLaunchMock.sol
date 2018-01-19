// Artificial Intuition Limited

pragma solidity ^0.4.15;

import '../IntuitionLaunch.sol';

/**
 * The IntuitionLaunch smart contract is used for selling Intuition
 * tokens (AIG). It does so by converting ETH received into a quantity of
 * tokens that are transferred to the contributor via the ERC20-compatible
 * transferFrom() function.
 */
contract IntuitionLaunchMock is IntuitionLaunch {

    uint public _now;

    function IntuitionLaunchMock(
        address ifSuccessfulSendTo,
        uint fundingGoalInEthers,
        uint fundingCapInEthers,
        uint minimumContributionInWei,
        uint start,
        uint durationInMinutes,
        uint rateToEther,
        address addressOfTokenUsedAsReward
    ) IntuitionLaunch(ifSuccessfulSendTo, fundingGoalInEthers, fundingCapInEthers,
                     minimumContributionInWei, start, durationInMinutes, rateToEther,
                     addressOfTokenUsedAsReward){ 
        _now = start + 1;
    }

    function currentTime() constant returns (uint) {
        return _now;
    }

    event HitLine(uint key, uint val);
    function changeTime(uint _newTime) onlyOwner external {
        HitLine(123, _newTime);
        _now = _newTime;
    }
}
