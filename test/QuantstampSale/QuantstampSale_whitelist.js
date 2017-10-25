var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");

var util = require("../util.js");
var bigInt = require("big-integer");

contract('Whitelist Crowdsale', function(accounts) {

    var owner = accounts[0];
    var beneficiary = accounts[1];
    var user2 = accounts[2];
    var user3 = accounts[3];
    var user4 = accounts[4];

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

    it("should add user2 to the whitelist", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens

        var r = await sale.changeRegistrationStatus(user2, true, util.twoEther, 5000, 0, {from:owner});

        assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, true, "isRegistered is wrong");
		assert.equal(r.logs[0].args.capInWei, util.twoEther, "capInWei is wrong");
		assert.equal(r.logs[0].args.rateQspToEther, 5000, "rateQspToEther is wrong");

		//let user2cap = await sale.userCapInWei.call(user2);
		//console.log(user2cap);

		var r = await sale.changeRegistrationStatus(user2, false, 0, 0, 0,{from:owner});
		assert.equal(r.logs[0].event, 'RegistrationStatusChanged', "event is wrong");
		assert.equal(r.logs[0].args.target, user2, "target is wrong");
		assert.equal(r.logs[0].args.isRegistered, false, "isRegistered is wrong");


    });

    it("should allow user2 to buy tokens up to their limit", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens

        var r = await sale.changeRegistrationStatus(user2, true, util.twoEther, 5000, 0, {from:owner});

        let user2Balance = (await token.balanceOf(user2)).toNumber();

        await sale.sendTransaction({from: user2,  value: util.oneEther});
        let user2BalanceAfter1 = (await token.balanceOf(user2)).toNumber();

        assert.equal(user2Balance + util.oneEther * 5000, user2BalanceAfter1, "token balance of user is incorrect");
        await sale.sendTransaction({from: user2,  value: util.oneEther});

        let user2BalanceAfter2 = (await token.balanceOf(user2)).toNumber();


        assert.equal(user2Balance + util.twoEther * 5000, user2BalanceAfter2, "token balance of user is incorrect");

        // should now fail
        await util.expectThrow(sale.sendTransaction({from: user2,  value: util.oneEther}));
    });

    it("should allow user3 to buy tokens with an initial balance", async function() {
        // 0 indicates all crowdsale tokens
        await token.setCrowdsale(sale.address, 0); // ensures crowdsale has allowance of tokens
        await sale.changeRegistrationStatus(user3, true, util.threeEther, 5000, util.oneEther, {from:owner});

        let tokenBalance = (await token.balanceOf(user3)).toNumber();
        let saleBalance = (await sale.balanceOf(user3)).toNumber();
        let offchainBalance = (await sale.offchainBalanceOf(user3)).toNumber();

        await sale.sendTransaction({from: user3,  value: util.oneEther});
        let tokenBalance2 = (await token.balanceOf(user3)).toNumber();
        let offchainBalance2 = (await sale.offchainBalanceOf(user3)).toNumber();
        let saleBalance2 = (await sale.balanceOf(user3)).toNumber();


        assert.equal(tokenBalance + util.oneEther * 5000, tokenBalance2, "token balance of user is incorrect");
        assert.equal(offchainBalance, util.oneEther, "user3 offchain balance is incorrect");
        assert.equal(offchainBalance2, util.oneEther, "user3 offchain balance should not change");

        assert.equal(saleBalance, 0, "the initial sale balanceOf the user should be 0");
        assert.equal(saleBalance2, util.oneEther, "the sale balanceOf the user after one transfer should be 1 ether");


        await sale.sendTransaction({from: user3,  value: util.oneEther});

        let tokenBalance3 = (await token.balanceOf(user3)).toNumber();
        let saleBalance3 = (await sale.balanceOf(user3)).toNumber();
        let offchainBalance3 = (await sale.offchainBalanceOf(user3)).toNumber();

        assert.equal(tokenBalance + util.twoEther * 5000, tokenBalance3, "token balance of user is incorrect");
        assert.equal(tokenBalance3, 3 * 5000 * util.oneEther, "token balance of user should be 15000 * ether");
        assert.equal(saleBalance3, util.twoEther, "the sale balanceOf the user after two transfers should be 2 ether");
        assert.equal(offchainBalance3, util.oneEther, "user3 offchain balance should still not change");

        // should now fail
        await util.expectThrow(sale.sendTransaction({from: user3,  value: util.oneEther}));
    });


});
