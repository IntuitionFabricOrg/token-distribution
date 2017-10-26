// Quantstamp Technologies Inc. (info@quantstamp.com)

pragma solidity ^0.4.15;

import './lifecycle/Pausable.sol';
import './math/SafeMath.sol';
import './QuantstampToken.sol';

/**
 * The QuantstampSale smart contract is used for selling QuantstampToken
 * tokens (QSP). It does so by converting ETH received into a quantity of
 * tokens that are transferred to the contributor via the ERC20-compatible
 * transferFrom() function.
 */
contract QuantstampSale is Pausable {

    using SafeMath for uint256;

    // The beneficiary is the future recipient of the funds
    address public beneficiary;

    // The crowdsale has a funding goal, cap, deadline, and minimum contribution
    uint public fundingGoal;
    uint public fundingCap;
    uint public minContribution;
    bool public fundingGoalReached = false;
    bool public fundingCapReached = false;
    bool public saleClosed = false;

    // Time period of sale (UNIX timestamps)
    uint public startTime;
    uint public endTime;

    // Keeps track of the amount of wei raised
    uint public amountRaised;

    // Keeps track of the offchain amount of wei raised
    uint public offchainAmountRaised;

    // Refund amount, should it be required
    uint public refundAmount;

    // prevent certain functions from being recursively called
    bool private rentrancy_lock = false;

    // The token being sold
    QuantstampToken public tokenReward;

    // A map that tracks the amount of wei contributed by address
    mapping(address => uint256) public balanceOf;

    // A map that tracks contributions that occurred off the blockchain.
    // This is tracked during whitelist registration.
    mapping(address => uint256) public offchainBalanceOf;

    // Maps that maintain information on registered contributors
    mapping(address=>bool) public registered;
    mapping(address=>uint[]) public tierCaps;
    mapping(address=>uint[]) public tierRates;


    // Events
    event GoalReached(address _beneficiary, uint _amountRaised);
    event CapReached(address _beneficiary, uint _amountRaised);
    event FundTransfer(address _backer, uint _amount, bool _isContribution);
    event RegistrationStatusChanged(address target, bool isRegistered, uint[] capInWei, uint[] rateQspToEther);


    // Modifiers
    modifier beforeDeadline()   { require (currentTime() < endTime); _; }
    modifier afterDeadline()    { require (currentTime() >= endTime); _; }
    modifier afterStartTime()    { require (currentTime() >= startTime); _; }

    modifier saleNotClosed()    { require (!saleClosed); _; }

    modifier nonReentrant() {
        require(!rentrancy_lock);
        rentrancy_lock = true;
        _;
        rentrancy_lock = false;
    }

    /**
     * Constructor for a crowdsale of QuantstampToken tokens.
     *
     * @param ifSuccessfulSendTo            the beneficiary of the fund
     * @param fundingGoalInEthers           the minimum goal to be reached
     * @param fundingCapInEthers            the cap (maximum) size of the fund
     * @param minimumContributionInWei      minimum contribution (in wei)
     * @param start                         the start time (UNIX timestamp)
     * @param durationInMinutes             the duration of the crowdsale in minutes
     * @param addressOfTokenUsedAsReward    address of the token being sold
     */
    function QuantstampSale(
        address ifSuccessfulSendTo,
        uint fundingGoalInEthers,
        uint fundingCapInEthers,
        uint minimumContributionInWei,
        uint start,
        uint durationInMinutes,
        address addressOfTokenUsedAsReward
    ) {
        require(ifSuccessfulSendTo != address(0) && ifSuccessfulSendTo != address(this));
        require(addressOfTokenUsedAsReward != address(0) && addressOfTokenUsedAsReward != address(this));
        require(fundingGoalInEthers <= fundingCapInEthers);
        require(durationInMinutes > 0);
        beneficiary = ifSuccessfulSendTo;
        fundingGoal = fundingGoalInEthers * 1 ether;
        fundingCap = fundingCapInEthers * 1 ether;
        minContribution = minimumContributionInWei;
        startTime = start;
        endTime = start + durationInMinutes * 1 minutes; // TODO double check
        tokenReward = QuantstampToken(addressOfTokenUsedAsReward);
    }

    /**
     * This fallback function is called whenever Ether is sent to the
     * smart contract. It can only be executed when the crowdsale is
     * not paused, not closed, and before the deadline has been reached.
     *
     * This function will update state variables for whether or not the
     * funding goal or cap have been reached. It also ensures that the
     * tokens are transferred to the sender, and that the correct
     * number of tokens are sent according to the current rate.
     */
    function () payable whenNotPaused beforeDeadline afterStartTime saleNotClosed nonReentrant {
        require(msg.value >= minContribution);

        uint amount = msg.value;
        uint currentBalanceOfSender = balanceOf[msg.sender].add(offchainBalanceOf[msg.sender]);

        // ensure that the user adheres to whitelist restrictions
        require(registered[msg.sender]);

        uint numTokens = computeTokenAmount(msg.sender, currentBalanceOfSender, amount);
        assert(numTokens > 0);

        // Update the sender's balance of wei contributed and the total amount raised
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amount);
        amountRaised = amountRaised.add(amount);

        // Transfer the tokens from the crowdsale supply to the sender
        if (tokenReward.transferFrom(tokenReward.owner(), msg.sender, numTokens)) {
            FundTransfer(msg.sender, amount, true);
            // Check if the funding goal or cap have been reached
            // TODO check impact on gas cost
            checkFundingGoal();
            checkFundingCap();
        }
        else {
            revert();
        }
    }

    /**
    * Computes the amount of QSP that should be issued for the given transaction.
    * Contribution tiers are filled up in the order of their associated arrays.
    *
    * Example: Assume a user has 3 tiers with caps of [1 eth, 2 eth, 3 eth],
    *          with respective QSP rates of [4000, 5000, 6000],
    *          a currentBalance of 1.5 eth, and wants to contribute 0.75 more eth.
    *
    *          Their total contribution cap is 1 + 2 + 3 = 6 eth.
    *          Their current token balance (before this transaction) should be:
    *            4000*1 + 5000*0.5 = 6500 QSP.
    *          They will gain 5000*0.5 + 6000*0.25 = 4000 QSP from this transaction.
    *          Their new total balance will be 10500 QSP having contributed 2.25 eth.
    *          They must contribute 0.75 more eth before reaching their third tier.
    *
    */
    function computeTokenAmount(address addr, uint currentBalance, uint amount) internal
        returns (uint){
        uint[] storage rates = tierRates[addr];  // the rates associated with each tier of the user
        uint[] storage caps  = tierCaps[addr];  // the caps associated with each tier of the user
        uint remainingCapOnCurrentTier = 0;  // variable for handling partially-filled tiers
        uint numTokens = 0;  // the amount of new tokens to issue to addr
        for(uint i = 0; i < caps.length; i++){
            if(amount == 0){
                break;
            }
            if(caps[i] > currentBalance){
                remainingCapOnCurrentTier = caps[i];
                if(currentBalance > 0){
                    // if the user has already filled up part of this tier
                    // modify the current cap to only include the remaining space on this tier
                    remainingCapOnCurrentTier = remainingCapOnCurrentTier.sub(currentBalance);
                    currentBalance = 0;
                }
                if(amount >= remainingCapOnCurrentTier){
                    // add tokens for the entire remaining cap on this tier
                    numTokens = numTokens.add(remainingCapOnCurrentTier.mul(rates[i]));
                    amount = amount.sub(remainingCapOnCurrentTier);
                }
                else{
                    // add tokens for the remaining amount
                    numTokens = numTokens.add(amount.mul(rates[i]));
                    amount = 0;
                }
            }
            else{
                // update the currentBalance (local) variable to "consume" the cap
                currentBalance = currentBalance.sub(caps[i]);
            }
        }
        if(amount > 0){
            // the amount sent by the user is above their total cap
            revert();
        }
        return numTokens;
    }



    /**
     * @dev Sanity checks for registration parameters.
     *
     * @param target Address that will be registered/deregistered.
     * @param capsInWei The maximum amount of wei that the user can contribute in each tier.
     * @param ratesQspToEther The rates at which the user will QSP for Ether contributions.
     * @param initialContributionInWei The amount of wei contributed before the crowdsale.
     */
    modifier validRegistration(address target,
                               uint[] capsInWei,
                               uint[] ratesQspToEther,
                               uint initialContributionInWei) {
        require(!registered[target]);
        require(capsInWei.length == ratesQspToEther.length);
        uint totalCap = 0;
        for(uint i = 0; i < capsInWei.length; i++){
            require(capsInWei[i] > 0);
            totalCap = totalCap.add(capsInWei[i]);
            require(ratesQspToEther[i] > 0); // we know rates has the same length as caps
        }
        require(initialContributionInWei <= totalCap);
        _;
    }


    /**
     * @dev Changes registration status of an address for participation.
     *
     * NOTE: edge case: register -> deregister -> register can be problematic, don't do it for now
     *
     * @param target Address that will be registered/deregistered.
     * @param capsInWei The maximum amount of wei that the user can contribute in each tier.
     * @param ratesQspToEther The rates at which the user will QSP for Ether contributions.
     * @param initialContributionInWei The amount of wei contributed before the crowdsale.
     */
    function registerUser(address target,
                          uint[] capsInWei,
                          uint[] ratesQspToEther,
                          uint initialContributionInWei)
        public
        onlyOwner
        validRegistration(target, capsInWei, ratesQspToEther, initialContributionInWei)
        //only24HBeforeSale // TODO do we want this?
    {
        registered[target] = true;
        tierCaps[target] = capsInWei;
        tierRates[target] = ratesQspToEther;
        RegistrationStatusChanged(target, true, capsInWei, ratesQspToEther);

        if(initialContributionInWei > 0){
            offchainAmountRaised = offchainAmountRaised.add(initialContributionInWei);
            offchainBalanceOf[target] = initialContributionInWei;

            // tokenReward.balanceOf(target) should always be zero,
            // unless a user is registered with a non-zero contribution, unregistered, and re-registered
            uint numTokens = computeTokenAmount(target,
                                                tokenReward.balanceOf(target),
                                                initialContributionInWei);

            // Transfer the tokens from the crowdsale supply to the sender
            if (tokenReward.transferFrom(tokenReward.owner(), target, numTokens)) {
                // TODO: is this actually a FundTransfer?
                // FundTransfer(target, initialContributionInWei, true);
                // Check if the funding goal or cap have been reached
                checkFundingGoal();
                checkFundingCap();
            }
            else {
                revert();
            }
        }
    }

    /**
     * @dev Remove registration status of an address for participation.
     *
     * NOTE: if the user made initial contributions to the crowdsale,
     *       this cannot return the previously allotted tokens.
     *
     * @param target Address to be unregistered.
     */
    function unregisterUser(address target) public onlyOwner {
        require(registered[target]);
        registered[target] = false;
        delete tierCaps[target];
        delete tierRates[target];
        RegistrationStatusChanged(target, false, tierCaps[target], tierRates[target]);
    }

    /**
     * @dev Changes registration statuses of addresses for participation.
     * @param targets Addresses that will be registered/deregistered.
     * @param caps The maximum amount of wei that each user can contribute.
     * @param rates The rates at which each user will QSP for Ether contributions.
     * @param initialContributionsInWei The amount of wei contributed by each user before the crowdsale.
     * TODO: Is there any scenario where we'd have to unregister a user that has an initial balance?
     *       If we would need to periodically update contributions, this would need to change.

    function registerUsers(address[] targets,
                           uint[][] caps,
                           uint[][] rates,
                           uint[] initialContributionsInWei)
        public
        onlyOwner
        //only24HBeforeSale // TODO do we want this?
    {
        // check that all arrays have the same length
        require(targets.length == caps.length);
        require(caps.length == rates.length);
        require(rates.length == initialContributionsInWei.length);

        for (uint i = 0; i < targets.length; i++) {
            registerUser(targets[i], caps[i], rates[i], initialContributionsInWei[i]);
        }
    }
    */

    /**
     * The owner can terminate the crowdsale at any time.
     */
    function terminate() external onlyOwner {
        saleClosed = true;
    }

    /**
     * The owner can allocate the specified amount of tokens from the
     * crowdsale allowance to the recipient (_to).
     *
     * NOTE: be extremely careful to get the amounts correct, which
     * are in units of wei and mini-QSP. Every digit counts.
     *
     * @param _to            the recipient of the tokens
     * @param amountWei     the amount contributed in wei
     * @param amountMiniQsp the amount of tokens transferred in mini-QSP
     */
    function ownerAllocateTokens(address _to, uint amountWei, uint amountMiniQsp) external
            onlyOwner nonReentrant
    {
        if (!tokenReward.transferFrom(tokenReward.owner(), _to, amountMiniQsp)) {
            revert();
        }
        balanceOf[_to] = balanceOf[_to].add(amountWei);
        amountRaised = amountRaised.add(amountWei);
        FundTransfer(_to, amountWei, true);
        checkFundingGoal();
        checkFundingCap();
    }

    /**
     * The owner can call this function to withdraw the funds that
     * have been sent to this contract for the crowdsale subject to
     * the funding goal having been reached. The funds will be sent
     * to the beneficiary specified when the crowdsale was created.
     */
    function ownerSafeWithdrawal() external onlyOwner nonReentrant {
        require(fundingGoalReached);
        uint balanceToSend = this.balance;
        beneficiary.transfer(balanceToSend);
        FundTransfer(beneficiary, balanceToSend, false);
    }

    /**
     * The owner can unlock the fund with this function. The use-
     * case for this is when the owner decides after the deadline
     * to allow contributors to be refunded their contributions.
     * Note that the fund would be automatically unlocked if the
     * minimum funding goal were not reached.
     */
    function ownerUnlockFund() external afterDeadline onlyOwner {
        fundingGoalReached = false;
    }

    /**
     * This function permits anybody to withdraw the funds they have
     * contributed if and only if the deadline has passed and the
     * funding goal was not reached.
     */
    function safeWithdrawal() external afterDeadline nonReentrant {
        if (!fundingGoalReached) {
            uint amount = balanceOf[msg.sender];
            balanceOf[msg.sender] = 0;
            if (amount > 0) {
                msg.sender.transfer(amount);
                FundTransfer(msg.sender, amount, false);
                refundAmount = refundAmount.add(amount);
            }
        }
    }

    /**
     * Checks if the funding goal has been reached. If it has, then
     * the GoalReached event is triggered.
     */
    function checkFundingGoal() internal {
        if (!fundingGoalReached) {
            if (amountRaised >= fundingGoal) {
                fundingGoalReached = true;
                GoalReached(beneficiary, amountRaised);
            }
        }
    }

    /**
     * Checks if the funding cap has been reached. If it has, then
     * the CapReached event is triggered.
     */
    function checkFundingCap() internal {
        if (!fundingCapReached) {
            if (amountRaised >= fundingCap) {
                fundingCapReached = true;
                saleClosed = true;
                CapReached(beneficiary, amountRaised);
            }
        }
    }

    /**
     * Returns the current time.
     * Useful to abstract calls to "now" for tests.
    */
    function currentTime() constant returns (uint _currentTime) {
        return now;
    }


    /**
     * Given an amount in QSP, this method returns the equivalent amount
     * in mini-QSP.
     *
     * @param amount    an amount expressed in units of QSP
     */
    function convertToMiniQsp(uint amount) internal constant returns (uint) {
        return amount * (10 ** uint(tokenReward.decimals()));
    }



}
