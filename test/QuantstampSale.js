
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

  async function registerUser (user, cap1inETH, cap2inETH, cap3inETH, cap4inETH) {
      await sale.registerUser(user,
          util.toEther(cap1inETH), util.toEther(cap2inETH), util.toEther(cap3inETH), util.toEther(cap4inETH), {from : owner});
  }

  async function sendTransaction (value, user) {
      await sale.sendTransaction({value : util.toEther(value), from : user});
  }

  async function tokenBalanceOf (user) {
      return (await sale.tokenBalanceOf(user)).toNumber();
  }

  async function balanceOf (user) {
      return (await sale.balanceOf(user)).toNumber();
  }

  // ETH : QSP rates depending on the tier
  async function getTierRates () {
      const rate1 = (await sale.rate1()).toNumber();
      const rate2 = (await sale.rate2()).toNumber();
      const rate3 = (await sale.rate3()).toNumber();
      const rate4 = (await sale.rate4()).toNumber();
      return {rate1, rate2, rate3, rate4};
  }

  it("should sell tokens in the following order tier 3, tier 2, tier 1, tier 4 (skipping tiers)", async function() {
      const tiers = await getTierRates();
      // tier caps for each of the users
      const tier1cap = 2, tier2cap = 3, tier3cap = 4, tier4cap = 5;

      await token.setCrowdsale(sale.address, 0);
      await registerUser(user2, tier1cap, tier2cap, tier3cap, tier4cap);

      // 1 ETH is well below the tier 3 cap
      const contribution1 = 1;
      await sendTransaction(contribution1, user2);
      assert.equal(await tokenBalanceOf(user2), util.toQsp(tiers.rate3));
      assert.equal(await balanceOf(user2), util.toEther(contribution1));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(contribution1));

      // Sending more ETH should fill tier 3 and 2
      const contribution2 = 4;
      await sendTransaction(contribution2, user2);
      const maxQspTier3 = tiers.rate3 * tier3cap;
      assert.equal(await tokenBalanceOf(user2), util.toQsp(maxQspTier3 + (tiers.rate2 * 1)));
      assert.equal(await balanceOf(user2), util.toEther(contribution1 + contribution2));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(contribution1 + contribution2));

      const contribution3 = 1;
      await sendTransaction(contribution3, user2);
      assert.equal(await tokenBalanceOf(user2), util.toQsp(maxQspTier3 + (tiers.rate2 * 2)));
      assert.equal(await balanceOf(user2), util.toEther(contribution1 + contribution2 + contribution3));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(contribution1 + contribution2 + contribution3));

      // tiers 2, 1, and 4
      const contribution4 = 4;
      await sendTransaction(contribution4, user2);
      assert.equal(await tokenBalanceOf(user2), util.toQsp(maxQspTier3 + (tiers.rate2 * tier2cap) + (tiers.rate1 * tier1cap) + (tiers.rate4 * 1)));
      assert.equal(await balanceOf(user2), util.toEther(contribution1 + contribution2 + contribution3 + contribution4));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(contribution1 + contribution2 + contribution3 + contribution4));
  });

  it("should not allow to contribute more than allowed by the caps", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user3, 0, 0, 0, 1);
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
      const tiers = await getTierRates();
      await token.setCrowdsale(sale.address, 0);
      
      await registerUser(user4, 3, 0, 5, 1);
      await sendTransaction(2, user4);
      assert.equal(await tokenBalanceOf(user4), util.toQsp(2 * tiers.rate3));

      // lower the tier 3 cap, increase tier 2 cap, don't change tier 1 cap
      await registerUser(user4, 3, 1, 2, 1);
      await sendTransaction(2, user4);
      assert.equal(await tokenBalanceOf(user4), util.toQsp(2 * tiers.rate3 + tiers.rate2 + tiers.rate1));

      // lower the tier 1 cap below the already accepted tier 1 contribution
      await util.expectThrow(registerUser(user4, 0, 1, 2, 1));
  });

  it("should disallow unregistered users to buy tokens", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sendTransaction(1, user5));
  });

  it("should sell tokens in the following order tier 3, tier 2, tier 1, tier 4 (not skipping tiers)", async function() {
      const tiers = await getTierRates();
      // tier caps for each of the users
      const tier1cap = 1, tier2cap = 1, tier3cap = 1, tier4cap = 5;

      await token.setCrowdsale(sale.address, 0);
      await registerUser(user5, tier1cap, tier2cap, tier3cap, tier4cap);

      // 1 ETH is well below the tier 3 cap
      await sendTransaction(1, user5);
      assert.equal(await tokenBalanceOf(user5), util.toQsp(tiers.rate3));

      // Sending more ETH should fill tier 3 and 2
      await sendTransaction(1, user5);
      assert.equal(await tokenBalanceOf(user5), util.toQsp(tiers.rate3 + tiers.rate2));

      // test changing the caps in the middle (should not fail)
      await registerUser(user5, 0, tier2cap, tier3cap, tier4cap);
      await registerUser(user5, tier1cap, tier2cap, tier3cap, tier4cap);

      await sendTransaction(1, user5);
      assert.equal(await tokenBalanceOf(user5), util.toQsp(tiers.rate3 + tiers.rate2 + tiers.rate1));

      // tiers 2, 1, and 4
      await sendTransaction(1, user5);
      assert.equal(await tokenBalanceOf(user5), util.toQsp(tiers.rate3 + tiers.rate2 + tiers.rate1 + tiers.rate4));
      // forced to add to tier 4
      await sendTransaction(1, user5);

      // test changing the caps at the end (should not fail)
      await registerUser(user5, tier1cap, tier2cap, tier3cap, 3);
  });

   it("should not overflow the cap", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user5, 5, 5, 5, 5);
      await util.expectThrow(sendTransaction(2, user5));
  });

  it("should reach the cap", async function() {
      await token.setCrowdsale(sale.address, 0);
      await sendTransaction(1, user5);
      assert.equal(await sale.fundingCapReached(), true);
  });

   it("should reject transactions with 0 value", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sendTransaction(0, user5));
  });

  it("should reject caps below the min contribution", async function() {
      await token.setCrowdsale(sale.address, 0);
      const minimumContributionInWei = (await sale.minContribution()).toNumber();
      await util.expectThrow(sale.registerUser(user3, minimumContributionInWei - 1, 0, 0, 0, {from : owner}));
  });

  it("should reject the address 0", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(registerUser(0, 1, 1, 1, 1));
  });

  it("should deactivate only registered addresses", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sale.deactivate(accounts[6]));
  });

  it("should keep the balance constant before and after reactivation", async function() {
      await token.setCrowdsale(sale.address, 0);
      const balance = await tokenBalanceOf(user2);
      await sale.deactivate(user2);
      await sale.reactivate(user2);
      const balanceAfterReactivation = await tokenBalanceOf(user2);
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

