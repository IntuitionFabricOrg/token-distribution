// These tests correspond with JIRA tickets

var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");


contract('QSP-11: Owner withdrawal', function(accounts) {
    // account[0] points to the owner on the testRPC setup
    var owner = accounts[0];
    var user1 = accounts[1];
    var user2 = accounts[2];
    var user3 = accounts[3];

    beforeEach(function() {
    return QuantstampSale.deployed().then(function(instance) {
        sale = instance;
        return QuantstampToken.deployed();
    }).then(function(instance2){
      token = instance2;
      return token.INITIAL_SUPPLY();
    });
    });

    it("owner should not be able to withdraw funds if the funding goal has not been reached", async function() {
        await token.setCrowdsale(sale.address, 0);
        let fundingGoal = (await sale.fundingGoal()).toNumber();

        let amountRaised = (await sale.amountRaised()).toNumber();
        let fundingGoalReached = await sale.fundingGoalReached();

        assert.equal(fundingGoalReached, false);
        assert.equal(amountRaised < fundingGoal, true);

        let beneficiary = await sale.beneficiary();

        // can owner can withdraw funds?
        util.expectThrow(sale.ownerSafeWithdrawal());
    });

  it("owner should be able to withdraw funds once funding goal is reached", async function() {
    await token.setCrowdsale(sale.address, 0);
    await sale.changeRegistrationStatus(user2, true, util.hundredEther, 5000, 0, {from:owner});

    let fundingGoal = (await sale.fundingGoal()).toNumber();
    console.log(fundingGoal);
    util.logEthBalances(token, sale, accounts);
    // this send cause the funding goal to be reached
    await sale.sendTransaction({value:fundingGoal, from:user2});
    console.log(fundingGoal);

    let amountRaised = (await sale.amountRaised()).toNumber();
    let fundingGoalReached = await sale.fundingGoalReached();

    assert.equal(fundingGoalReached, true);
    assert.equal(amountRaised, fundingGoal);

    let beneficiary = await sale.beneficiary();
    let beforeBalance = web3.eth.getBalance(beneficiary);

    // can owner can withdraw funds?
    await sale.ownerSafeWithdrawal();

    let afterBalance = web3.eth.getBalance(beneficiary);
    console.log("amountRaised  : " + amountRaised);
    console.log("beforeBalance : " + beforeBalance);
    console.log("afterBalance  : " + afterBalance);

    // now, the beneficiary should have the funds
    assert.equal(afterBalance > beforeBalance, true);

    // this should still be true unless something went wrong when sending funds to beneficiary
    fundingGoalReached = await sale.fundingGoalReached();
    assert.equal(fundingGoalReached, true);
  });

});