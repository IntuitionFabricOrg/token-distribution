// These tests correspond with JIRA tickets

var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");


contract('SetCap', function(accounts) {
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

    it("user should be able to spend up to the cap after changed", async function() {
        await token.setCrowdsale(sale.address, 0);
        await sale.registerUser(user2, {from:owner});
        let cap = await sale.cap();

        await sale.sendTransaction({from:user2, value:cap});
        await util.expectThrow(sale.sendTransaction({from:user2, value:util.oneEther}));

        await sale.setCap(cap + util.oneEther, {from:owner});
        sale.sendTransaction({from:user2, value:util.oneEther});

        let bal = await sale.balanceOf(user2);
        assert.equal(bal, 16 * util.oneEther, "the final balance should be 16 ether");
    });
});