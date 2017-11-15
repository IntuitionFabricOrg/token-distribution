var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");

var QuantstampSaleMock = artifacts.require('./helpers/QuantstampSaleMock.sol');
var bigInt = require("big-integer");
var util = require("../util.js");


contract('Missed-deadline Crowdsale', function(accounts) {
    // account[0] points to the owner on the testRPC setup
    var owner = accounts[0];
    var user1 = accounts[1];
    var user2 = accounts[2];
    var user3 = accounts[3];

    var sale2;

    beforeEach(function() {
        return QuantstampSale.deployed().then(function(instance) {
            sale = instance;
            return QuantstampToken.deployed();
        }).then(function(instance2){
            token = instance2;
            return token.INITIAL_SUPPLY();
        }).then(function(val){
            initialSupply = val.toNumber();
            return token.owner();
        }).then(function(owner){
            tokenOwner = owner;
            return token.CROWDSALE_ALLOWANCE();
        }).then(function(val){
            crowdsaleSupply = val.toNumber();
        });
    });

    it("should accept 2 ether for the crowdsale", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens
        await sale.registerUser(user2, {from:owner});
        let allowance = (await token.allowance(tokenOwner, sale.address)).toNumber();

        await sale.sendTransaction({from: user2,  value: util.twoEther});

        let allowanceAfter = (await token.allowance(tokenOwner, sale.address)).toNumber();
        let user2BalanceAfter = (await token.balanceOf(user2)).toNumber();
        let ownerBalanceAfter = (await token.balanceOf(owner)).toNumber();

        assert.equal(allowance - (util.twoEther * 5000), allowanceAfter, "The crowdsale should have sent amountWei*rate miniQSP");
        assert.equal(user2BalanceAfter, util.twoEther * 5000, "The user should have gained amountWei*rate miniQSP");
        assert.equal(allowanceAfter + user2BalanceAfter, allowance, "The total tokens should remain the same");
    });

    it("should not allow the purchase of tokens if the deadline is reached", async function() {
        // 0 indicates all crowdsale tokens
        var time = (new Date().getTime() / 1000);
        var futureTime = time + 130;

        let sale2 = await QuantstampSaleMock.new(accounts[1], 20, 1, time, 2, 15, 3, token.address);
        await token.setCrowdsale(sale2.address, 0); // ensures crowdsale has allowance of tokens
        await sale2.registerUser(user2, {from:owner});
        let nowtest = await sale2._now();

        let currentTime = (await sale2.currentTime());
        //let startTime = (await sale2.)

        currentTime = currentTime.toNumber();
        let endTime = await sale2.deadline();

        await sale2.sendTransaction({from: user2,  value: util.twoEther});

        await sale2.changeTime(futureTime);

        let afterTime = (await sale2.currentTime());
        await util.expectThrow(sale2.sendTransaction({from: user2,  value: util.oneEther}));

    });

});
