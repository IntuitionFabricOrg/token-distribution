// These tests correspond with JIRA tickets

var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");


contract('CapExceeded', function(accounts) {
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

    it("user should be able to exceed the global cap but only gain tokens up to the cap", async function() {
        await token.setCrowdsale(sale.address, 0);
        await sale.registerUser(user2, {from:owner});
        await sale.registerUser(user3, {from:owner});
        let cap = await sale.cap();

        await sale.sendTransaction({from:user2, value:cap});
        await util.expectThrow(sale.sendTransaction({from:user2, value:util.oneEther}));

        sale.sendTransaction({from:user3, value:15*util.oneEther});

        let bal2 = await sale.balanceOf(user2);
        let tokenbal2 = (await token.balanceOf(user2)).toNumber();

        console.log(tokenbal2);
        let bal3 = await sale.balanceOf(user3);

        let tokenbal3 = (await token.balanceOf(user3)).toNumber();

        assert.equal(bal2, 15 * util.oneEther, "the final balance of user2 should be 15 ether");
        assert.equal(bal3, 5 * util.oneEther, "the final balance of user3 should be 5 ether");
        assert.equal(tokenbal2, 15 * 5000 * util.oneEther, "user2 token balance is wrong")
        assert.equal(tokenbal3, 5 * 5000 * util.oneEther, "user3 token balance is wrong")
    });
});