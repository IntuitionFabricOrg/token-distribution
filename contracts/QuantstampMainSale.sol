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
contract QuantstampMainSale is Pausable {

    using SafeMath for uint256;

    uint public constant RATE = 5000;       // constant for converting ETH to QSP
    uint public constant GAS_LIMIT_IN_WEI = 50000000000 wei;

    bool public fundingCapReached = false;  // funding cap has been reached
    bool public refundEnabled = false;      // customer refunds are enabled or not
    bool public saleClosed = false;         // crowdsale is closed or not
    bool private rentrancy_lock = false;    // prevent certain functions from recursize calls

    uint public fundingCap;                 // upper bound on amount that can be raised (in wei)
    uint256 public cap;                     // individual cap during initial period of sale

    uint public minContribution;            // lower bound on amount a contributor can send (in wei)
    uint public amountRaised;               // amount raised so far (in wei)
    uint public refundAmount;               // amount that has been refunded so far

    uint public startTime;                  // UNIX timestamp for start of sale
    uint public deadline;                   // UNIX timestamp for end (deadline) of sale
    uint public capTime;                    // Initial time period when the cap restriction is on

    address public beneficiary;             // The beneficiary is the future recipient of the funds

    QuantstampToken public tokenReward;     // The token being sold

    mapping(address => uint256) public balanceOf;   // tracks the amount of wei contributed by address
    mapping(address => bool) public registry;       // Registry of wallet addresses from whitelist

    // Events
    event CapReached(address _beneficiary, uint _amountRaised);
    event FundTransfer(address _backer, uint _amount, bool _isContribution);
    event RegistrationStatusChanged(address target, bool isRegistered);

    // Modifiers
    modifier beforeDeadline()   { require (currentTime() < deadline); _; }
    modifier afterDeadline()    { require (currentTime() >= deadline); _; }
    modifier afterStartTime()   { require (currentTime() >= startTime); _; }
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
     * @param initialCap                    initial individual cap
     * @param capDurationInMinutes          duration of initial individual cap
     * @param addressOfTokenUsedAsReward    address of the token being sold
     */
    function QuantstampMainSale(
        address ifSuccessfulSendTo,
        uint fundingCapInEthers,
        uint minimumContributionInWei,
        uint start,
        uint durationInMinutes,
        uint initialCap,
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
        deadline = start + (durationInMinutes * 1 minutes);
        capTime = start + (capDurationInMinutes * 1 minutes);
        cap = initialCap * 1 ether;
        tokenReward = QuantstampToken(addressOfTokenUsedAsReward);
    }


    function () payable {
        buy();
    }

    function buy()
        payable
        public
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

        amountRaised = amountRaised.add(amount);
        require(amountRaised <= fundingCap);

        // Update the sender's balance of wei contributed and the total amount raised
        balanceOf[msg.sender] = balanceOf[msg.sender].add(amount);

        if (currentTime() <= capTime) {
            require(tx.gasprice <= GAS_LIMIT_IN_WEI);
            require(balanceOf[msg.sender] <= cap);
        }

        // Transfer the tokens from the crowdsale supply to the sender
        if (!tokenReward.transferFrom(tokenReward.owner(), msg.sender, amount.mul(RATE))) {
            revert();
        }

        FundTransfer(msg.sender, amount, true);
        updateFundingCap();
    }

    function setCap(uint _cap) public onlyOwner {
        cap = _cap;
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
     * crowdsale allowance to the recipient (_to).
     *
     * NOTE: be extremely careful to get the amounts correct, which
     * are in units of wei and mini-QSP. Every digit counts.
     *
     * @param _to            the recipient of the tokens
     * @param amountWei     the amount contributed in wei
     * @param amountMiniQsp the amount of tokens transferred in mini-QSP
     */
    function allocateTokens(address _to, uint amountWei, uint amountMiniQsp) external
            onlyOwner nonReentrant
    {
        amountRaised = amountRaised.add(amountWei);
        require(amountRaised <= fundingCap);

        balanceOf[_to] = balanceOf[_to].add(amountWei);

        if (!tokenReward.transferFrom(tokenReward.owner(), _to, amountMiniQsp)) {
            revert();
        }

        FundTransfer(_to, amountWei, true);
        updateFundingCap();
    }

    /**
     * The owner can call this function to withdraw the funds that
     * have been sent to this contract. The funds will be sent to
     * the beneficiary specified when the crowdsale was created.
     */
    function ownerSafeWithdrawal() external onlyOwner nonReentrant {
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
    function enableRefunds() external afterDeadline onlyOwner {
        refundEnabled = true;
    }

    /**
     * This function permits anybody to withdraw the funds they have
     * contributed if and only if the deadline has passed and the
     * funding goal was not reached.
     */
    function safeWithdrawal() external afterDeadline nonReentrant {
        if (refundEnabled) {
            uint amount = balanceOf[msg.sender];
            balanceOf[msg.sender] = 0;
            if (amount > 0) {
                refundAmount = refundAmount.add(amount);
                msg.sender.transfer(amount);
                FundTransfer(msg.sender, amount, false);
            }
        }
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

    function setDeadline(uint timestamp) public onlyOwner {
        deadline = timestamp;
    }
}




