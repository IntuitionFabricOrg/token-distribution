// These tests correspond with JIRA tickets

var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");


contract('SafeWithdrawal', function(accounts) {
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

    it("user should not be able to withdraw unless allowed and after deadline", async function() {
        await token.setCrowdsale(sale.address, 0);
        await sale.registerUser(user2, {from:owner});
        await sale.sendTransaction({from:user2, value:util.oneEther});
        await util.expectThrow(sale.safeWithdrawal({from:user2}));
        await util.expectThrow(sale.enableRefunds({from:owner}));

        await sale.setDeadline(1); // deadline is now right after the epoch
        let bal = await sale.balanceOf(user2);

        await  sale.safeWithdrawal({from:user2});
        let balAfter = await sale.balanceOf(user2); // should still be one ether (fails)

        await util.expectThrow(sale.enableRefunds({from:user2}));

        await sale.enableRefunds({from:owner});

        await sale.safeWithdrawal({from:user2});
        let balFinal = await sale.balanceOf(user2);

        assert.equal(bal.toNumber(), util.oneEther, "the before balance should be one ether");
        assert.equal(balAfter.toNumber(), util.oneEther, "the balance after deadline but before refunds should be one ether");
        assert.equal(balFinal.toNumber(), 0, "the final balance should be zero");
    });
});