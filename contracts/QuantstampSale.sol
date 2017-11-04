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

    // For each user, specifies the cap (in wei) that can be contributed
    mapping(address => uint256) public cap;

    // For each user, specifies the conversion rate (QSP : ETHER)
    mapping(address => uint256) public rate;

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
    event RegistrationStatusChanged(address target, bool isRegistered, uint newCap, uint newRate);


    // Modifiers
    modifier beforeDeadline()   { require (currentTime() < endTime); _; }
    // modifier afterDeadline()    { require (currentTime() >= endTime); _; } no longer used without fundingGoal
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
    function () payable whenNotPaused beforeDeadline afterStartTime saleNotClosed nonReentrant{
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

        // Check if the funding cap have been reached
        checkFundingCap();
        
        // Transfer the tokens from the crowdsale supply to the sender
        if (tokenReward.transferFrom(tokenReward.owner(), msg.sender, numTokens)) {
            FundTransfer(msg.sender, amount, true);
        }
        else {
            revert();
        }
    }

    /**
    * Computes the amount of QSP that should be issued for the given transaction.
    */
    function computeTokenAmount(address addr, uint balance, uint amount) internal returns (uint) {
        if((balance.add(amount)) > cap[addr]) {
            // the amount sent by the user is above their total cap
            revert();
        }
        return rate[addr].mul(amount);
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
        // if cap for this customer exist, then the customer has previously been registered
        return cap[contributor] > 0;
    }

    /**
     * @dev Sets registration status of an address for participation.
     *
     * @param contributor Address that will be registered/deregistered.
     * @param newCap The maximum amount of wei that the user can contribute.
     */
    function registerUser(address contributor, uint newCap, uint newRate)
        public
        onlyOwner
        //only24HBeforeSale // TODO do we want this?
    {
        require(contributor != address(0));
        // if the user was already registered ensure that the new caps do not contradict their current contributions
        if(hasPreviouslyRegistered(contributor)){
            require(newCap >= balanceOf[contributor]);
        }
        require(newCap >= minContribution);
        registry[contributor] = true;
        cap[contributor] = newCap;
        rate[contributor] = newRate;
        RegistrationStatusChanged(contributor, true, newCap, newRate);
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
        assert(hasPreviouslyRegistered(contributor));
        registry[contributor] = false;
        RegistrationStatusChanged(contributor, false, cap[contributor], rate[contributor]);
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
        RegistrationStatusChanged(contributor, true, cap[contributor], rate[contributor]);
    }

    /**
     * @dev Sets registration statuses of addresses for participation.
     * @param contributors Addresses that will be registered/deregistered.
     * @param caps The maximum amount of wei that each user can contribute to cap
     */
    function registerUsers(address[] contributors, uint[] caps, uint[] rates)
        public
        onlyOwner
        //only24HBeforeSale // TODO do we want this?
    {
        // check that all arrays have the same length
        require(contributors.length == caps.length);
        require(contributors.length == rates.length);

        for (uint i = 0; i < contributors.length; i++) {
            registerUser(contributors[i], caps[i], rates[i]);
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
            onlyOwner
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
        balanceOf[_to] = balanceOf[_to].add(amountWei);
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
        if (amountRaised > fundingCap) {
            revert();
        } else if (amountRaised == fundingCap) {
            // Check if the funding cap have been reached
            fundingCapReached = true;
            saleClosed = true;
            CapReached(beneficiary, amountRaised);
        }
    }

    /**
     * Returns the current time.
     * Useful to abstract calls to "now" for tests.
    */
    function currentTime() constant returns (uint _currentTime) {
        return now;
    }
}
