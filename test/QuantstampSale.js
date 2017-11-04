
var QuantstampSale = artifacts.require("./QuantstampSale.sol");
var QuantstampToken = artifacts.require("./QuantstampToken.sol");
var util = require("./util.js");

contract('QuantstampSale constructor', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];
  var user4 = accounts[4];
  var user5 = accounts[5];

  beforeEach(function() {
    return QuantstampSale.deployed().then(function(instance) {
        sale = instance;
        return QuantstampToken.deployed();
    }).then(function(instance2){
      token = instance2;
      return token.INITIAL_SUPPLY();
    });
  });

  async function registerUser (user, capInETH, rateInQSP) {
      await sale.registerUser(user, util.toEther(capInETH), rateInQSP, {from : owner});
  }

  async function sendTransaction (value, user) {
      await sale.sendTransaction({value : util.toEther(value), from : user});
  }

  async function balanceOf (user) {
      return (await token.balanceOf(user)).toNumber();
  }

  it("should sell tokens at a specified rate", async function() {
      const cap  = 5;
      const rate = 6123;

      await token.setCrowdsale(sale.address, 0);
      await registerUser(user2, cap, rate);

      // 1 ETH is well below the cap
      const contribution1 = 1;
      await sendTransaction(contribution1, user2);
      assert.equal(await balanceOf(user2), util.toQsp(rate));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(contribution1));

      // Sending more ETH to reach the cap
      const contribution2 = 4;
      const sum = contribution1 + contribution2;
      await sendTransaction(contribution2, user2);
      assert.equal(await balanceOf(user2), util.toQsp(sum * rate));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(sum));
  });

  it("should not allow to contribute more than allowed by the caps", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user3, 1, 6000);
      await util.expectThrow(sendTransaction(2, user3));
  });

  it("should not allow to contribute less than the min allowed amount of ETH", async function() {
      await token.setCrowdsale(sale.address, 0);
      const minimumContributionInWei = (await sale.minContribution()).toNumber();
      if (minimumContributionInWei > 0) {
          await util.expectThrow(sendTransaction(minimumContributionInWei - 1, user3));
      }
  });

  it("should allow to register the same user to update the caps if they don't conflict with contributions", async function() {
      const cap  = 5;
      const rate = 6123;
      await token.setCrowdsale(sale.address, 0);
      
      await registerUser(user4, cap, rate);
      await sendTransaction(2, user4);
      assert.equal(await balanceOf(user4), util.toQsp(2 * rate));

      // lower the cap
      await registerUser(user4, 4, rate);
      await sendTransaction(2, user4);
      assert.equal(await balanceOf(user4), util.toQsp(4 * rate));

      // lower the cap below the already accepted tier contribution
      await util.expectThrow(registerUser(user4, 3, rate));
  });

  it("should disallow unregistered users to buy tokens", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sendTransaction(1, user5));
  });

  it("should not overflow the cap", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user5, 20, 6000);
      await util.expectThrow(sendTransaction(12, user5));
  });

  it("should reach the cap", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user5, 20, 6000);
      await sendTransaction(11, user5);
      assert.equal(await sale.fundingCapReached(), true);
  });

  it("should reject transactions with 0 value", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sendTransaction(0, user5));
  });

  it("should reject caps below the min contribution", async function() {
      await token.setCrowdsale(sale.address, 0);
      const minimumContributionInWei = (await sale.minContribution()).toNumber();
      await util.expectThrow(sale.registerUser(user3, minimumContributionInWei - 1, 6000, {from : owner}));
  });

  it("should reject the address 0", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sale.registerUser(0, 20, 6000, {from : owner}));
  });

  it("should deactivate only registered addresses", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sale.deactivate(accounts[6]));
  });

  it("should keep the balance constant before and after reactivation", async function() {
      await token.setCrowdsale(sale.address, 0);
      const balance = await balanceOf(user2);
      await sale.deactivate(user2);
      await sale.reactivate(user2);
      const balanceAfterReactivation = await balanceOf(user2);
      assert.equal(balance, balanceAfterReactivation);
  });

  it("should reactivate only registered addresses", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sale.reactivate(accounts[6]));
  });

/*
  it("should be an allowance so that the crowdsale can transfer the tokens", async function() {
      let crowdSaleBalance = (await token.crowdSaleSupply()).toNumber();
      await token.setCrowdsale(sale.address, crowdSaleBalance);
      let allowance = (await token.allowance(owner, sale.address)).toNumber();
      assert.equal(allowance, crowdSaleBalance);
  });

  it("should be able to send tokens to user from crowdsale allowance", async function() {
      let allowance = (await token.allowance(owner, sale.address)).toNumber();
      await sale.testTransferTokens(user1, allowance);

      // user has received all the tokens
      let user1Balance = (await token.balanceOf(user1)).toNumber();
      assert.equal(user1Balance, allowance, "The user should have received all the tokens");

      // crowdsale allowance is now 0
      allowance = (await token.allowance(owner, sale.address)).toNumber();
      assert.equal(allowance, 0, "The crowdsale should have an allowance of 0");
  });

});


contract('QuantstampSale', function(accounts) {
  // account[0] points to the owner on the testRPC setup
  var owner = accounts[0];
  var user1 = accounts[1];
  var user2 = accounts[2];
  var user3 = accounts[3];

  it("should pause and not accept payment", function(done) {
      var amountEther = 6;
      var amountRaisedAfterTransaction = web3.toWei(5, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.pause();
      }).then(function(){
          return sale.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised changed even when paused");
      }).then(done).catch(done);
  });

  it("should not allow a user to unpause the contract", function(done) {
      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.unpause({from: user1});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.paused.call();
      }).then(function(value){
          console.log("paused: " + value)
          assert.equal(value, true, "The contract should not be paused by a user");
      }).then(done).catch(done);
  });

  it("should unpause and now accept payment", function(done) {
      var amountEther = 6;
      var amountRaisedAfterTransaction = web3.toWei(11, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return sale.unpause();
      }).then(function(){
          return sale.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(function(){
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised is not equal to the amount transferred");
      }).then(done).catch(done);
  });

  it("should not allow a user to pause the contract", function(done) {
      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.pause({from: user1});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.paused.call();
      }).then(function(value){
          console.log("paused: " + value)
          assert.equal(value, false, "The contract should not be paused by a user");
      }).then(done).catch(done);
  });

  it("should send an additional 10 ether to the crowdfunding campaign, exceeding the cap", function(done) {
      var amountEther = 10;
      var amountRaisedAfterTransaction = web3.toWei(20, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return instance.sendTransaction({from: user2, value: web3.toWei(amountEther, "ether")});
      }).then(function(){
          return sale.amountRaised.call();
      }).then(function(value){
          console.log("amountRaised: " + value)
          assert.equal(value, amountRaisedAfterTransaction, "AmountRaised is not equal to the amount transferred");
      }).then(done).catch(done);
  });

  it("should not accept payment after reaching the cap", function(done) {
      var amountEther = 3;
      var amountRaisedAfterTransaction = web3.toWei(20, "ether");

      QuantstampSale.deployed().then(function(instance) {
          sale = instance;
          return sale.sendTransaction({from: user3, value: web3.toWei(amountEther, "ether")});
      }).then(assert.fail).catch(function(error) {
          console.log(error.message);
          return sale.fundingCapIsReached.call();
      }).then(function(value){
          console.log("fundingCapIsReached: " + value);
          assert.equal(value, true, "AmountRaised changed even when paused");
      }).then(done).catch(done);
  });
*/
});

