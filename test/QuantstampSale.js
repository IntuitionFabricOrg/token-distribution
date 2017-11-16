
var QuantstampSale = artifacts.require("./QuantstampMainSale.sol");
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

  async function registerUser (user) {
      await sale.registerUser(user, {from : owner});
  }

  async function sendTransaction (value, user) {
      await sale.sendTransaction({value : util.toEther(value), from : user});
  }

  async function balanceOf (user) {
      return (await token.balanceOf(user)).toNumber();
  }

  it("should sell tokens at a prespecified rate", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user2);

      // 1 ETH is well below the cap
      const contribution1 = 1;
      await sendTransaction(contribution1, user2);
      assert.equal(await balanceOf(user2), util.toQsp(await sale.RATE()));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(contribution1));

      // Sending more ETH to reach the cap
      const contribution2 = 4;
      const sum = contribution1 + contribution2;
      await sendTransaction(contribution2, user2);
      assert.equal(await balanceOf(user2), util.toQsp(sum * (await sale.RATE())));
      assert.equal((await sale.amountRaised()).toNumber(), util.toEther(sum));
  });

  it("should not allow to contribute more than allowed by the cap", async function() {
      await token.setCrowdsale(sale.address, 0);
      await registerUser(user3);
      if ((await sale.currentTime()) <= (await sale.capTime())) {
        await util.expectThrow(sendTransaction(16, user3));
      }
  });

  it("should not allow to contribute less than the min allowed amount of ETH", async function() {
      await token.setCrowdsale(sale.address, 0);
      await sale.registerUser(user3, {from:owner});
      const minimumContributionInWei = (await sale.minContribution()).toNumber();
      if (minimumContributionInWei > 0) {
          await util.expectThrow(sendTransaction(minimumContributionInWei - 1, user3));
      }
  });

  it("should disallow unregistered users to buy tokens", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sendTransaction(1, user5));
  });

  it("should reject transactions with 0 value", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sendTransaction(0, user5));
  });

  it("should reject the address 0", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sale.registerUser(0, {from:owner}));
  });

  it("should deactivate only registered addresses", async function() {
      await token.setCrowdsale(sale.address, 0);
      await util.expectThrow(sale.deactivate(accounts[6]));
  });

  it("should keep the balance constant before and after reactivation", async function() {
      await token.setCrowdsale(sale.address, 0);
      await sale.registerUser(user2);
      await sale.sendTransaction({value: util.twoEther, from:user2});

      const balance = await balanceOf(user2);
      await sale.deactivate(user2);
      await sale.registerUser(user2);
      const balanceAfterReactivation = await balanceOf(user2);
      assert.equal(balance, balanceAfterReactivation);
  });

  it("should reach the cap", async function() {
      await token.setCrowdsale(sale.address, 0);
      await sale.registerUser(user5, {from:owner});
      await sendTransaction(13, user5);
      assert.equal(await sale.fundingCapReached(), true);
  });
});

