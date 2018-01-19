// Artificial Intuition Limited

pragma solidity ^0.4.15;

import '../IntuitionSale.sol';

/**
 * The IntuitionSale smart contract is used for selling IntuitionToken
 * tokens (QSP). It does so by converting ETH received into a quantity of
 * tokens that are transferred to the contributor via the ERC20-compatible
 * transferFrom() function.
 */
contract IntuitionSaleMock is IntuitionSale {

    uint public _now;

    function IntuitionSaleMock(
        address ifSuccessfulSendTo,
        uint fundingGoalInEthers,
        uint fundingCapInEthers,
        uint minimumContributionInWei,
        uint start,
        uint durationInMinutes,
        uint rateQspToEther,
        address addressOfTokenUsedAsReward
    ) IntuitionSale(ifSuccessfulSendTo, fundingGoalInEthers, fundingCapInEthers,
                     minimumContributionInWei, start, durationInMinutes, rateQspToEther,
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
