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

    // limit gas price to 50 Gwei (wales stopper)
    uint public constant GAS_LIMIT_IN_WEI = 50000000000 wei;

    // Conversion rate by tier (QSP : ETHER)
    uint public constant RATE = 5000;

    // The beneficiary is the future recipient of the funds
    address public beneficiary;

    // The crowdsale has a funding cap, deadline, and minimum contribution
    uint public fundingCap;
    uint public minContribution;
    bool public fundingCapReached = false;
    bool public saleClosed = false;

    // Whitelist data
    mapping(address => bool) public registry;

    // Specifies the cap (in wei) that can be contributed when the cap restrition is on
    uint256 public cap;

    // Time period of sale (UNIX timestamps)
    uint public startTime;
    uint public endTime;
    // Time period when the cap restriction is on
    uint public capTime;

    // Keeps track of the amount of wei raised
    uint public amountRaised;

    // prevent certain functions from being recursively called
    bool private rentrancy_lock = false;

    // The token being sold
    QuantstampToken public tokenReward;

    // A map that tracks the amount of wei contributed by address
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public presaleBalanceOf;


    // Events
    event CapReached(address _beneficiary, uint _amountRaised);
    event FundTransfer(address _backer, uint _amount, bool _isContribution);
    event RegistrationStatusChanged(address target, bool isRegistered);


    // Modifiers
    modifier beforeDeadline()   { require (currentTime() < endTime); _; }
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
        uint tmpCap,
        uint capDurationInMinutes,
        address addressOfTokenUsedAsReward
    ) {
        require(ifSuccessfulSendTo != address(0) && ifSuccessfulSendTo != address(this));
        require(addressOfTokenUsedAsReward != address(0) && addressOfTokenUsedAsReward != address(this));
        require(durationInMinutes > 0);
        beneficiary = ifSuccessfulSendTo;
        fundingCap = fundingCapInEthers * 1 ether;
        minContribution = minimumContributionInWei;
        startTime = start;
        endTime = start + (durationInMinutes * 1 minutes);
        capTime = start + (capDurationInMinutes * 1 minutes);
        cap = tmpCap;
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

        // Update the sender's balance of wei contributed and the total amount raised
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amount);

        if (currentTime() <= capTime) {
            require(tx.gasprice <= GAS_LIMIT_IN_WEI);
            require(balanceOf[msg.sender] <= cap);
        }

        amountRaised = amountRaised.add(amount);
        require(amountRaised <= fundingCap);

        // Transfer the tokens from the crowdsale supply to the sender
        if (!tokenReward.transferFrom(tokenReward.owner(), msg.sender, amount.mul(RATE))) {
            revert();
        }

        FundTransfer(msg.sender, amount, true);
        updateFundingCap();
    }

    function getUserBalance(address user) public constant returns (uint) {
        return balanceOf[user].add(presaleBalanceOf[user]);
    }

    function setEndTime(uint timestamp) public onlyOwner {
        endTime = timestamp;
    }

    function setTmpCap(uint tmpCap) public onlyOwner {
        cap = tmpCap;
    }

    /**
     * @dev Sets registration status of an address for participation.
     *
     * @param contributor Address that will be registered/deregistered.
     */
    function registerUser(address contributor)
        public
        onlyOwner
    {
        require(contributor != address(0));
        registry[contributor] = true;
        RegistrationStatusChanged(contributor, true);
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
        RegistrationStatusChanged(contributor, false);

    }

    /**
     * @dev Sets registration statuses of addresses for participation.
     * @param contributors Addresses that will be registered/deregistered.
     */
    function registerUsers(address[] contributors)
        external
        onlyOwner
    {
        for (uint i = 0; i < contributors.length; i++) {
            registerUser(contributors[i]);
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
        amountRaised = amountRaised.add(amountWei);
        require(amountRaised <= fundingCap);

        presaleBalanceOf[_to] = presaleBalanceOf[_to].add(amountWei);

        if (!tokenReward.transferFrom(tokenReward.owner(), _to, amountMiniQsp)) {
            revert();
        }

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
        assert (amountRaised <= fundingCap);
        if (amountRaised == fundingCap) {
            // Check if the funding cap has been reached
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
