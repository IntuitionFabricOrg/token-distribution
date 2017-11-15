// Quantstamp Technologies Inc. (info@quantstamp.com)

pragma solidity ^0.4.15;

import './lifecycle/Pausable.sol';
import './math/SafeMath.sol';
import './QuantstampSale.sol';
// import './QuantstampToken.sol';

/**
 * The ExtendedQuantstampSale smart contract is used for selling QuantstampToken
 * tokens (QSP). It does so by converting ETH received into a quantity of
 * tokens that are transferred to the contributor via the ERC20-compatible
 * transferFrom() function.
 */
contract ExtendedQuantstampSale is Pausable {

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

    // For each user, specifies the cap (in wei)
    mapping(address => uint256) public cap;

    // Time period of sale (UNIX timestamps)
    uint public startTime;
    uint public endTime;

    // Keeps track of the amount of wei raised
    uint public amountRaised;

    // prevent certain functions from being recursively called
    bool private rentrancy_lock = false;

    // The token being sold
    // QuantstampToken public tokenReward;

    // A map that tracks the amount of wei contributed by address
    mapping(address => uint256) public balanceOf;

    // A map that tracks the amount of QSP tokens that should be hand-allocated
    mapping(address => uint256) public tokenBalanceOf;

    // Previously created contract
    QuantstampSale previousContract;

    // Events
    event CapReached(address _beneficiary, uint _amountRaised);
    event FundTransfer(address _backer, uint _amount, bool _isContribution);
    event RegistrationStatusChanged(address target, bool isRegistered, uint c);


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
     */
    function ExtendedQuantstampSale(
        address ifSuccessfulSendTo,
        uint fundingCapInEthers,
        uint minimumContributionInWei,
        uint start,
        uint durationInMinutes,
        address previousContractAddress
    ) {
        require(ifSuccessfulSendTo != address(0) && ifSuccessfulSendTo != address(this));
        require(durationInMinutes > 0);
        beneficiary = ifSuccessfulSendTo;
        fundingCap = fundingCapInEthers * 1 ether;
        minContribution = minimumContributionInWei;
        startTime = start;
        endTime = start + (durationInMinutes * 1 minutes);
        previousContract = QuantstampSale(previousContractAddress);
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
        buy();
    }

    function buy ()
        payable public
        whenNotPaused
        beforeDeadline
        afterStartTime
        saleNotClosed
        nonReentrant
    {
        uint amount = msg.value;
        require(amount >= minContribution);

        // ensure that the user adheres to whitelist restrictions
        require(registry[msg.sender]);

        // update the amount raised
        amountRaised = amountRaised.add(amount);
        require(getTotalAmountRaised() <= fundingCap);

        // update the sender's balance of wei contributed
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amount);
        require(getUserBalance(msg.sender) <= cap[msg.sender]);

        FundTransfer(msg.sender, amount, true);
        updateFundingCap();
    }

    function getTotalAmountRaised() public constant returns (uint) {
        return amountRaised.add(previousContract.amountRaised());
    }

    function getUserBalance(address user) public constant returns (uint) {
        return balanceOf[user].add(previousContract.balanceOf(user));
    }

    function setEndTime(uint timestamp) public onlyOwner {
        endTime = timestamp;
    }

    /**
     * @dev Check if a contributor was at any point registered.
     *
     * @param contributor Address that will be checked.
     */
    function hasPreviouslyRegistered(address contributor)
        internal
        constant
        returns (bool)
    {
        // if a cap for this customer exist, then the customer has previously been registered
        // we skip the caps from the previous contract
        return cap[contributor] > 0;
    }

    /*
    * If the user was already registered, ensure that the new caps do not conflict previous contributions
    *
    * NOTE: cannot use SafeMath here, because it exceeds the local variable stack limit.
    * Should be ok since it is onlyOwner, and conditionals should guard the subtractions from underflow.
    */
    function validateUpdatedRegistration(address addr, uint _cap)
        internal
        constant
        returns(bool)
    {
        return (getUserBalance(addr) <= _cap);
    }

    /**
     * @dev Sets registration status of an address for participation.
     *
     * @param contributor Address that will be registered/deregistered.
     * @param c The maximum amount of wei that the user can contribute
     */
    function registerUser(address contributor, uint c)
        public
        onlyOwner
    {
        require(contributor != address(0));
        // if the user was already registered ensure that the new caps do not contradict their current contributions
        if(hasPreviouslyRegistered(contributor)){
            require(validateUpdatedRegistration(contributor, c));
        }
        require(c >= minContribution);
        registry[contributor] = true;
        cap[contributor] = c;
        RegistrationStatusChanged(contributor, true, c);
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
        registry[contributor] = false;
        RegistrationStatusChanged(contributor, false, cap[contributor]);

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
        RegistrationStatusChanged(contributor, true, cap[contributor]);
    }

    /**
     * @dev Sets registration statuses of addresses for participation.
     * @param contributors Addresses that will be registered/deregistered.
     * @param caps The maximum amount of wei that each user can contribute to cap, in the same order as the addresses.
     */
    function registerUsers(address[] contributors, uint[] caps)
        external
        onlyOwner
    {
        // check that all arrays have the same length
        require(contributors.length == caps.length);

        for (uint i = 0; i < contributors.length; i++) {
            registerUser(contributors[i], caps[i]);
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
            external onlyOwner
    {
        require(addrs.length == weiAmounts.length);
        require(addrs.length == miniQspAmounts.length);
        for(uint i = 0; i < addrs.length; i++){
            ownerAllocateTokens(addrs[i], weiAmounts[i], miniQspAmounts[i]);
        }
    }

    /**
     *
     * The owner can allocate the specified amount of tokens from the
     * crowdsale allowance to the recipient (_to).
     *
     *
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
        // don't allocate tokens for the admin
        // require(tokenReward.adminAddr() != _to);

        amountRaised = amountRaised.add(amountWei);
        require(getTotalAmountRaised() <= fundingCap);

        tokenBalanceOf[_to] = tokenBalanceOf[_to].add(amountMiniQsp);
        balanceOf[_to] = balanceOf[_to].add(amountWei);

        FundTransfer(_to, amountWei, true);
        updateFundingCap();
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
     * Checks if the funding cap has been reached. If it has, then
     * the CapReached event is triggered.
     */
    function updateFundingCap() internal {
        uint amount = getTotalAmountRaised();
        assert (amount <= fundingCap);
        if (amount == fundingCap) {
            // Check if the funding cap has been reached
            fundingCapReached = true;
            saleClosed = true;
            CapReached(beneficiary, amount);
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