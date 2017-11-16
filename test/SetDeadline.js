// These tests correspond with JIRA tickets

var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");


contract('SetDeadline', function(accounts) {
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

    it("owner should be able to set deadline", async function() {
        await token.setCrowdsale(sale.address, 0);
        let time = Math.round(new Date().getTime() / 1000) + 3600; // 1 hour from now
        await util.expectThrow(sale.setDeadline(time, {from: user1}));

        await sale.setDeadline(time, {from:owner});

        let deadline = await sale.deadline();

        // now, the beneficiary should have the funds
        assert.equal(deadline, time, "The new deadline should be set to the specified time");
    });
});