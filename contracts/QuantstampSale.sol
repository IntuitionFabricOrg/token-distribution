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
    uint public fundingCap;
    uint public minContribution;
    bool public fundingCapReached = false;
    bool public saleClosed = false;

    // Whitelist data
    mapping(address => bool) public registry;

    // For each user, specifies the cap (in wei) that can be contributed for each tier
    // Tiers are filled in the order 3, 2, 1, 4
    mapping(address => uint256) public cap1;        // 100% bonus
    mapping(address => uint256) public cap2;        // 40% bonus
    mapping(address => uint256) public cap3;        // 20% bonus
    mapping(address => uint256) public cap4;        // 0% bonus

    // Conversion rate by tier (QSP : ETHER)
    uint public rate1 = 10000;
    uint public rate2 = 7000;
    uint public rate3 = 6000;
    uint public rate4 = 5000;

    // Time period of sale (UNIX timestamps)
    uint public startTime;
    uint public endTime;

    // Keeps track of the amount of wei raised
    uint public amountRaised;

    // Refund amount, should it be required
    uint public refundAmount;

    // prevent certain functions from being recursively called
    bool private rentrancy_lock = false;

    // The token being sold
    QuantstampToken public tokenReward;

    // A map that tracks the amount of wei contributed by address
    mapping(address => uint256) public balanceOf;


    // Events
    event GoalReached(address _beneficiary, uint _amountRaised);
    event CapReached(address _beneficiary, uint _amountRaised);
    event FundTransfer(address _backer, uint _amount, bool _isContribution);
    event RegistrationStatusChanged(address target, bool isRegistered, uint c1, uint c2, uint c3, uint c4);


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
     * @param fundingCapInEthers            the cap (maximum) size of the fund
     * @param minimumContributionInWei      minimum contribution (in wei)
     * @param start                         the start time (UNIX timestamp)
     * @param durationInMinutes             the duration of the crowdsale in minutes
     * @param addressOfTokenUsedAsReward    address of the token being sold
     */
    function QuantstampSale(
        address ifSuccessfulSendTo,
        uint fundingCapInEthers,
        uint minimumContributionInWei,
        uint start,
        uint durationInMinutes,
        address addressOfTokenUsedAsReward
    ) {
        require(ifSuccessfulSendTo != address(0) && ifSuccessfulSendTo != address(this));
        require(addressOfTokenUsedAsReward != address(0) && addressOfTokenUsedAsReward != address(this));
        require(durationInMinutes > 0);
        beneficiary = ifSuccessfulSendTo;
        fundingCap = fundingCapInEthers * 1 ether;
        minContribution = minimumContributionInWei;
        startTime = start;
        endTime = start + durationInMinutes * 1 minutes; // TODO double check
        tokenReward = QuantstampToken(addressOfTokenUsedAsReward);
    }


    /**
     * This function is called whenever Ether is sent to the
     * smart contract. It can only be executed when the crowdsale is
     * not paused, not closed, and before the deadline has been reached.
     *
     * This function will update state variables for whether or not the
     * funding goal or cap have been reached. It also ensures that the
     * tokens are transferred to the sender, and that the correct
     * number of tokens are sent according to the current rate.
     */
    function () payable {
        require(msg.value >= minContribution);
        uint amount = msg.value;
        uint currentBalanceOfSender = balanceOf[msg.sender];

        // ensure that the user adheres to whitelist restrictions
        require(registry[msg.sender]);

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
            checkFundingCap();
        }
        else {
            revert();
        }
    }

    /**
    * Computes the amount of QSP that should be issued for the given transaction.
    * Contribution tiers are filled up in the order 3, 2, 1, 4.
    */
    function computeTokenAmount(address addr, uint balance, uint amount) internal
        returns (uint){
        uint remaining3 = 0;
        uint remaining2 = 0;
        uint remaining1 = 0;
        uint remaining4 = 0;
        uint numTokens = 0;

        if(balance <= cap3[addr]){
            remaining1 = cap3[addr].sub(balance);
            remaining2 = cap2[addr];
            remaining3 = cap1[addr];
            remaining4 = cap4[addr];
        }
        else if(balance <= cap2[addr]){
            remaining2 = cap2[addr].sub(balance);
            remaining3 = cap1[addr];
            remaining4 = cap4[addr];
        }
        else if(balance <= cap1[addr]){
            remaining3 = cap1[addr].sub(balance);
            remaining4 = cap4[addr];
        }
        else if(balance <= cap4[addr]){
            remaining4 = cap4[addr].sub(balance);
        }

        if(remaining3 > 0){
            if(amount < remaining3){
                numTokens = rate3.mul(amount);
                amount = 0;
            }
            else{
                numTokens = rate3.mul(remaining3);
                amount = amount.sub(remaining3);
            }
        }
        if(remaining2 > 0 && amount > 0){
            if(amount < remaining2){
                numTokens = rate2.mul(amount);
                amount = 0;
            }
            else{
                numTokens = rate2.mul(remaining2);
                amount = amount.sub(remaining2);
            }
        }
        if(remaining1 > 0 && amount > 0){
            if(amount < remaining1){
                numTokens = rate1.mul(amount);
                amount = 0;
            }
            else{
                numTokens = rate1.mul(remaining1);
                amount = amount.sub(remaining1);
            }
        }
        if(remaining4 > 0 && amount > 0){
            if(amount < remaining4){
                numTokens = rate4.mul(amount);
                amount = 0;
            }
            else{
                numTokens = rate4.mul(remaining4);
                amount = amount.sub(remaining4);
            }
        }

        if(amount > 0){
            // the amount sent by the user is above their total cap
            revert();
        }
        return numTokens;
    }

    /**
     * @dev Check if a contributor was at any point registered.
     *
     * @param contributor Address that will be checked.
     */
    function hasPreviouslyRegistered(address contributor)
        internal
        onlyOwner returns (bool)
    {
        // if caps for this customer exist, then the customer has previously been registered
        return (cap1[contributor].add(cap2[contributor]).add(cap3[contributor]).add(cap4[contributor])) > 0;
    }

    /*
    * If the user was already registerfd,
    */
    function validateUpdatedRegistration(address contributor, uint c1, uint c2, uint c3, uint c4)
        internal
        onlyOwner returns(bool)
    {
        uint balance = balanceOf[contributor];
        // TODO
        return true;
    }

    /**
     * @dev Sets registration status of an address for participation.
     *
     * @param contributor Address that will be registered/deregistered.
     * @param c1 The maximum amount of wei that the user can contribute in tier 1.
     * @param c2 The maximum amount of wei that the user can contribute in tier 2.
     * @param c3 The maximum amount of wei that the user can contribute in tier 3.
     * @param c4 The maximum amount of wei that the user can contribute in tier 4.
     */
    function registerUser(address contributor, uint c1, uint c2, uint c3, uint c4)
        public
        onlyOwner
        //only24HBeforeSale // TODO do we want this?
    {
        require(contributor != address(0));
        // if the user was already registered ensure that the new caps do not contradict their current contributions
        if(hasPreviouslyRegistered(contributor)){
            require(validateUpdatedRegistration(contributor, c1, c2, c3, c4));
        }
        require(c1.add(c2).add(c3).add(c4) >= minContribution);
        registry[contributor] = true;
        cap1[contributor] = c1;
        cap2[contributor] = c2;
        cap3[contributor] = c3;
        cap4[contributor] = c4;
        RegistrationStatusChanged(contributor, true, c1, c2, c3, c4);
    }

     /**
     * @dev Remove registration status of an address for participation.
     *
     * NOTE: if the user made initial contributions to the crowdsale,
     *       this will not return the previously allotted tokens.
     *
     * @param contributor Address to be unregistered.
     */
    function deactivate(address contributor)
        public
        onlyOwner
    {
        require(registry[contributor]);
        require(hasPreviouslyRegistered(contributor));
        registry[contributor] = false;
        RegistrationStatusChanged(contributor, false, cap1[contributor], cap2[contributor], cap3[contributor], cap4[contributor]);

    }

    /**
     * @dev Re-registers an already existing contributor
     *
     * @param contributor Address to be unregistered.
     */
    function reactivate(address contributor)
        public
        onlyOwner
    {
        require(hasPreviouslyRegistered(contributor));
        registry[contributor] = true;
        RegistrationStatusChanged(contributor, true, cap1[contributor], cap2[contributor], cap3[contributor], cap4[contributor]);

    }

    /**
     * @dev Sets registration statuses of addresses for participation.
     * @param contributors Addresses that will be registered/deregistered.
     * @param caps1 The maximum amount of wei that each user can contribute to cap1, in the same order as the addresses.
     * @param caps2 The maximum amount of wei that each user can contribute to cap2, in the same order as the addresses.
     * @param caps3 The maximum amount of wei that each user can contribute to cap3, in the same order as the addresses.
     * @param caps4 The maximum amount of wei that each user can contribute to cap4, in the same order as the addresses.
     */
    function registerUsers(address[] contributors,
                           uint[] caps1,
                           uint[] caps2,
                           uint[] caps3,
                           uint[] caps4)
        public
        onlyOwner
        //only24HBeforeSale // TODO do we want this?
    {
        // check that all arrays have the same length
        require(contributors.length == caps1.length);
        require(contributors.length == caps2.length);
        require(contributors.length == caps3.length);
        require(contributors.length == caps4.length);

        for (uint i = 0; i < contributors.length; i++) {
            registerUser(contributors[i], caps1[i], caps2[i], caps3[i], caps4[i]);
        }
    }

    /**
     * The owner can terminate the crowdsale at any time.
     */
    function terminate() external onlyOwner {
        saleClosed = true;
    }


    /**
     * The owner can allocate the specified amount of tokens from the
     * crowdsale allowance to the recipient addresses.
     *
     * NOTE: be extremely careful to get the amounts correct, which
     * are in units of wei and mini-QSP. Every digit counts.
     *
     * @param addrs          the recipient addresses
     * @param weiAmounts     the amounts contributed in wei
     * @param miniQspAmounts the amounts of tokens transferred in mini-QSP
     */
    function ownerAllocateTokensForList(address[] addrs, uint[] weiAmounts, uint[] miniQspAmounts)
            onlyOwner nonReentrant
    {
        require(addrs.length == weiAmounts.length);
        require(addrs.length == miniQspAmounts.length);
        for(uint i = 0; i < addrs.length; i++){
            ownerAllocateTokens(addrs[i], weiAmounts[i], miniQspAmounts[i]);
        }
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
    function ownerAllocateTokens(address _to, uint amountWei, uint amountMiniQsp)
            onlyOwner nonReentrant
    {
        if (!tokenReward.transferFrom(tokenReward.owner(), _to, amountMiniQsp)) {
            revert();
        }
        // balanceOf[_to] = balanceOf[_to].add(amountWei);
        amountRaised = amountRaised.add(amountWei);
        FundTransfer(_to, amountWei, true);
        checkFundingCap();
    }


    /**
     * The owner can call this function to withdraw the funds that
     * have been sent to this contract for the crowdsale subject to
     * the funding goal having been reached. The funds will be sent
     * to the beneficiary specified when the crowdsale was created.
     */
    function ownerSafeWithdrawal() external onlyOwner nonReentrant {
        uint balanceToSend = this.balance;
        beneficiary.transfer(balanceToSend);
        FundTransfer(beneficiary, balanceToSend, false);
    }

    /**
     * TODO: remove
     * The owner can unlock the fund with this function. The use-
     * case for this is when the owner decides after the deadline
     * to allow contributors to be refunded their contributions.
     * Note that the fund would be automatically unlocked if the
     * minimum funding goal were not reached.
     */
    /*
    function ownerUnlockFund() external afterDeadline onlyOwner {
        fundingGoalReached = false;
    }
    */

    /**
     * TODO: remove?
     * This function permits anybody to withdraw the funds they have
     * contributed if and only if the deadline has passed and the
     * funding goal was not reached.
     */
    /*
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
    */


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
