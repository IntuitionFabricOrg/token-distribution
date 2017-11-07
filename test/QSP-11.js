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

    it("owner should be able to withdraw funds once funding goal is reached", async function() {
        await token.setCrowdsale(sale.address, 0);
        await sale.registerUser(user2, util.oneEther, util.oneEther, util.oneEther, util.oneEther, {from:owner});

        util.logEthBalances(token, sale, accounts);
        // this send cause the funding goal to be reached
        var amt = util.oneEther;
        await sale.sendTransaction({value:amt, from:user2});

        let amountRaised = (await sale.amountRaised()).toNumber();

        assert.equal(amountRaised, amt);

        let beneficiary = await sale.beneficiary();
        let beforeBalance = web3.eth.getBalance(beneficiary).toNumber();

        // can owner can withdraw funds?
        await sale.ownerSafeWithdrawal();

        let afterBalance = web3.eth.getBalance(beneficiary);
        console.log("amountRaised  : " + amountRaised);
        console.log("beforeBalance : " + beforeBalance);
        console.log("afterBalance  : " + afterBalance);

        // now, the beneficiary should have the funds
        assert.equal(afterBalance > beforeBalance, true);
    });
});